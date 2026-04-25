# Glossary

| Term | Meaning |
| ---- | ------- |
| **IPTV** | Television delivered over IP networks; in this product, user-provided streams played by the app — not a service operated by the app. |
| **M3U** | A common text-based **playlist** format used to list stream URLs; often extended with metadata lines. |
| **EPG** | **Electronic program guide** — schedule data (now/next, grid) for channels, often in XML or embedded in provider APIs. |
| **EPG (XMLTV)** | A common **XML** format for program guides; implementations vary. |
| **VOD** | **Video on demand** — movies/series entries when present in a playlist, distinct from 24/7 live channels. |
| **HLS** | **HTTP Live Streaming** — an adaptive HTTP streaming format; common on the web. |
| **MPEG-TS** | A transport stream container; common for IPTV; platform/player support varies. |
| **Xtream** / **Xtream Codes API** | A **de facto** provider API style (username/password, server URL) used by many resellers; support is optional and must respect terms of the user’s source. |
| **Lean-back** | TV UI design pattern: use from a **distance** with a **remote**, large text, and focus-based navigation. |
| **Zapping** | Quickly switching between live channels; perceived speed matters on TV. |
| **BYO** | **Bring your own** — user supplies playlists or credentials; the app does not provide channels. |
| **Nx** | Monorepo tooling for JavaScript/TypeScript (and optional polyglot plugins): task graph, caching, and multi-app workspaces. |
| **Norigin Spatial Navigation** | React **hooks**–based spatial navigation for TV and browser ([`@noriginmedia/norigin-spatial-navigation`](https://www.npmjs.com/package/@noriginmedia/norigin-spatial-navigation)); moves focus by direction (D-pad / arrow keys). |
| **Shaka Player** | Google-maintained **web** media player emphasizing DASH and HLS; used for generic IPTV-style playback in browser and webOS. |
| **Media3** | Android’s **modern media stack**; includes **ExoPlayer** as the playback engine for apps targeting current APIs. |
| **Zod** | TypeScript-first **schema** library for runtime validation and static types. |
| **JSON Schema** | A vocabulary for describing JSON data; used here for **cross-platform contracts** (e.g. Kotlin) aligned with Zod-defined shapes. |
