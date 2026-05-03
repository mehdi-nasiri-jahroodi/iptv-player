# Android TV App — Implementation Plan

> **Scope**: Second client per the delivery order in `platforms.md` (Web → **Android TV** → LG webOS).
> The web app is the reference implementation — features proven there are ported to Android TV with native UX.
> This plan assumes a frontend developer learning Android/Kotlin. Each phase is small, self-contained, and ends with a working build.

---

## 0. How to read this plan

- **Phases are intentionally small.** Each one adds a visible, testable slice.
- **Exit criteria** tell you when a phase is done — do not move on until every criterion is met.
- **"Web parity" column** in each phase links the equivalent web feature so you can reference working code.
- If a utility already exists in `packages/core` (TypeScript), check whether the Android equivalent should consume the **JSON Schema** contracts from `packages/core/schemas/` or reimplement logic in Kotlin. Prefer contract sharing; avoid duplicating business rules.

---

## 1. Relationship with shared packages

### What Android TV consumes from the monorepo

| Package | What Android uses | How |
| ------- | ----------------- | --- |
| `packages/core/schemas/*.schema.json` | Domain contracts (Channel, Source, Playlist, EpgGuide, etc.) | Generate or hand-write Kotlin data classes aligned with these JSON Schemas |
| `packages/config/tokens/iptv-tavern-palette.json` | Color hex values for Lumina parity | Read JSON → map to Compose `Color(0xFF...)` constants |
| `packages/config/tokens/iptv-semantic-colors.json` | Semantic role mappings (background, foreground, accent, etc.) | Map to Compose theme roles |

### What Android TV does NOT use

- React, Tailwind, Norigin Spatial Navigation, Shaka Player, Zustand — all web-only.
- `packages/ui` and `packages/player` — React component libraries.
- `apps/web-proxy` — Android TV does not need a CORS proxy; native HTTP clients have no CORS restrictions.

### Promoting shared logic

During implementation, if you find logic in `apps/web/` that is **pure TypeScript with no DOM/React dependency** and would benefit Android (via a future KMP module or duplicated Kotlin port), flag it for extraction to `packages/core`. Examples:
- M3U parsing heuristics (already in `core`)
- Xtream URL builders (already in `core`)
- VOD duration formatting (currently in `packages/ui` — pure function, could move to `core`)
- EPG now/next calculation (already in `core`)
- Quality badge heuristics (`live-channel-badges.ts` in `apps/web` — pure string matching, candidate for `core`)

**Rule**: Any time during Android TV implementation you see something in the web project that is already implemented and can be reused by Android, move it to `packages/core` (or create a new shared package) so both apps benefit.

---

## 2. Technology stack (decided — mirrors `docs/architecture.md`)

| Layer | Technology |
| ----- | ---------- |
| Language | **Kotlin** |
| UI framework | **Jetpack Compose for TV** (`androidx.tv:tv-compose`) |
| Navigation | **Compose Navigation** (`androidx.navigation:navigation-compose`) |
| Playback | **Media3** / **ExoPlayer** (`androidx.media3:media3-exoplayer`, `media3-ui-compose`) |
| Networking | **Ktor** (HTTP client) or **OkHttp** + **Retrofit** |
| JSON parsing | **Kotlinx Serialization** (aligned with JSON Schema contracts) |
| DI | **Hilt** (Dagger) |
| Persistence | **DataStore** (preferences) + **Room** (structured data) |
| Image loading | **Coil** (Compose-native) |
| Build | **Gradle** (Kotlin DSL) |

---

## 3. D-pad / Remote navigation — TV rules

Android TV is a **lean-back, 10-foot UI** controlled exclusively with a D-pad remote (4 directions + Select + Back). Every screen must follow these rules:

### Focus management

- Every interactive element must be **focusable** and show a **visible focus indicator** (ring, highlight, scale, or glow).
- Focus indicators must be large enough to see from 3 meters / 10 feet.
- Minimum focusable target size: **48dp × 48dp** (recommended **56dp+** for primary actions).
- Focus must **never get lost** — if a focused item is removed (e.g. list scrolls), move focus to the nearest logical neighbor.
- On screen entry, focus should land on the **most useful element** (e.g. first channel, resume point).
- **Back button** always navigates up one level or exits the screen. Never trap the user.

