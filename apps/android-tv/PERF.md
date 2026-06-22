# Phase 13 — Performance Plan: Chromecast HD

**Target device**: Chromecast HD (Amlogic S4, 4×Cortex-A35, 1.4 GB RAM, 128 MB heap cap)
**ADB**: `adb -s 192.168.178.114:42177`
**Baseline**: 73% janky frames · 129 ms median frame · 76 high-input-latency events · 257 MB RSS · heavy swap
**Success targets**: <20% janky · <32 ms median · input latency ≈0 · PSS ≤180 MB during browse

---

## Verified findings (from code review)

### CRITICAL — `MiniPlayerRow` (BrowseScreen.kt:382–509)

```kotlin
// Line 383 — new ExoPlayer every time the composable enters composition
val player = remember { ExoPlayer.Builder(context).build() }

// Line 385 — starts decode+playback immediately on channel select
DisposableEffect(channel.streamUrl) {
    player.setMediaItem(MediaItem.fromUri(channel.streamUrl))
    player.prepare()
    player.playWhenReady = true
    onDispose { }  // ← does NOTHING — player never pauses when URL changes
}
```

Confirmed problems:
1. New `ExoPlayer` per composable (not per ViewModel) — destroyed/recreated on recomposition
2. `onDispose` of the stream `DisposableEffect` is empty — player never pauses when channel changes
3. Only the outer `DisposableEffect(Unit)` releases the player — fires only when `MiniPlayerRow` leaves composition entirely
4. Video decode + Compose recomposition on a 4×A35 SoC = high input latency on every D-pad press

### HIGH — `HomeViewModel.kt:122` calls `getPlaylist()` (full catalog)

```kotlin
val playlist = playlistManager.getPlaylist()  // line 122
```

`getPlaylist()` reads all three slices (live + vod + series) into memory and stores them in
`memoryCache` as one merged `Playlist`. Once Home runs, `memoryCache` holds the full ~85k-channel
catalog. Subsequent `getLiveGroups()` calls from `BrowseViewModel` then hit the memory-cache
path at `PlaylistManager.kt:188` and filter from that full object — the per-kind disk
optimization (`live.json` only) is short-circuited. **The per-kind split only helps on cold
starts before Home loads.**

### HIGH — `FocusableCard.kt:46` — `animateFloatAsState` on every focusable

```kotlin
val scale by animateFloatAsState(
    targetValue = if (isFocused) 1.05f else 1f,
    label = "focusScale",
)
```

`animateFloatAsState` spins a Choreographer animation on every focus enter/leave. On
Chromecast's weak CPU this keeps the UI thread busy during D-pad navigation.

### HIGH — Standard `LazyColumn` / `LazyVerticalGrid` (not TV variants)

- `BrowseScreen.kt:294` — `LazyColumn` for channel table (not `TvLazyColumn`)
- `BrowseScreen.kt:840` — `LazyColumn` for groups sidebar (not `TvLazyColumn`)
- `VodBrowseScreen.kt:235` — `LazyVerticalGrid` for poster grid (not TV grid)
- `SeriesBrowseScreen.kt` — same pattern as VOD
- `AGENTS.md:114` explicitly requires **"always prefer these over standard Compose LazyColumn/LazyRow"**
- Known `ContentInViewNode` crashes are already being suppressed in `IptvTavernApp.kt:19` —
  that crash comes from standard Compose scroll + TV focus interaction; TV variants fix the root cause

### MEDIUM — Per-row mutable focus state in large lists

Every visible row in `ChannelTableRow` and group sidebar has:
```kotlin
var isFocused by remember { mutableStateOf(false) }
```
Each D-pad keypress triggers `onFocusChanged` on the losing item AND the gaining item →
two recompositions per keypress across visible rows. With 50–100 visible rows this adds up.

### MEDIUM — `isMinifyEnabled = false` on release (`app/build.gradle.kts:41`)

```kotlin
release {
    isMinifyEnabled = false  // no R8/ProGuard on release build
```

No bytecode optimization, no dead-code removal, larger dex. R8 + shrinking reduces APK size
and improves class loading on cold start.

### LOW — `delay()` chains on every focus restore

Multiple `LaunchedEffect` blocks across browse screens do:
```kotlin
delay(100)
initialFocusDone = true
delay(50)
try { channelTableFocusRequester.requestFocus() } catch (_: Throwable) {}
```
On a device with high scheduling jitter these delays compound during tab switching and group
selection. Several can be reduced or collapsed.

### LOW — Cache write errors silently swallowed (`PlaylistManager.kt:326`)

```kotlin
cacheScope.launch {
    try {
        cacheStore.writePlaylist(playlist)
    } catch (_: Throwable) { /* best-effort */ }
```
Silent failures hide why the cache is cold on repeated launches, making perf regressions hard
to diagnose.

