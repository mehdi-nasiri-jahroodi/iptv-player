# Android TV App — Feature Inventory & Roadmap

> Reference for the `apps/android-tv/` client. Part 1 documents what **exists today** (verified against source, v0.1.6 / versionCode 7). Part 2 proposes **features to add**, prioritized.
> Source of truth for phase status: [`apps/android-tv/PLAN.md`](../apps/android-tv/PLAN.md) (Phases 1–12 done, 13–14 pending).

---

## Part 1 — Existing Features

### App foundation

| Concern | Implementation |
| ------- | -------------- |
| Platform target | Android TV (leanback `required=true`, touchscreen `required=false`), `minSdk 21`, `targetSdk 35` |
| UI | Jetpack Compose for TV + **Lumina** design system (shared tokens with web) |
| Theme | Light / Dark / System |
| DI | Hilt (Dagger) |
| Persistence | Room (structured) + DataStore (KV settings) |
| Serialization | Kotlinx Serialization, aligned with `packages/core` JSON Schemas |
| Image loading | Coil |
| Navigation | Compose Navigation |
| Playback | Media3 / ExoPlayer (HLS + DASH) + ffmpeg decoder for AC3/EAC3/MP2 |
| Crash reporting | Local file rotation + optional Telegram / HTTP webhook |

### Onboarding (first-run wizard)

3-step wizard (`OnboardingScreen.kt`):
1. **Responsibility notice** — legal acknowledgement (same copy as web).
2. **Add source** — M3U URL or Xtream Codes, with validation; skippable.
3. **Profile name** — display name.

### Sources

- **M3U URL** source: URL, optional EPG URL, optional per-source User-Agent, label.
- **Xtream Codes** source: host, username, password, optional EPG URL, label.
- **Source validation** (`SourceValidator.kt`) — reachability check + parse sample; typed error codes (`invalid_url`, `unreachable`, `parse_error`, `empty_content`).
- **Multiple sources** — active-source switcher on Home; per-source catalog.
- **Edit / delete** sources from Settings.
- **Refresh** — re-fetch + invalidate Xtream cache for a source.
- **Xtream account snapshot** — status, expiry date, max/active connections shown in Settings.

### Parsing

- **M3U parser** (`M3uParser.kt`) — `#EXTINF` attrs (`group-title`, `tvg-logo`, `tvg-id`, `tvg-name`), catchup metadata, `#EXTGRP` fallback, live-vs-VOD heuristic (duration `-1` → live).
- **XMLTV parser** (`EpgParser.kt`) — timezone-aware program parsing, `nowAndNextProgram`, `flatProgramsInWindow`.
- **Quality badge heuristics** (`LiveChannelBadges.kt`) — 4K / FHD / HD detection from channel name.
- **Xtream client** (`XtreamClient.kt`) — full player-API coverage (live/vod/series categories, streams, info) + cached info fetchers with TTLs (categories 1h, streams 10min, info 24h).

### Home screen

- Catalog tiles (Live TV / Movies / Series) with channel counts.
- Active source badge + **Refresh** button.
- **Source switcher** (when >1 source).
- **Continue Watching** rail — VOD/series with progress bars.
- **Recently Watched** rail — live channels.
- **"Now on Your Favorites"** EPG spotlight rail.

### Live TV browse (`BrowseScreen.kt`)