### Sizing for TV

| Element | Minimum size | Recommended |
| ------- | ------------ | ----------- |
| Channel row / list item | 48dp height | 56–72dp |
| Poster tile (VOD/Series) | 120dp × 180dp | 140dp × 210dp |
| Icon button (favorite, settings) | 48dp × 48dp | 56dp × 56dp |
| Text — body | 14sp | 16sp |
| Text — title/heading | 18sp | 20–24sp |
| Text — hero title | 24sp | 28–32sp |
| Padding around focusable items | 4dp | 8dp |
| Focus ring/border width | 2dp | 3–4dp |

### Navigation patterns

| Pattern | Behavior |
| ------- | -------- |
| **Horizontal rail** | Left/Right moves between items; Up/Down moves to adjacent rail |
| **Vertical list** | Up/Down moves between items; Left goes to sidebar (if present) |
| **Grid** | 2D spatial navigation; wrap at edges is optional (prefer no-wrap) |
| **Overlay / modal** | Focus trapped inside until dismissed with Back |
| **Player controls** | Appear on any D-pad press; auto-hide after 5s of inactivity |

### Channel zapping (live TV)

- **Channel Up / Down** buttons (if available on remote) should switch channels instantly.
- Zapping speed matters — minimize time-to-picture.
- Show a brief channel info overlay on switch (channel name, number, now/next).

---

## 4. Phased delivery

### Phase 1 — Project scaffold & empty shell

**Goal**: A Gradle project that builds, installs on an Android TV emulator, and shows a blank Compose for TV screen with the Lumina color theme.

**Tasks**:
- [x] Create Gradle project under `apps/android-tv/` with Kotlin DSL
- [x] Configure `build.gradle.kts` with Compose for TV dependencies
- [x] Set up `AndroidManifest.xml` with `android.software.leanback` and `android.hardware.touchscreen` (not required) declarations
- [x] Create `MainActivity.kt` with a `TvLazyColumn` placeholder
- [x] Import Lumina color tokens from `packages/config/tokens/iptv-tavern-palette.json` → Kotlin `Color` constants
- [x] Import semantic color roles from `iptv-semantic-colors.json` → Compose `MaterialTheme` / custom theme
- [x] Set up light/dark theme (Compose for TV `TvMaterialTheme`)
- [x] Create app icon (leanback banner: 320dp × 180dp)
- [x] Verify build: `./gradlew :apps:android-tv:assembleDebug`

**Web parity**: None — this is infrastructure.

**Exit criteria**:
- `assembleDebug` succeeds
- App launches on Android TV emulator (API 31+)
- Screen shows Lumina-themed background with placeholder text
- Leanback launcher shows the app with a banner icon

---

### Phase 2 — Domain models & data layer

**Goal**: Kotlin data classes aligned with `packages/core` JSON Schemas, plus persistence (Room + DataStore).

**Tasks**:
- [x] Create Kotlin data classes for: `Source`, `Channel` (sealed class: `LiveChannel`, `VodChannel`, `SeriesChannel`), `ChannelGroup`, `Playlist`, `EpgProgram`, `EpgGuide`, `UserProfile`, `AppSettings`
- [x] Validate data classes against `packages/core/schemas/*.schema.json` — field names and types must match
- [x] Set up **Room** database with tables: `sources`, `playlists` (cached), `profiles`
- [x] Set up **DataStore** for `AppSettings` (theme, player prefs)
- [x] Create `SourceRepository` (CRUD for sources)
- [x] Create `ProfileRepository` (favorites, recents)
- [x] Set up **Hilt** DI modules for repositories and database

**Web parity**: `packages/core/contracts.ts` (Zod schemas) → Kotlin data classes.

**Exit criteria**:
- All data classes compile and match JSON Schema contracts
- Room database migrations work
- `assembleDebug` succeeds

---

### Phase 3 — M3U parser & source validation (Kotlin port)

**Goal**: Parse M3U playlist text into the domain `Playlist` model. Validate sources before saving.