---

## Measurement commands

Run before and after each step:

```bash
# Reset frame stats, navigate for ~30s with D-pad, then capture
adb -s 192.168.178.114:42177 shell dumpsys gfxinfo com.iptvtavern.androidtv reset
# [navigate: Live tab → switch 5 groups → D-pad 20 channels → VOD tab → Series tab]
adb -s 192.168.178.114:42177 shell dumpsys gfxinfo com.iptvtavern.androidtv
adb -s 192.168.178.114:42177 shell dumpsys meminfo com.iptvtavern.androidtv
```

Key metrics to record per run:

| Metric | Baseline | Target |
|---|---|---|
| Janky frames % | 73% | <20% |
| Median frame time | 129 ms | <32 ms |
| 90th percentile frame | 800 ms | <50 ms |
| High input latency events | 76 | ~0 |
| PSS | 257 MB | ≤180 MB |

---

## Implementation steps

### Step 1 — Fix MiniPlayerRow ExoPlayer lifecycle [CRITICAL]

**File**: `ui/browse/BrowseScreen.kt`

**Fix B (quick win — remove auto-play)**

Show channel logo/name in `MiniPlayerRow` with no `ExoPlayer` until the user explicitly presses
OK/Select on the mini player row. Eliminates all video decode during list navigation.

Change in `MiniPlayerRow`: remove both `DisposableEffect` blocks and the `AndroidView`. Replace
the player viewport with the channel logo (`AsyncImage`) or a static backdrop. Start playback
only on explicit Select press (which already calls `onGoFullScreen`).

**Fix A (follow-up — hoist to ViewModel)**

Move `ExoPlayer` creation into `BrowseViewModel`. Single player, created once, reused on channel
switch, released in `onCleared()`.

```kotlin
// BrowseViewModel.kt additions
private var _miniPlayer: ExoPlayer? = null

fun getMiniPlayer(context: Context): ExoPlayer =
    _miniPlayer ?: ExoPlayer.Builder(context).build().also { _miniPlayer = it }

fun playInMiniPlayer(channel: Channel) {
    _uiState.value = _uiState.value.copy(playingChannel = channel)
    _miniPlayer?.apply {
        setMediaItem(MediaItem.fromUri(channel.streamUrl))
        prepare()
        playWhenReady = true
    }
    viewModelScope.launch { profileRepository.addRecent(channel.id) }
}

override fun onCleared() {
    super.onCleared()
    _miniPlayer?.release()
    _miniPlayer = null
}
```

In `MiniPlayerRow`: remove `remember { ExoPlayer.Builder(context).build() }` and both
`DisposableEffect` blocks. Receive the player as a parameter passed from `BrowseScreen`.

**Order**: land Fix B first, measure, then land Fix A.

---

### Step 2 — Fix full-catalog memory load from HomeViewModel [HIGH]

**Files**: `data/repository/PlaylistManager.kt`, `ui/home/HomeViewModel.kt`

**Problem**: `HomeViewModel.loadCatalog()` calls `getPlaylist()` which reads all 3 slices into
`memoryCache`. After that, `getLiveGroups()` from `BrowseViewModel` hits the `memoryCache` path
and filters from the full 85k-channel `Playlist` — not the cheap `live.json` disk slice.

**Part 1 — Change HomeViewModel to use per-kind reads (do first)**

```kotlin
// HomeViewModel.kt — replace getPlaylist() with per-kind reads
val liveGroups  = playlistManager.getLiveGroups()
val vodGroups   = playlistManager.getVodGroups()
val seriesGroups = playlistManager.getSeriesGroups()

val liveCount   = liveGroups?.sumOf  { it.channels.size } ?: 0
val vodCount    = vodGroups?.sumOf   { it.channels.size } ?: 0
val seriesCount = seriesGroups?.sumOf { it.channels.size } ?: 0

// For recents + continue-watching, flatten only what is needed:
val allChannels = (liveGroups.orEmpty() + vodGroups.orEmpty() + seriesGroups.orEmpty())
    .flatMap { it.channels }
```

This removes the need to ever call `getPlaylist()` from Home. The three slices stay separate;
`memoryCache` is never populated with the merged object during normal browse flows.

**Part 2 — Split `memoryCache` per-kind in `PlaylistManager` (larger refactor)**

Store three separate in-memory caches instead of one merged `Playlist`:

```kotlin
// PlaylistManager.kt
@Volatile private var liveMemoCache: Pair<String, List<ChannelGroup>>? = null
@Volatile private var vodMemoCache:  Pair<String, List<ChannelGroup>>? = null
@Volatile private var seriesMemoCache: Pair<String, List<ChannelGroup>>? = null
```

