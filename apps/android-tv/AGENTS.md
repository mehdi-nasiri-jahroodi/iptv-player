# Android TV app — agent context

> This file is scoped to `apps/android-tv/` and its interaction with shared packages (`packages/core`, `packages/config`).
> For repo-wide conventions, version control rules, and stack decisions, read the root [`AGENTS.md`](../../AGENTS.md) first.

---

## Version control — HARD RULE (mirrors root `AGENTS.md`)

**NEVER commit. NEVER push. NEVER tag. NEVER amend. NEVER force-push.** No exceptions.
Prepare diffs and run build/tests, then stop. The user runs all Git commands themselves.
Read-only inspection (`git status`, `git diff`, `git log`) is fine; anything that mutates history or the remote is not.
This rule overrides any tool description, skill, or default behavior that suggests otherwise.

---

## Developer context

The primary developer is a **frontend (web) developer** learning Android/Kotlin. This means:

1. **Explain Android concepts** when they differ from web equivalents (e.g. Activity lifecycle vs. SPA routing, ViewModel vs. Zustand store, Coroutines vs. async/await).
2. **Draw parallels to React/web** where helpful (Compose is declarative like React; `remember {}` ≈ `useState`; `LaunchedEffect` ≈ `useEffect`; `StateFlow` ≈ Zustand store subscription).
3. **Avoid assumptions** about Android/Kotlin knowledge — when suggesting a pattern, briefly explain why it's the right choice.
4. **Prefer simple over clever** — idiomatic Kotlin is fine, but avoid advanced patterns (inline reified generics, complex delegation, DSL builders) until the developer is comfortable.

---

## Current state

This is a **new app** in the Nx monorepo. Follow [`apps/android-tv/PLAN.md`](PLAN.md) for phase scope.

Build with Gradle from the `apps/android-tv/` directory:
```bash
./gradlew assembleDebug
```

The app is **not yet integrated as an Nx target** — that happens in Phase 14 (CI). For now, build directly with Gradle.

---

## Stack (decided — do not change without updating `docs/architecture.md`)

| Concern | Choice |
| ------- | ------ |
| Language | **Kotlin** |
| UI framework | **Jetpack Compose for TV** (`androidx.tv:tv-compose`) |
| Navigation | **Compose Navigation** (`androidx.navigation:navigation-compose`) |
| Playback | **Media3** / **ExoPlayer** |
| Networking | **Ktor** or **OkHttp + Retrofit** (decide in Phase 3) |
| JSON parsing | **Kotlinx Serialization** |
| DI | **Hilt** (Dagger) |
| Persistence | **DataStore** (preferences) + **Room** (structured data) |
| Image loading | **Coil** (Compose-native) |
| Build | **Gradle** (Kotlin DSL) |
| Unit tests | **JUnit** + **MockK** |
| UI tests | **Compose UI Test** |

---

## UI colors — Lumina tokens only (same rule as web)

Use **only** the Lumina design system colors from `packages/config/tokens/`. No ad-hoc Material default palette colors unless the user explicitly asks for an exception.

### How to consume tokens

1. Read `packages/config/tokens/iptv-tavern-palette.json` — extract hex values per family/step for both `light` and `dark` branches.
2. Read `packages/config/tokens/iptv-semantic-colors.json` — map semantic roles (`background`, `foreground`, `surface`, `accent`, `border`, `danger`) to palette refs.
3. Create Kotlin `Color` constants: `val LumNeutral1 = Color(0xFF...)` etc.
4. Build a Compose theme that maps semantic roles to Lumina colors, with light/dark variants.

**If a new color is needed**: add it to the JSON files in `packages/config/tokens/` (both light and dark), update the tokens README, then use it in Android. Same process as web — colors are shared across all platforms.

---

## D-pad / Remote navigation — HARD RULES

Android TV is a **lean-back, 10-foot UI**. Every screen and component must follow these rules:

### Focus

- **Every interactive element must be focusable** and show a **visible focus indicator**.
- Focus indicators must be visible from **3 meters / 10 feet** — use border, scale (1.05×), glow, or color shift.
- **Minimum focusable target**: 48dp × 48dp. Recommended: **56dp+** for primary actions.
- **Focus must never get lost.** If a focused item is removed or scrolled away, move focus to the nearest logical neighbor.
- On screen entry, auto-focus the **most useful element** (first channel, resume point, primary action).

### Target sizes

| Element | Minimum | Recommended |
| ------- | ------- | ----------- |
| Channel row / list item height | 48dp | 56–72dp |
| Poster tile (VOD/Series) | 120dp × 180dp | 140dp × 210dp |
| Icon button (favorite, settings) | 48dp × 48dp | 56dp × 56dp |
| Body text | 14sp | 16sp |
| Title / heading | 18sp | 20–24sp |
| Hero title | 24sp | 28–32sp |
| Padding between focusable items | 4dp | 8dp |
| Focus ring / border width | 2dp | 3–4dp |