**Tasks**:
- [x] Port M3U parser logic from `packages/core/src/lib/m3u.ts` to Kotlin
  - Handle `#EXTINF` attributes: `group-title`, `tvg-logo`, `tvg-id`, `tvg-name`
  - Catchup metadata: `catchup`, `catchup-days`, `catchup-source`
  - Live vs VOD heuristic (duration `-1` → live; positive → VOD)
  - Handle `#EXTGRP` fallback for group assignment
- [x] Create `SourceValidator` — validate URL reachability, parse sample, return typed error codes
  - No CORS issues on Android — direct HTTP fetch
  - Error codes: `invalid_url`, `unreachable`, `parse_error`, `empty_content`
- [x] Create `PlaylistStorage` — cache parsed playlists in Room
- [x] **Consider**: if the M3U parser is complex enough, evaluate whether a Kotlin Multiplatform module in `packages/` would be worth it to share with web (likely not for v1 — just port it)

**Web parity**: `packages/core/src/lib/m3u.ts`, `packages/core/src/lib/source-validator.ts`.

**Exit criteria**:
- M3U parser produces identical output to TypeScript version for the same input files
- Source validator correctly rejects bad URLs and parses valid M3U

---

### Phase 4 — Navigation shell & first-run flow

**Goal**: App navigation structure with screens and a first-run wizard.

**Tasks**:
- [ ] Set up **Compose Navigation** with routes:
  - `/home` — launcher / dashboard
  - `/browse/{kind}` — live / vod / series browser
  - `/play` — fullscreen player
  - `/settings` — app settings
  - `/add-source` — source wizard
  - `/onboarding` — first-run
- [ ] Build **first-run flow**:
  - Step 1: Add source (URL input, file picker)
  - Step 2: Profile name
  - Step 3: Done → navigate to Home
  - Legal responsibility acknowledgement (same text as web)
- [ ] Build **Settings screen** skeleton:
  - About (version)
  - Profile name edit
  - Sources list (add/edit/delete)
- [ ] Implement **D-pad navigation** throughout:
  - Every button/input is focusable
  - Focus indicator visible (border or scale animation)
  - Back button works on every screen
- [ ] Build **top-level navigation** (sidebar or tab rail — TV pattern):
  - Live TV, Movies, Series, Settings
  - Focus memory: re-entering a tab restores last focus position

**Web parity**: `apps/web/app/routes.tsx`, `first-run-wizard.tsx`, `settings.tsx`.

**Exit criteria**:
- All routes navigate correctly with D-pad
- First-run flow completes end-to-end
- Settings shows sources
- Back button works from every screen
- Focus never gets lost

---

### Phase 5 — Add Source (M3U URL + file)

**Goal**: Users can add an M3U source by URL or file import, validate it, and persist it.

**Tasks**:
- [ ] Build **Add Source** screen with Compose for TV form:
  - URL text input (with on-screen keyboard support)
  - File picker (Android Storage Access Framework)
  - Optional: paste raw M3U text
  - Per-source User-Agent field (optional, advanced)
  - EPG URL field (optional)
- [ ] Integrate `SourceValidator` — show loading, success, or error states
  - Error messages must be actionable (same copy as web where possible)
- [ ] On success: persist source + parsed playlist to Room
- [ ] Show source in Settings → Sources list
- [ ] Allow **edit** and **delete** existing sources from Settings
- [ ] D-pad: all form fields navigable, submit with Select button

**Web parity**: `packages/ui/src/lib/SourceForm.tsx`, `apps/web/app/features/sources/`.

**Exit criteria**:
- User can add an M3U URL source and see channels
- User can import an M3U file
- Validation errors display with clear messages
- Source persists across app restart
- D-pad navigates entire form without mouse/touch

---

### Phase 6 — Live TV browser

**Goal**: Browse live channels by group, with favorites and search.

**Tasks**:
- [ ] Build **Home** screen:
  - Catalog tiles: Live TV, Movies, Series (with channel counts)
  - Active source indicator + source switcher
  - "Continue watching" rail (last 5 live channels)
- [ ] Build **Live Browse** screen (`/browse/live`):
  - **Left sidebar**: category groups (scrollable vertical list)
  - **Main area**: channel list/grid for selected group
  - Channel rows show: name, logo (Coil), quality badges (4K/FHD/HD)
  - **Favorites** virtual group pinned at top of sidebar