- Groups sidebar + channel table (logo, name, group, quality badge, favorite star).
- **Favorites** virtual group (pinned at top).
- **Channel search** (dialog input — keyboard doesn't ambush D-pad nav).
- **Group search / filter**.
- **Group sort** — key (default / name / size) + direction.
- **Group reordering** — Red-button toggle mode, move up/down, persisted per source.
- **Inline mini player** — preview channel in a small viewport while browsing (hoisted to ViewModel, single ExoPlayer).
- Now/next EPG per channel row (minute-clock refresh).

### VOD (Movies) browse (`VodBrowseScreen.kt`)

- Poster grid (2:3 tiles) with categories sidebar.
- **Detail hero** — backdrop, poster, plot, cast, director, genre, rating, year, duration.
- **Xtream enrichment** — `get_vod_info` fetched on focus.
- **Sorting** — title / year / rating / duration / date added, asc/desc.
- Search + favorites.

### Series browse (`SeriesBrowseScreen.kt`)

- Poster grid with season/episode count badges + watched-progress strip.
- **Season tabs** (horizontal) + **episode list** (vertical, scrollable).
- Xtream `get_series_info` enrichment.
- Episode stream-URL resolution (container extension handling).
- **Watched tracking** — episode markers + progress; resume from last position.
- Favorites.

### Playback (`PlayerScreen.kt` / `PlayerViewModel.kt`)

- Fullscreen Media3 player for **live / VOD / series episodes**.
- **D-pad controls** — Up/Down = channel zap (live), Left/Right = seek (VOD).
- **Channel zapping** — `ChannelUp/Down` buttons, wraps, minimizes time-to-picture.
- **Previous channel** jump-back (Green button).
- **Series prev/next episode** navigation (bounded, no wrap).
- **Audio track picker** (multi-track streams).
- **Subtitle track picker** + disable subtitles (ExoPlayer extracts embedded subs natively).
- **Seek bar** (VOD) with ±10s / ±2m jumps.
- **Resume** from saved position for VOD/series.
- **Watched-progress persistence** (`WatchedRepository`).
- **Channel info overlay** — name, logo, now/next EPG, index/total, LIVE/VOD badge.
- **Auto-hide overlay** after 5s (resets on any key while overlay open).
- **Error overlay** — human-readable messages mapped from Media3 codes + **Retry** + **Copy Diagnostics** to clipboard.
- **Live playback failover** — cycles alternate stream URLs on AV break / error.
- **Catchup / timeshift** — replays past programs from catchup-capable live channels. "⏮ Catchup" button in the player overlay opens a program picker (past + currently-airing programs within `catchupDays`); selecting one builds a URL per mode (Xtream `timeshift` path, M3U `catchup-source` template, or `append`/`shift`/`flussonic` fallback) and plays it as a seekable stream. "● Return to Live" exits catchup.

### EPG (`EpgScreen.kt`)

- Today + tomorrow program grid per channel.
- **"On air"** highlighting.
- Horizontal timeline scroll; Up/Down between channels.
- Now/next surfaced on channel rows + player overlay.

### Settings

- **Profile** — display name edit.
- **About** — app version.
- **Appearance** — theme toggle.
- **Player** — buffer mode (balanced / aggressive / conservative).
- **Sources** — list with Xtream account info, add / edit / delete.

### Backup & Restore

- **Export** — JSON file via Storage Access Framework (sources, playlists, profile, settings).
- **Import** — JSON file, with overwrite warning.
- **Cross-platform** — same v1 format as web's `lumina-backup.ts` (web ↔ Android TV round-trip).

### Crash reporting (`CrashReporter.kt`)

- Local crash files (rotated, max 20) retrievable via `adb pull`.
- Optional **Telegram bot** webhook (formatted HTML message).
- Optional generic HTTP webhook (JSON payload).
- Device + memory diagnostics included.

---

## Part 2 — Features to Add

Prioritized by user impact. Each entry notes **why**, **effort** (S/M/L), and the **phase** it would fall under.

### Tier 1 — High impact, finish the MVP promise

#### 1. Picture-in-Picture (PiP) for live TV
- **Why**: Lean-back UX expectation; user can browse/check another app without dropping the channel. Planned in Phase 13, not yet in manifest.
- **How**: `android:supportsPictureInPicture="true"` on MainActivity, enter PiP on Home press during playback, handle `onPictureInPictureModeChanged`.
- **Effort**: M · **Phase 13**

#### 2. Catchup / timeshift playback — ✅ IMPLEMENTED
- **Why**: Channel model already carries `catchupMode` / `catchupDays` / `catchupSource` (`Channel.kt`), and `packages/core` ships `buildCatchupUrl` — big differentiator for live TV.
- **How**: `CatchupUrlBuilder` resolves Xtream `timeshift` path (ported from `packages/core`), M3U `catchup-source` template substitution (`${start}`/`${end}`/`${duration}`/`${timestamp}`…), and per-mode fallback (`append`/`shift`/`flussonic`). `CatchupSupport` computes the playable window + past EPG programs. Player overlay exposes "⏮ Catchup" → program picker; selection plays as seekable VOD with "● Return to Live". Files: `domain/catchup/*`, `PlayerViewModel.playCatchupProgram`/`exitCatchup`, `PlayerScreen` `CatchupPickerOverlay`.
- **Effort**: L · **Phase 13+**

#### 3. Performance pass (from `PERF.md`)
- **Why**: Baseline on Chromecast HD is 73% janky frames / 129ms median frame — the app is borderline unusable on the cheapest TV stick.
- **Wins already scoped**: migrate `LazyColumn`/`LazyVerticalGrid` → TV variants, fix `MiniPlayerRow` ExoPlayer lifecycle, per-kind memory cache split, R8/minify on release, Coil size hints + cache cap.
- **Effort**: M (mostly mechanical) · **Phase 13**

#### 4. M3U file import + raw paste
- **Why**: Onboarding/Add Source is URL-only today; users with local `.m3u` files can't import. Deferred in Phase 5.
- **How**: Storage Access Framework file picker (already used by backup) → read text → run existing `parseM3uToPlaylist`. Add a "Paste M3U text" textarea for advanced users.
- **Effort**: S · **Phase 5 follow-up**

#### 5. Trailer playback for VOD
- **Why**: `Channel.Vod.trailerUrl` is parsed and stored but never surfaced — the "Trailer" button from the plan was dropped. Cheap value-add.
- **How**: Play trailerUrl in the player (or hand off to an external app via `ACTION_VIEW`). Add a Trailer button in the VOD detail hero.
- **Effort**: S · **Phase 9 follow-up**

### Tier 2 — Discovery & personalization

#### 6. Multiple user profiles
- **Why**: `UserProfile` model + `ProfileDao` exist but only a default profile is used. Family households want separate favorites/recents/continue-watching. Listed in `docs/features.md` and Phase future.
- **How**: Profile switcher in Settings/onboarding, key all per-profile data by profileId, PIN-optional guest mode.
- **Effort**: M · **Post-MVP**

#### 7. Continue Watching for live (last-watched position + resume)
- **Why**: Continue Watching currently covers VOD/series only. Live channels appear in "Recently Watched" but tapping doesn't resume at a meaningful state. For catchup-capable channels, resume to last live position.
- **Effort**: M (depends on #2 catchup)

#### 8. "Up Next" / reminders from EPG
- **Why**: EPG data is rich but passive. Let users mark a future program and get notified (or auto-tune) when it starts.
- **How**: Room table of `programId`/`startMs` + a WorkManager check; show a toast/dialog when within 1 min.
- **Effort**: M · **Phase 13+**

#### 9. Cross-channel EPG grid with time scrubber
- **Why**: Current EPG screen is per-channel horizontal lists. A true multi-channel vertical grid (channels on Y, time on X) is the expected TV EPG layout and easier to scan.
- **Effort**: M

#### 10. Hidden groups & per-group pin
- **Why**: Large playlists have dozens of junk groups. Users want to hide noise. Listed in `features.md` "Next".
- **Effort**: S (DataStore set of hidden group IDs + filter in `buildDisplayGroups`)

#### 11. Search across everything (unified)
- **Why**: Search is per-browse-screen today. A global search (live + VOD + series + EPG programs in one results screen) matches how users actually look for content.
- **Effort**: M

#### 12. "Recommended" / recently added rail
- **Why**: Xtream VOD exposes `addedAtSec`; with no curation users can't find new content. A "Newly Added" rail sorted by date is near-free.
- **Effort**: S

### Tier 3 — Sources & accounts

#### 13. Source health monitoring & auto-failover across sources
- **Why**: A source going down = blank app. Background health check + surface "Source X may be down" + offer to switch to a backup source for a channel.
- **Effort**: M

#### 14. Expiry warnings for Xtream accounts
- **Why**: Account snapshot has `expDate`. Warn before expiry (Home banner / Settings badge) so users aren't surprised by a dead source.
- **Effort**: S

#### 15. QR-code onboarding for source URL
- **Why**: Typing a long URL with a TV remote is painful. Generate a QR the user scans with their phone to push the URL. Listed in `features.md` and Phase future.
- **How**: Web companion endpoint or a local HTTP server on the TV; or use Android's nearby-share-style flow.
- **Effort**: L · **Post-MVP**

#### 16. EPG URL auto-discovery
- **Why**: Many M3U playlists include `x-tvg-url` in the header. Auto-suggest the EPG URL instead of forcing manual entry.
- **Effort**: S

### Tier 4 — Playback polish

#### 17. Sleep timer
- **Why**: Common TV use case — fall asleep watching. Timer to pause/stop playback after N minutes.
- **Effort**: S

#### 18. Playback speed control (VOD/series)
- **Why**: ExoPlayer supports it natively (`setPlaybackParameters`); useful for slow/fast content. Add 0.75×–2× in the overlay.
- **Effort**: S

#### 19. Skip intro / skip credits
- **Why**: Streaming-app expectation. Heuristic: detect repeated intro region (same first N seconds across episodes) or use Xtream-provided markers if available.
- **Effort**: M (heuristic) / S (if markers provided)

#### 20. Background audio-only mode
- **Why**: Planned in Phase 13. When user hits Home, keep audio playing (foreground service) for music/news channels.
- **Effort**: M · **Phase 13**

#### 21. Multi-audio language preference
- **Why**: Player has a track picker but no preference. Remember "always pick Spanish audio" / "always subs on" per profile.
- **Effort**: S

#### 22. Screenshot / frame capture (disabled for DRM)
- **Why**: Diagnostics + share. Low priority but cheap with ExoPlayer's `PlayerView`.
- **Effort**: S

### Tier 5 — Settings & system

#### 23. Kiosk / restricted mode (PIN lock)
- **Why**: Lock Settings behind a PIN so kids/guests can't delete sources or change config. Listed in `features.md` "Later".
- **Effort**: M

#### 24. Cloud backup sync
- **Why**: Backup is manual file export today. Optional encrypted cloud sync (user-chosen backend — WebDAV, Google Drive, etc.) so favorites/watch-progress survive device changes.
- **Effort**: L · **Post-MVP**

#### 25. Auto-update EPG on a schedule
- **Why**: EPG currently loads on source open. A daily WorkManager refresh keeps "now/next" accurate for always-on devices.
- **Effort**: S

#### 26. Network/bandwidth limiter
- **Why**: Cap ExoPlayer bandwidth for metered connections or weak Wi-Fi. Map to `TrackSelectionParameters` max bitrate.
- **Effort**: S

#### 27. App shortcuts (long-press launcher)
- **Why**: Android TV launcher supports `<meta-data android:name="android.app.shortcuts">` — "Open Live TV", "Open Favorites" jump points.
- **Effort**: S

### Tier 6 — Accessibility & a11y (Phase 13 scope)

#### 28. TalkBack audit + content descriptions
- **Why**: Phase 13 task. Currently most composables lack `contentDescription`; screen-reader users can't navigate.
- **Effort**: M · **Phase 13**

#### 29. High-contrast / large-text accessibility option
- **Why**: Not all users sit 3m away; some have low vision. A "larger text" toggle scales typography beyond the system setting.
- **Effort**: S

#### 30. Focus-indicator consistency audit
- **Why**: Phase 13 task. Some inline rows (e.g. `ChannelTableRow`, `VodPosterTile`) don't use `FocusableCard` — verify every focusable shows a ring from 10ft.
- **Effort**: S · **Phase 13**

### Tier 7 — Developer / operational

#### 31. CI pipeline (Phase 14)
- **Why**: No automated builds/lint today. GitHub Actions: `./gradlew lint` + `assembleDebug` on every PR; Nx target wiring.
- **Effort**: M · **Phase 14**

#### 32. JSON Schema contract tests (web ↔ Android drift)
- **Why**: Risk register flags this. Parse sample JSON fixtures in `src/test` and assert against `packages/core/schemas/*.schema.json`.
- **Effort**: M · **Phase 14**

#### 33. In-app diagnostics / debug panel
- **Why**: "Copy diagnostics" exists for player errors only. A hidden dev panel (long-press version in About) showing cache sizes, last fetch times, device caps helps support.
- **Effort**: M

#### 34. Contract for promoting shared logic to KMP
- **Why**: Several pure functions (M3U parse, EPG, VOD sort, badges) are duplicated TS↔Kotlin. Evaluate a Kotlin Multiplatform `packages/core-kmp` so there's one source of truth.
- **Effort**: L · **Long-term**

---

## Quick-pick recommendation

If shipping polish fast, do in order: **3 (perf)** → **28/30 (a11y)** → **1 (PiP)** → **4 (file import)** → **5 (trailer)** → **10 (hidden groups)** → **17 (sleep timer)** → **25 (EPG auto-refresh)**.

If maximizing user value, prioritize: **6 (profiles)** → **11 (global search)** → **13 (source failover)** → **15 (QR onboarding)**. (#2 catchup shipped.)