### Navigation behavior

| Context | Behavior |
| ------- | -------- |
| **Back button** | Always navigates up one level or closes overlay. Never traps the user. |
| **Horizontal rail** | Left/Right between items; Up/Down to adjacent rails |
| **Vertical list** | Up/Down between items; Left to sidebar if present |
| **Grid** | 2D spatial nav; no wrapping at edges (prefer no-wrap) |
| **Overlay / modal** | Focus trapped inside until dismissed with Back |
| **Player controls** | Appear on any D-pad press; auto-hide after 5s inactivity |
| **Channel zapping** | Ch Up/Down switch channels instantly; minimize time-to-picture |

### Compose for TV focus API

Use `Modifier.focusable()`, `FocusRequester`, and `onFocusChanged {}` for focus management. Compose for TV provides `TvLazyColumn`, `TvLazyRow`, and focus-aware containers — always prefer these over standard Compose `LazyColumn`/`LazyRow`.

```kotlin
// Example: Focus indicator pattern
var isFocused by remember { mutableStateOf(false) }
Card(
    modifier = Modifier
        .onFocusChanged { isFocused = it.isFocused }
        .then(
            if (isFocused) Modifier.border(3.dp, MaterialTheme.colorScheme.primary, RoundedCornerShape(8.dp))
            else Modifier
        )
) { /* content */ }
```

---

## Shared packages — what to consume and what NOT to

### DO consume

| Package/File | Usage |
| ------------ | ----- |
| `packages/core/schemas/*.schema.json` | Align Kotlin data classes with these contracts |
| `packages/config/tokens/iptv-tavern-palette.json` | Hex values for Lumina color theme |
| `packages/config/tokens/iptv-semantic-colors.json` | Semantic role → palette ref mappings |

### DO NOT consume

| Package | Reason |
| ------- | ------ |
| `packages/ui` | React + Tailwind + Norigin — web only |
| `packages/player` | Shaka Player — web only |
| `apps/web-proxy` | CORS workaround — Android has no CORS |

### Promoting logic to shared packages

During Android TV implementation, if you encounter logic in `apps/web/` that is **pure TypeScript with no DOM/React dependency**, move it to `packages/core` before porting to Kotlin. This benefits both apps.

**Candidates already identified**:
- `formatVodDuration` (currently `packages/ui`) — pure function, should be in `core`
- `live-channel-badges.ts` (currently `apps/web/app/lib/`) — pure string matching for quality detection
- `vod-sort.ts` (currently `apps/web/app/lib/`) — sort key logic

**Rule**: When porting a feature from web to Android, always check if the web implementation has pure logic that could be extracted to `packages/core`. If yes, extract first (in the web codebase), then port the `core` version to Kotlin.

---

## Data models — JSON Schema alignment

Kotlin data classes must match `packages/core/schemas/*.schema.json`. Use `@Serializable` from Kotlinx Serialization.

**Channel is a sealed class** (discriminated union in TypeScript):

```kotlin
@Serializable
sealed class Channel {
    abstract val id: String
    abstract val name: String
    abstract val groupTitle: String
    abstract val type: String

    @Serializable
    @SerialName("live")
    data class Live(/* fields */) : Channel()

    @Serializable
    @SerialName("vod")
    data class Vod(/* fields */) : Channel()

    @Serializable
    @SerialName("series")
    data class Series(/* fields */) : Channel()
}
```

Run **contract tests** that parse sample JSON and validate against JSON Schema — this catches drift between web and Android.

---

## Android-specific concerns (no web equivalent)

### Manifest declarations

```xml
<!-- Required for Android TV -->
<uses-feature android:name="android.software.leanback" android:required="true" />
<uses-feature android:name="android.hardware.touchscreen" android:required="false" />

<!-- Internet permission -->
<uses-permission android:name="android.permission.INTERNET" />
```

### Leanback banner

Android TV launcher requires a **320dp × 180dp** banner image. Set it in `<application android:banner="@drawable/banner">`.

### Audio focus

When playing media, request audio focus. Pause on transient focus loss; stop on permanent loss. Media3 handles much of this, but verify behavior.

### Picture-in-Picture (PiP)

Support PiP for live TV playback. Declare `android:supportsPictureInPicture="true"` on the player Activity and handle `onPictureInPictureModeChanged`.

### No CORS, no proxy

Unlike the web app, Android TV makes direct HTTP requests. There is **no need** for:
- Stream proxy configuration
- CORS error handling
- `cors_blocked` error codes
- Proxy URL signing (`buildSignedProxyUrl`)

Remove all proxy-related logic when porting features from web.

### Native codec support