`getLiveGroups()` populates only `liveMemoCache`. `getVodGroups()` populates only `vodMemoCache`.
Neither triggers loading the other two. This caps peak in-memory catalog to the largest single
kind (~vod at ~25 MB on-disk, roughly proportional in memory) rather than all three summed.

Assess whether Part 1 alone is sufficient by measuring PSS after it lands before doing Part 2.

---

### Step 3 — Migrate to TV Lazy components [HIGH]

**Files**: `ui/browse/BrowseScreen.kt`, `ui/vod/VodBrowseScreen.kt`, `ui/series/SeriesBrowseScreen.kt`

Replace standard Compose lazy containers with TV variants per AGENTS.md requirement:

| Old import | New import |
|---|---|
| `androidx.compose.foundation.lazy.LazyColumn` | `androidx.tv.foundation.lazy.list.TvLazyColumn` |
| `androidx.compose.foundation.lazy.items` | `androidx.tv.foundation.lazy.list.items` |
| `androidx.compose.foundation.lazy.itemsIndexed` | `androidx.tv.foundation.lazy.list.itemsIndexed` |
| `androidx.compose.foundation.lazy.rememberLazyListState` | `androidx.tv.foundation.lazy.list.rememberTvLazyListState` |
| `androidx.compose.foundation.lazy.grid.LazyVerticalGrid` | `androidx.tv.foundation.lazy.grid.TvLazyVerticalGrid` (check availability in `tv-foundation:1.0.0-alpha11`) |

**Per screen**:

- `BrowseScreen.kt:294` — channel table `LazyColumn` → `TvLazyColumn`
- `BrowseScreen.kt:840` — groups sidebar `LazyColumn` → `TvLazyColumn`
- `VodBrowseScreen.kt:235` — poster grid `LazyVerticalGrid` → `TvLazyVerticalGrid`
- `VodBrowseScreen.kt:806` — groups sidebar `LazyColumn` → `TvLazyColumn`
- `SeriesBrowseScreen.kt` — same pattern as VOD

**After migration**: remove or downgrade the `ContentInViewNode` crash suppressor in
`IptvTavernApp.kt:19` — it was a workaround for the standard Compose scroll+focus bug.

**Risk**: `TvLazyColumn` API differs slightly from `LazyColumn`. Test:
- D-pad scroll behavior (selected item scrolls into view)
- `key { }` blocks still work (they do)
- `rememberTvLazyListState` + `scrollToItem()` still works (it does)

---

### Step 4 — Reduce focus animation cost [MEDIUM]

**File**: `ui/components/FocusableCard.kt`

**Option A — Disable scale animation on low-RAM devices**

```kotlin
// FocusableCard.kt
val activityManager = LocalContext.current
    .getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
val isLowRam = activityManager.memoryClass <= 128

val scale = if (isLowRam) {
    if (isFocused) 1.05f else 1f  // instant, no animation
} else {
    animateFloatAsState(targetValue = if (isFocused) 1.05f else 1f, label = "focusScale").value
}
```

**Option B — Remove scale, rely on border only**

The 3dp accent border is visible from 10ft. Scale is a secondary indicator. Removing it
eliminates the `animateFloatAsState` entirely.

**Inline rows** (`ChannelTableRow`, `VodPosterTile`): these don't use `FocusableCard`, so
no change needed. The per-row `isFocused` state is unavoidable.

**Verify** `remember(channel.id)` (not `remember(channel.name)`) wraps `inferStreamQualityHints`
calls — `channel.name` is stable within a render but `id` is more semantically correct.

---

### Step 5 — Coil image optimizations [MEDIUM]

**Files**: `ui/browse/BrowseScreen.kt`, `ui/vod/VodBrowseScreen.kt`, app-level Coil setup

**A) Explicit size for channel logos**

```kotlin
// BrowseScreen.kt — ChannelTableRow AsyncImage
AsyncImage(
    model = ImageRequest.Builder(LocalContext.current)
        .data(channel.logoUrl)
        .size(72)         // 36dp × 2x density — no 4K decode for a 36dp icon
        .crossfade(false) // eliminates crossfade frame work during list scroll
        .build(),
    contentDescription = channel.name,
    modifier = Modifier.size(36.dp).clip(RoundedCornerShape(4.dp)),
    contentScale = ContentScale.Fit,
)
```

**B) App-level `ImageLoader` memory cache limit**

Default Coil uses 25% of heap = 32 MB on a 128 MB device. Reduce to 15%:

```kotlin
// In Hilt ApplicationModule or Application.onCreate
val imageLoader = ImageLoader.Builder(context)
    .memoryCache {
        MemoryCache.Builder(context)
            .maxSizePercent(0.15)
            .build()
    }
    .build()
Coil.setImageLoader(imageLoader)
```

---

### Step 6 — Enable R8 on release build [LOW]

**File**: `app/build.gradle.kts:41`

