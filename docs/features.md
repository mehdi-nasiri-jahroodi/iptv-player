# Features (reference backlog)

This is a **planning document**, not a commitment. Reorder and cut based on user research and platform constraints when implementation starts.

## MVP (first shippable slice)

**Sources**

- Add playlist by **URL** and **file import** (e.g. M3U family).
- Optional: **provider-style login** (e.g. Xtream-compatible) *if* chosen as an MVP scope item — keep behind a clear “Advanced” path if it adds complexity.
- **Validate** source before save (basic reachability, parse sample).

**Library**

- Channel list with **groups/categories** (as provided by the playlist).
- **Favorites** and **recent channels**.
- **Search** (by name; optional EPG search later).

**Playback**

- Live playback with a **platform-appropriate** player.
- **Audio / subtitle** track selection where the stream provides tracks.
- **Error surfaces** with understandable messages; optional **“copy diagnostics”** for support (no sensitive secrets in plain logs).

**EPG (minimal)**

- If EPG is available: **now / next** and a **simple grid** for a subset of days (exact depth TBD by performance).

**Onboarding**

- Short first-run: add source → pick profile name → land on home.

**Settings**

- Theme (light/dark) where applicable.
- Player-related toggles (buffering behavior *if* exposed; platform-dependent).

## Next (post-MVP, still high value)

- **EPG** improvements: time alignment, timezone handling, “jump to now.”
- **Multiple profiles** (e.g. family members) with separate favorites.
- **Backup / restore** of app configuration (encrypted, user-controlled).
- **QR** onboarding on TV (scan to paste URL or short-lived secure transfer from phone).
- **Channel logos**: optional fetch/cache with graceful fallback.
- **Hidden groups** and **custom order** of categories.
- **Continue watching** for VOD items when the playlist provides VOD entries.

## Later / research

- **Sync** across devices (requires account and privacy design).
- **Source failover** (backup URLs per channel or group).
- **Kiosk / restricted mode** (PIN lock for settings).
- **Analytics (privacy-preserving)**: only if aligned with product ethics — opt-in, minimal.

## Explicitly de-scoped for now

- Server-side **recording** and **DVR** (may never be a goal; legal and platform constraints are heavy).
- **Social** and **recommendation feeds**.