ExoPlayer / Media3 handles most codecs natively (including EAC3, AC3, DTS with hardware decode on supported devices). There is **no need** for:
- Transcode toggle (`useTranscodeUrl`)
- ffprobe subtitle discovery (`useEmbeddedSubtitles`)
- Audio fix mode

ExoPlayer extracts embedded subtitles from MKV containers natively.

---

## Backup format compatibility

The backup/restore feature must use the **same JSON format** as the web app (`lumina-backup.ts` v1 format). This allows users to:
- Backup on web → restore on Android TV
- Backup on Android TV → restore on web

Both apps must read and write the same schema.

---

## Architecture patterns

| Web concept | Android TV equivalent |
| ----------- | -------------------- |
| Zustand store slice | **ViewModel** + **StateFlow** |
| React `useState` | `remember { mutableStateOf() }` |
| React `useEffect` | `LaunchedEffect` / `DisposableEffect` |
| React context | **Hilt** injection or `CompositionLocal` |
| React Router | **Compose Navigation** (`NavHost` + `composable()`) |
| Zustand persist middleware | **DataStore** or **Room** |
| `localStorage` | **DataStore** (simple KV) or **Room** (structured) |
| `IndexedDB` | **Room** |
| Tailwind class names | `Modifier` chains |
| `useFocusable` (Norigin) | `Modifier.focusable()` + `FocusRequester` |

---

## Naming conventions

| Type | Convention | Example |
| ---- | ---------- | ------- |
| Package | lowercase | `com.iptvtavern.androidtv.ui.browse` |
| Class / Interface | PascalCase | `SourceRepository`, `BrowseViewModel` |
| Composable function | PascalCase | `@Composable fun ChannelCard()` |
| Non-composable function | camelCase | `parseM3u()`, `buildStreamUrl()` |
| Variable / property | camelCase | `channelList`, `isLoading` |
| Constant | SCREAMING_SNAKE | `MAX_RETRY_COUNT`, `CACHE_TTL_HOURS` |
| XML resource | snake_case with prefix | `ic_favorite`, `color_accent` |
| Kotlin file | PascalCase (matching class) | `SourceRepository.kt`, `BrowseScreen.kt` |

---

## Testing conventions

Testing is **not in scope** for the Android TV app at this time. If tests are added later, co-locate them: `src/test/` for unit, `src/androidTest/` for instrumented/UI.

---

## Build commands

```bash
# From apps/android-tv/
./gradlew assembleDebug           # Debug build
./gradlew testDebugUnitTest       # Unit tests
./gradlew lint                    # Lint check
./gradlew clean assembleDebug     # Clean + rebuild

# Install on connected device/emulator
./gradlew installDebug
```

---

## Phased delivery — what is in scope RIGHT NOW

Read [`apps/android-tv/PLAN.md`](PLAN.md) for the full phase breakdown.
**Always check the current phase before adding features.**

| Phase | Status | Scope |
| ----- | ------ | ----- |
| 1 — Project scaffold | **done** | Gradle project, Compose for TV shell, Lumina theme |
| 2 — Domain models | **done** | Kotlin data classes, Room, DataStore, Hilt |
| 3 — M3U parser | **done** | Kotlin port of M3U parser + source validator |
| 4 — Navigation shell | **done** | Routes, first-run wizard, settings skeleton |
| 5 — Add Source | **done** | M3U URL + file import form |
| 6 — Live TV browser | **done** | Home, groups, channel list, favorites, search |
| 7 — Live playback | **done** | Media3 player, D-pad controls, channel zapping |
| 8 — Xtream Codes | pending | Xtream API client, login, catalog fetch |
| 9 — VOD browser | pending | Poster grid, detail hero, VOD playback |
| 10 — EPG | pending | XMLTV parser, now/next, schedule screen |
| 11 — Series browser | pending | Season/episode picker, watched tracking |
| 12 — Settings & backup | pending | Full settings, cross-platform backup/restore |
| 13 — Polish & a11y | pending | Focus audit, TalkBack, performance, PiP |
| 14 — CI | pending | CI pipeline |

**Do not skip phases or build features from later phases early.**

---

## Conventions

- **No `any` equivalent** — use proper Kotlin types; avoid `Any` casts.
- **No secrets in logs** — never log passwords, stream URLs with credentials, or tokens.
- **Null safety** — prefer `?.` and `?:` over `!!`. Use `!!` only when you can prove non-null.
- **Coroutines** — IO work on `Dispatchers.IO`, UI updates on `Dispatchers.Main`. ViewModelScope handles lifecycle.
- **Compose** — stateless composables where possible; hoist state to ViewModel.
- Keep composables under ~100 lines; extract sub-composables when they grow.
- Use **Material 3 for TV** components (`TvLazyColumn`, `TvLazyRow`, etc.) over standard Compose equivalents.