- [ ] Implement **search**:
  - Search bar at top — filter channels by name (client-side)
  - D-pad: pressing a dedicated key or navigating to search icon
- [ ] Implement **favorites**:
  - Toggle favorite with a dedicated button (long-press Select or a heart icon)
  - Persist in `ProfileRepository`
  - Favorites group appears in sidebar
- [ ] Implement **recents**:
  - Track last-played channels
  - Show in "Continue watching" rail on Home
- [ ] Quality badge heuristics:
  - Port `live-channel-badges.ts` logic to Kotlin
  - **Action**: move this to `packages/core` so both apps share it

**Web parity**: `apps/web/app/pages/home.tsx`, `apps/web/app/components/browse-view.tsx` (live mode), `apps/web/app/lib/live-channel-badges.ts`.

**Exit criteria**:
- Home shows catalog tiles with counts
- Live browse shows groups + channel list
- Search filters channels
- Favorites toggle works and persists
- Continue watching rail shows recent channels
- All navigation works with D-pad only

---

### Phase 7 — Live playback (Media3 / ExoPlayer)

**Goal**: Play live TV streams with Media3. Full player controls via D-pad.

**Tasks**:
- [ ] Set up **Media3 ExoPlayer** with Compose for TV integration
- [ ] Build **Player screen** (`/play`):
  - Fullscreen video
  - Overlay appears on any D-pad press, auto-hides after 5s
  - Controls: play/pause (for timeshift if supported), channel info
  - Audio track picker (if stream has multiple audio tracks)
  - Subtitle track picker (if stream has subtitle tracks)
- [ ] **Channel info overlay** on channel switch:
  - Channel name, number, logo
  - Now/next program (if EPG loaded — wire in Phase 10)
  - Auto-dismiss after 4s
- [ ] **Error handling**:
  - Human-readable error messages (port `describeShakaError` concepts to Media3 error codes)
  - Retry button
  - "Copy diagnostics" — copy error details to clipboard (for user to paste elsewhere)
- [ ] **Channel zapping**:
  - Channel Up/Down remote buttons switch channels
  - Minimize time-to-picture (preload next channel if feasible)
  - Show brief loading indicator during switch
- [ ] Handle **audio focus** properly (pause on focus loss, resume on gain)
- [ ] Handle **back button** in player (return to browse, not exit app)

**Web parity**: `packages/player/` (Shaka integration concepts), `apps/web/app/pages/play.tsx`.

**Exit criteria**:
- Live HLS streams play in fullscreen
- D-pad controls overlay (play/pause, track selection)
- Channel zapping works with remote
- Error overlay with retry
- Audio focus handled correctly
- Back returns to browse

---

### Phase 8 — Xtream Codes support

**Goal**: Add Xtream Codes API as a source type. Login, fetch catalog, play streams.

**Tasks**:
- [ ] Port Xtream API client from `packages/core/src/lib/xtream.ts` to Kotlin:
  - `buildPlayerApiUrl`, `fetchXtreamPlayerApi`, `isXtreamAuthSuccessful`
  - Category fetchers: `fetchLiveCategories`, `fetchVodCategories`, `fetchSeriesCategories`
  - Stream fetchers: `fetchLiveStreams`, `fetchVodStreams`, `fetchSeries`
  - Detail fetchers: `fetchVodInfo`, `fetchSeriesInfo`
  - URL builders: `buildLiveStreamUrl`, `buildVodStreamUrl`, `buildSeriesEpisodeUrl`
  - Wire-to-domain mappers: `toLiveChannel`, `toVodChannel`, `toSeriesChannel`
- [ ] Update **Add Source** screen:
  - Add "Xtream Codes" tab: host, username, password fields
  - Auth probe on submit
  - Show account info (expiration, status, max connections) on success
- [ ] Implement **Xtream catalog loading**:
  - Fetch live/vod/series categories + streams
  - Map to domain `Playlist` with proper groups
  - Cache in Room with TTLs (same as web: categories 1h, streams 10min, info 24h)
