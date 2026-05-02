# Platforms

Order of delivery recommended in product discussions: **Web → Android TV → LG webOS**. That sequence optimizes for fast iteration, then the strongest native TV experience, then the webOS variant that can reuse much of the web stack with TV-specific constraints.

## Web app

**Role**

- Fastest place to **prototype** navigation, EPG, and “add source” flows.
- A **full companion** to TV for some users (e.g. configuration on desktop).

**Stack (decided)**

- **React** + **Tailwind CSS** for UI.
- **Norigin Spatial Navigation** for D-pad / keyboard spatial focus (critical for TV-style use in the browser and for parity with TV clients).
- **Shaka Player** for playback (HLS/DASH and typical IPTV-style streams in the browser).

**Considerations**

- Browsers may restrict **autoplay**; document explicit user gesture rules in UX.
- **Fullscreen** and **keyboard** navigation for power users; still keep flows simple for casual users.
- **CORS** on playlist and segment hosts is common; the product ships a **user-run stream proxy** (`apps/web-proxy`) plus in-app Settings. Playback can also use an optional **per-source User-Agent** when signing proxy requests. Users must only stream content they have rights to.

## Android TV

**Role**

- Primary “lean-back” experience: **D-pad** or remote, large UI, and native control over buffering, codecs, and track selection.

**Stack (decided)**

- **Kotlin**, **Jetpack Compose for TV**, and **Media3** (ExoPlayer) for playback.
- Domain models aligned with web via **JSON Schema** (see [architecture.md](architecture.md)) alongside **Zod** on the TypeScript side.

**Considerations**

- **Google Play** policies, update channels, and **data safety** forms if published there.
- Picture-in-picture, audio focus, and background play behavior must match platform norms.

## LG webOS

**Role**

- Reach LG TVs with a **hosted web app** packaged for webOS, reusing as much as possible from the **web** app.

**Stack (decided)**

- Same **React** + **Tailwind** + **Norigin Spatial Navigation** + **Shaka Player** baseline as Web, with webOS APIs for lifecycle, back key, and device capabilities.
- Prefer a dedicated **webOS app** target in the Nx workspace that depends on shared `packages/*` rather than forking the web UI.

**Considerations**

- **Performance and memory** budgets are stricter than desktop browsers; test on real **mid-range** TV hardware.
- **Input**: remote keys, no hover; must match **Web** + **Android TV** mental model for channel up/down and “back.”

## macOS / Desktop

**Role**

- Desktop companion for managing sources, browsing EPG, and playback without a TV.
- CORS is not a factor on desktop — direct HTTP requests, no proxy needed.

**Approach comparison**

| Approach | Proxy needed | MKV fixed | Effort |
| -------- | ------------ | --------- | ------ |
| Tauri (reuse web app) | No | No | Low |
| Electron (reuse web app) | No | No | Low-Medium |
| Native macOS (SwiftUI + AVPlayer) | No | No | High (new codebase, like Android TV) |
| Electron + mpv/VLC | No | Yes | Medium-High |

**Notes**

- Apple's native media stack (AVPlayer) does **not** support MKV containers, DTS, or EAC3 (unless Apple Silicon hardware decode). This applies to both native macOS and Tauri/Electron when using web-based players.
- Full codec/container support on any desktop approach requires bundling **mpv** (libmpv) or **VLC** as the playback engine.

## Cross-platform product consistency

- **Same** names for: Profiles (if any), Favorites, and Source labels.
- **Same** error copy where possible; platform-specific only when required (e.g. autoplay blocked).