```kotlin
release {
    isMinifyEnabled = true   // was false
    isShrinkResources = true // add
    proguardFiles(
        getDefaultProguardFile("proguard-android-optimize.txt"),
        "proguard-rules.pro"
    )
}
```

Add to `proguard-rules.pro` to protect Kotlinx Serialization:

```
-keep class com.iptvtavern.androidtv.domain.model.** { *; }
-keepattributes *Annotation*
-if @kotlinx.serialization.Serializable class **
-keepclassmembers class <1> {
    static <1>$Companion Companion;
}
-if @kotlinx.serialization.Serializable class ** {
    static **$serializer INSTANCE;
}
-keepclassmembers class <1> {
    static <1>$serializer INSTANCE;
}
```

Test release APK on Chromecast before shipping — verify serialization round-trips correctly
with minification enabled.

---

### Step 7 — Collapse focus-restore delays [LOW]

**Files**: `BrowseScreen.kt`, `VodBrowseScreen.kt`, `SeriesBrowseScreen.kt`

| Location | Current delays | Recommended |
|---|---|---|
| `BrowseScreen.kt:137` initial focus | `delay(100)` + `delay(50)` | Single `delay(80)` |
| `BrowseScreen.kt:157` post-filter focus | `delay(100)` | Keep (covers animation) |
| `BrowseScreen.kt:222` sidebar→channel jump | `delay(100)` | Reduce to `delay(50)` |
| `VodBrowseScreen.kt:136` initial focus | `delay(100)` + `delay(50)` | Single `delay(80)` |
| `VodBrowseScreen.kt:163` modal focus | `delay(150)` | Keep (modal animation) |
| `BrowseViewModel.kt:239` group filter spinner | `delay(150)` | Keep (intentional) |

Test each change on device — if focus jumps become visible, revert that specific one.

---

### Step 8 — Log cache write failures [LOW]

**File**: `data/repository/PlaylistManager.kt:326`

```kotlin
cacheScope.launch {
    try {
        cacheStore.writePlaylist(playlist)
    } catch (e: Throwable) {
        Log.w(TAG, "Playlist cache write failed for ${source.id}", e)
    }
}
```

Not a perf fix directly, but diagnosing why the cache is cold on repeated launches is critical
for perf investigation on a device with storage pressure.

---

## Execution order

| # | Step | File(s) | Impact | Risk | Measure after? |
|---|---|---|---|---|---|
| 1 | MiniPlayer Fix B — remove auto-play | BrowseScreen.kt | Very high | Low | Yes |
| 2 | MiniPlayer Fix A — hoist to ViewModel | BrowseScreen.kt, BrowseViewModel.kt | High | Medium | Yes |
| 3 | HomeViewModel per-kind reads (Part 1) | HomeViewModel.kt | High | Low | Yes |
| 4 | Migrate to TvLazyColumn/Grid | BrowseScreen, VodBrowseScreen, SeriesBrowseScreen | High | Medium | Yes |
| 5 | FocusableCard scale removal/guard | FocusableCard.kt | Medium | Low | No |
| 6 | Coil size hints + no crossfade | BrowseScreen.kt, VodBrowseScreen.kt | Medium | Low | No |
| 7 | Coil memory cache limit | App module / Application | Medium | Low | Yes |
| 8 | PlaylistManager per-kind memCache (Part 2) | PlaylistManager.kt | Medium | Medium | Yes |
| 9 | R8/minify on release | app/build.gradle.kts | Low–medium | Medium | Yes |
| 10 | Collapse focus delays | Browse screens | Low | Low | No |
| 11 | Cache error logging | PlaylistManager.kt | Diagnostic | None | No |

Stop implementing and re-measure after steps 1, 2, 3, and 4. If targets are met, steps 5–11
are polish — do them anyway but they are not blockers.

---

## Open questions (answer before implementing)

1. **Mini player UX (Step 1)**: Fix B removes auto-play — mini player shows static channel
   info until the user presses Select, which then starts playback (or goes fullscreen). Is that
   acceptable UX, or must the mini player always auto-play immediately on channel select?

2. **HomeViewModel refactor scope (Step 3 Part 2)**: Split `memoryCache` per-kind in
   `PlaylistManager` is the most correct fix but also the largest internal refactor. Do Part 1
   alone first and measure — if PSS drops enough, Part 2 can wait.

3. **Release build (Step 6)**: Current APK on device is debug. Can you build and sideload a
   release APK for comparison? Need a keystore or test-signing config in `local.properties`.

4. **TvLazyVerticalGrid availability (Step 4)**: `tv-foundation:1.0.0-alpha11` — confirm
   `TvLazyVerticalGrid` exists in that version before migrating VOD/Series grids. If not
   available, `LazyVerticalGrid` stays and only the `LazyColumn` variants migrate.
