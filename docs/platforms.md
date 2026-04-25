# Platforms

Order of delivery recommended in product discussions: **Web → Android TV → LG webOS**. That sequence optimizes for fast iteration, then the strongest native TV experience, then the webOS variant that can reuse much of the web stack with TV-specific constraints.

## Web app

**Role**

- Fastest place to **prototype** navigation, EPG, and “add source” flows.
- A **full companion** to TV for some users (e.g. configuration on desktop).

**Typical stack (not fixed yet)**

- A modern web framework and **HLS/TS** playback via the browser or **hls.js** (and format fallbacks as needed per browser).

**Considerations**

- Browsers may restrict **autoplay**; document explicit user gesture rules in UX.
- **Fullscreen** and **keyboard** navigation for power users; still keep flows simple for casual users.

## Android TV

**Role**

- Primary “lean-back” experience: **D-pad** or remote, large UI, and **ExoPlayer-class** control over buffering, codecs, and track selection.

**Typical stack (not fixed yet)**

- **Kotlin** with Jetpack, **ExoPlayer** (or successor), and TV-specific **focus and browse** fragments.

**Considerations**

- **Google Play** policies, update channels, and **data safety** forms if published there.
- Picture-in-picture, audio focus, and background play behavior must match platform norms.

## LG webOS

**Role**

- Reach LG TVs with a **hosted web app** packaged for webOS, reusing as much as possible from the **web** app.

**Typical stack (not fixed yet)**

- **HTML/CSS/JS** or the same web framework as the web app, with **webOS** APIs for lifecycle, back key, and device capabilities.

**Considerations**

- **Performance and memory** budgets are stricter than desktop browsers; test on real **mid-range** TV hardware.
- **Input**: remote keys, no hover; must match **Web** + **Android TV** mental model for channel up/down and “back.”

## Cross-platform product consistency

- **Same** names for: Profiles (if any), Favorites, and Source labels.
- **Same** error copy where possible; platform-specific only when required (e.g. autoplay blocked).
