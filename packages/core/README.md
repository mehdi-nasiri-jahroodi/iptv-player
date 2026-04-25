# core

Shared domain contracts and parsers for Lumina-IPTV clients.

## What's included

- Zod contracts: `Source`, `Channel`, `ChannelGroup`, `Playlist`, `EpgGuide`, `AppSettings`, `UserProfile`
- M3U parser: `parseM3uToPlaylist(...)`
- XMLTV parser: `parseXmltvToGuide(...)`
- Xtream API typing: `xtreamPlayerApiSchema`, `fetchXtreamPlayerApi(...)`
- Source validator with explicit `cors_blocked` handling
- Storage adapter interface + in-memory adapter

## Building

Run `nx build core` to build the library.

## Running unit tests

Run `nx test core` to execute the unit tests via [Vitest](https://vitest.dev/).

## JSON Schema artifacts

Generate artifacts for Android parity:

```bash
pnpm exec nx run core:schemas
```

Output is written to `packages/core/schemas/`.
