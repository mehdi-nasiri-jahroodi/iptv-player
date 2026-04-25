# Product vision

## One-line pitch

A **player-first** IPTV app: beautiful, simple, and fast — for users who **bring their own** playlists or provider credentials, not a pre-packaged channel service.

## Problem we are solving

Many IPTV apps are either:

- Tied to a **specific provider** or service, or  
- **Generic players** with cluttered navigation, poor TV-remote UX, and weak everyday features (favorites, EPG, search, reliability).

We focus on **UX quality and daily-use ergonomics** on large screens and the web, without operating the streams ourselves.

## Goals

- **Speed**: quick launch, low time-to-picture, responsive channel changes where the platform allows it.
- **Clarity**: obvious flows for add source, browse, play, and fix common issues.
- **Trust**: transparent about data; no hidden reselling of user streams; clear legal responsibility on the user for content rights.
- **Lean-back first** on TV: remote-friendly focus, large targets, minimal depth.

## Non-goals (for v1 and likely beyond)

- Selling or bundling **live TV or VOD content** as a service.
- Operating **origination**, transcoding farms, or a global CDN for channels (unless added later for optional user features with clear scope).
- **DRM-heavy premium OTT** as a primary target — not excluded forever, but not the initial focus.

## Principles

1. **User owns the source** — the app is a capable shell around lawful user-provided configuration.
2. **Polish over feature sprawl** — prefer fewer, well-built flows over checklists of half-finished options.
3. **One product, three clients** — same mental model; platform-appropriate implementation details.
4. **Accessibility and simplicity** — “simple mode” for non-technical users where feasible.

## Legal and ethical

Users must only use the app for **content they have the right to access**. The application should show clear terms and avoid encouraging infringement. Jurisdiction-specific advice belongs with legal counsel; the repo docs do not provide legal advice.

## Success (how we will know v1 works)

- A new user can **add a source, see channels, and play** without external help in most cases.
- TV users can navigate **entirely with a remote** without frustration.
- Crashes and unrecoverable playback states are **rare and explainable** (with on-device diagnostics where useful).
