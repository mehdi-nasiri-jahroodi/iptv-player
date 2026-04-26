# Lumina design tokens (colors)

Brand system for Lumina using a dual palette under `iptvTavern.light` and `iptvTavern.dark`.
Brand color is **Persian Turquoise** (`#00A693`) and it drives semantic `accent` in both themes.

## Files

| File | Purpose |
|------|---------|
| [`iptv-tavern-palette.json`](./iptv-tavern-palette.json) | Canonical paint hex values for `light` and `dark` modes |
| [`iptv-semantic-colors.json`](./iptv-semantic-colors.json) | Semantic role mapping (`background`, `foreground`, `surface`, `accent`, `border`, `danger`) via `mode.family.step` refs |

## Theme automation

1. `:root` gets light `--iptv-paint-*` and `--iptv-color-*` (hex) plus matching `--iptv-color-*-rgb` (space-separated `r g b` for Tailwind opacity).
2. `.dark` overrides those same variables from dark tokens.
3. Tailwind semantic classes (`bg-background`, `bg-accent/30`, `text-foreground`, …) and raw paint classes (`bg-lum-turquoise-3`) switch automatically with `.dark`.
4. Web app auto-applies `.dark` from `prefers-color-scheme` in `apps/web/app/auto-theme.tsx`.

## Families

Current shared families (same keys in light/dark):

- `neutral` (1-5)
- `turquoise` (1-5)  ← brand
- `saffron` (1-3)
- `ebony` (1-5 in dark, 1-3 in light)
- `red` (1-2)
- `green` (1-2)

## Usage examples

- Semantic: `bg-accent text-accent-foreground border-border`
- Raw paints: `bg-lum-turquoise-3`, `text-lum-neutral-1`

## Extending

When adding a new color, add it under both `light` and `dark` branches (same family/step naming), then map it in `iptv-semantic-colors.json` if it should affect semantic roles.