- [ ] Implement **cache invalidation**:
  - "Refresh" action on source (like web's `RefreshSourceButton`)
  - Clear cache for that source and reload
- [ ] **Credential safety**: never log passwords; strip from cache keys

**Web parity**: `packages/core/src/lib/xtream.ts`, `packages/core/src/lib/xtream-cache.ts`, `apps/web/app/features/sources/`.

**Exit criteria**:
- User can add Xtream source with credentials
- Live/VOD/Series channels load from Xtream API
- Playback works for Xtream live streams
- Cache works with appropriate TTLs
- Refresh button clears cache and reloads

---

### Phase 9 — VOD (Movies) browser & playback

**Goal**: Browse and play VOD content with poster grid, detail hero, and metadata enrichment.

**Tasks**:
- [ ] Build **VOD Browse** screen (`/browse/vod`):
  - **Left sidebar**: category groups
  - **Main area**: poster grid (2:3 aspect ratio tiles)
  - Tile shows: poster image, title, year/rating badge
  - Selecting a tile updates the **detail hero** at top
- [ ] Build **VOD detail hero**:
  - Backdrop image, poster, title
  - Metadata: year, rating, duration, genre, plot (scrollable), cast, director
  - **Play** button (primary action, auto-focused)
  - **Trailer** button (open in external browser or in-app if feasible)
  - **Favorite** toggle
- [ ] **Xtream enrichment**: on focus, fetch `get_vod_info` for the selected movie
  - Port `mergeVodChannelWithXtreamInfo` logic
  - Show loading shimmer while fetching
- [ ] **VOD playback**:
  - Seekable player (scrubber visible, unlike live)
  - Duration display
  - Resume from last position (persist in recents)
- [ ] **Sorting**: sort by title, year, rating, duration, date added
  - Port `vod-sort.ts` logic to Kotlin
  - **Action**: consider moving sort logic to `packages/core` if it's pure enough
- [ ] **VOD duration formatting**: port `formatVodDuration` from `packages/ui`
  - **Action**: move to `packages/core` so both apps share it

**Web parity**: `apps/web/app/components/browse-view.tsx` (vod mode), `packages/ui/src/lib/VodBrowseHero.tsx`, `packages/ui/src/lib/VodPosterGrid.tsx`.

**Exit criteria**:
- VOD poster grid renders with images
- Detail hero shows metadata on selection
- Xtream enrichment populates additional fields
- VOD playback with seeking works
- Sorting works
- D-pad navigates grid + hero

---

### Phase 10 — EPG (Electronic Program Guide)

**Goal**: Parse XMLTV EPG data, show now/next on live channels, and provide a schedule view.

**Tasks**:
- [ ] Port XMLTV parser from `packages/core/src/lib/epg.ts` to Kotlin:
  - `parseXmltvToGuide`, `parseXmltvDatetimeToIso`
  - `getNowAndNextProgram`, `flatProgramsInWindow`
  - Handle timezone conversion
- [ ] **EPG URL** on source: fetch and parse XMLTV on source load
- [ ] **Now/Next on live channels**:
  - Show current + next program name and time on channel rows
  - Update every minute (like web's `useMinuteClock`)
- [ ] **EPG Schedule screen** (`/epg`):
  - Today + tomorrow program list per channel
  - "On air" highlighting
  - Auto-scroll to current time
  - D-pad: Up/Down between channels, Left/Right to scroll time
- [ ] **Channel info overlay** (player): wire now/next EPG data
- [ ] **Home screen**: EPG spotlight for active source (now playing on favorite channels)

**Web parity**: `packages/core/src/lib/epg.ts`, `apps/web/app/pages/epg.tsx`, `apps/web/app/store/guide-store.ts`.

**Exit criteria**:
- XMLTV parses correctly
- Now/next shows on live channel rows
- EPG schedule screen works with D-pad
- Player overlay shows now/next
- Time updates every minute

---

### Phase 11 — Series browser & playback

**Goal**: Browse TV series with season/episode picker, episode playback, and watched tracking.

**Tasks**:
- [ ] Build **Series Browse** screen (`/browse/series`):
  - **Left sidebar**: category groups
  - **Main area**: poster grid (2:3 tiles with season/episode count badge)
  - Watched strip indicator on tiles (shows percentage of episodes watched)
- [ ] Build **Series detail hero**:
  - Backdrop, poster, metadata (genre, year, rating, plot, cast)
  - **Season tabs** (horizontal strip, D-pad Left/Right)
  - **Episode list** (vertical, scrollable):
    - Episode number, title, duration
    - **Play** button per episode
    - Watched indicator (checkmark or progress bar)
  - **Favorite** toggle for the series
- [ ] **Xtream enrichment**: on focus, fetch `get_series_info`
  - Port `mergeSeriesChannelWithXtreamInfo` logic
  - Populate seasons and episodes dynamically
- [ ] **Episode stream URL resolution**:
  - Port `useSeriesEpisodeStreamUrl` logic to Kotlin
  - Build stream URL from series info + container extension
- [ ] **Series playback**:
  - Seekable player (same as VOD)
  - On episode finish: prompt "Play next episode?" (if available)
  - Update watched status in recents
- [ ] **Watched tracking**:
  - Track watched episode IDs in profile recents
  - Show watched markers on episode list and poster tiles
  - "Continue watching" on Home for series with unwatched episodes

**Web parity**: `apps/web/app/components/browse-view.tsx` (series mode), `packages/ui/src/lib/SeriesBrowseHero.tsx`, `packages/ui/src/lib/SeriesPosterGrid.tsx`, `apps/web/app/hooks/use-series-episode-stream-url.ts`.

**Exit criteria**:
- Series poster grid renders with badges
- Season tabs switch episode lists
- Episode playback works
- Watched tracking persists
- "Next episode" prompt works
- D-pad navigates all elements

---

### Phase 12 — Settings & backup/restore

**Goal**: Complete settings screen and backup/restore functionality.

**Tasks**:
- [ ] **Settings screen** (complete):
  - About: app version
  - Profile: edit display name
  - Sources: list, add, edit, delete — show Xtream account info if applicable
  - Theme: light/dark/system toggle
  - Player: buffer mode toggle (if exposed by Media3)
- [ ] **Backup / Restore**:
  - Export all app state as JSON file (sources, playlists, profile, settings)
  - Import JSON file to restore state
  - Use same JSON format as web's `lumina-backup.ts` (v1 format) for **cross-platform portability**
  - Warn before overwriting existing data on import
  - Port or align with web's backup format so users can backup on web and restore on Android TV (and vice versa)
- [ ] **Group reordering**:
  - Allow users to reorder category groups (persist order in profile)
  - D-pad: select group → move up/down with dedicated buttons (no drag-and-drop on TV)

**Web parity**: `apps/web/app/pages/settings.tsx`, `apps/web/app/features/backup/lumina-backup.ts`, `apps/web/app/components/settings-backup-section.tsx`.

**Exit criteria**:
- All settings sections work
- Backup exports valid JSON
- Restore imports and applies state
- Cross-platform backup compatibility with web app
- Group reorder works with D-pad

---

### Phase 13 — Polish & accessibility

**Goal**: Visual polish, performance optimization, and accessibility audit.

**Tasks**:
- [ ] **Focus indicators**: audit every screen for visible, consistent focus rings
- [ ] **Content descriptions**: add `contentDescription` to all interactive elements, images, and icons
- [ ] **TalkBack** compatibility: test full flows with TalkBack enabled
- [ ] **Performance**:
  - Lazy-load images (Coil handles this)
  - Virtualize long lists (`TvLazyColumn` / `TvLazyRow` — already default)
  - Profile app startup time (target < 2s to first content)
  - Measure and optimize channel zapping speed
- [ ] **Error states**: every screen has a meaningful empty state and error state
- [ ] **Loading states**: skeleton/shimmer loading for all async content
- [ ] **Animation**: subtle focus scale animations, smooth transitions between screens
  - Focus: scale 1.05× with 200ms ease
  - Screen transitions: shared element transitions where natural
- [ ] **Picture-in-Picture** (PiP): support PiP for live TV playback when navigating away
- [ ] **Background playback**: handle audio-only mode if user goes to home screen during playback

**Web parity**: General polish equivalent to web Phase 4.

**Exit criteria**:
- Every interactive element has a visible focus indicator
- TalkBack reads all screens correctly
- App starts in < 2s
- PiP works for live TV
- No ANR or crashes in normal flows

---

### Phase 14 — CI

**Goal**: CI pipeline for automated builds and linting.

**Tasks**:
- [ ] **CI pipeline** (GitHub Actions or equivalent):
  - `./gradlew lint` on every PR
  - `./gradlew assembleDebug` on every PR
  - Nx integration: add Android TV build as an Nx target (custom executor or script)

**Web parity**: `docs/web-app-plan.md § 10` (CI strategy).

**Exit criteria**:
- CI pipeline runs on every PR

---

## 5. Future phases (post-MVP, not planned in detail)

- **Catchup / time-shift playback** — `buildCatchupUrl` exists in `packages/core`; live channels carry `catchupDays` / `catchupMode`
- **Multiple profiles** — separate favorites per family member
- **QR onboarding** — scan QR code on phone to paste source URL on TV
- **Backup sync** — cloud backup/restore (requires account design)
- **Channel logos** — fetch and cache with fallback to initials
- **Hidden groups / custom category order** — advanced organization
- **Kiosk / restricted mode** — PIN lock for settings

---

## 6. Architecture diagram

```
apps/android-tv/
  app/
    src/main/
      java/com/iptvtavern/androidtv/
        MainActivity.kt
        IptvTavernApp.kt          # Compose root + theme + navigation host
        di/                       # Hilt modules
        data/
          local/                  # Room database, DAOs, DataStore
          remote/                 # HTTP client (Ktor/OkHttp), Xtream API
          repository/             # SourceRepository, PlaylistRepository, etc.
        domain/
          model/                  # Kotlin data classes (Channel, Source, etc.)
          parser/                 # M3U parser, XMLTV parser (Kotlin ports)
          usecase/                # Use cases if needed (optional layer)
        ui/
          theme/                  # Lumina colors, typography, shapes
          navigation/             # NavHost + routes
          home/                   # Home screen composables + ViewModel
          browse/                 # Browse screen (live/vod/series) + ViewModels
          player/                 # Player screen + Media3 integration
          settings/               # Settings screen + ViewModels
          onboarding/             # First-run wizard
          components/             # Shared composables (FocusableCard, etc.)
      res/
        values/
          strings.xml
          colors.xml              # Lumina colors (XML backup for non-Compose)
          themes.xml
        drawable/
        mipmap-*/                 # App icons + leanback banner
      AndroidManifest.xml
    build.gradle.kts              # Module build
  build.gradle.kts                # Root build (or integrated with monorepo root)
  settings.gradle.kts
  gradle.properties
```

---

## 7. Key differences from web app

| Aspect | Web | Android TV |
| ------ | --- | ---------- |
| **CORS** | Major issue; needs proxy | No CORS — direct HTTP |
| **Playback** | Shaka Player (JS) | Media3/ExoPlayer (native) |
| **Navigation** | Norigin Spatial Nav (React) | Compose for TV focus system (native) |
| **Storage** | localStorage + IndexedDB | Room + DataStore |
| **State** | Zustand (React) | ViewModel + StateFlow (Compose) |
| **Styling** | Tailwind CSS | Compose Modifiers + Theme |
| **Proxy** | Required for most streams | Not needed |
| **Subtitles** | ffprobe via proxy for MKV | ExoPlayer handles natively |
| **Audio codecs** | Transcode toggle for EAC3/DTS | ExoPlayer handles natively (hardware decode) |

---

## 8. Risk register

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| Frontend dev unfamiliar with Kotlin/Android | Slow initial velocity | Phases are small; use Android TV skill references; Compose is declarative like React |
| Media3 streaming edge cases | Playback failures | Test with diverse M3U playlists early (Phase 7); log Media3 errors thoroughly |
| Compose for TV maturity | API gaps or bugs | Pin stable versions; check release notes before upgrading |
| Performance on low-end Android TV boxes | Slow UI, dropped frames | Test on real hardware early (not just emulator); virtualize all lists |
| JSON Schema drift between web and Android | Data mismatches | Contract tests (Phase 14); CI runs schema validation |
