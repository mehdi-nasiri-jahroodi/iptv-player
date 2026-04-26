/**
 * Resolve `light.cream.1` or `dark.brown.2` against dual palette `iptvTavern.light` / `iptvTavern.dark`.
 * @param {{ light: Record<string, Record<string, string>>; dark: Record<string, Record<string, string>> }} dual
 * @param {string} ref mode.family.step
 * @returns {string} hex
 */
function resolvePaletteRef(dual, ref) {
  const parts = ref.split('.');
  if (parts.length < 3) {
    throw new Error(
      `[config] Palette ref "${ref}" must be mode.family.step (e.g. light.turquoise.3)`
    );
  }
  const [mode, family, step] = parts;
  const branch = dual[mode];
  if (!branch) {
    throw new Error(`[config] Unknown palette mode "${mode}" in "${ref}"`);
  }
  const hex = branch[family]?.[step];
  if (!hex) {
    throw new Error(`[config] Unknown palette path "${ref}"`);
  }
  return hex;
}

/**
 * Flatten dual palette into `--iptv-paint-{family}-{step}` for one mode branch.
 * @param {Record<string, Record<string, string>>} branch e.g. dual.light
 */
function flattenPaintVars(branch) {
  /** @type {Record<string, string>} */
  const vars = {};
  for (const [family, steps] of Object.entries(branch)) {
    for (const [step, hex] of Object.entries(steps)) {
      vars[`--iptv-paint-${family}-${step}`] = hex;
    }
  }
  return vars;
}

/**
 * Semantic role → CSS variables (--iptv-color-*).
 * @param {{ light: Record<string, Record<string, string>>; dark: Record<string, Record<string, string>> }} dual
 * @param {Record<string, Record<string, string>>} semantic
 * @param {string} [prefix='--iptv-color']
 */
function semanticCssVars(dual, semantic, prefix = '--iptv-color') {
  /** @type {Record<string, string>} */
  const vars = {};
  for (const [group, shades] of Object.entries(semantic)) {
    for (const [shade, paletteRef] of Object.entries(shades)) {
      const hex = resolvePaletteRef(dual, paletteRef);
      const suffix = shade === 'DEFAULT' ? group : `${group}-${shade}`;
      vars[`${prefix}-${suffix}`] = hex;
    }
  }
  return vars;
}

/**
 * Space-separated RGB triplets for Tailwind opacity modifiers (`bg-accent/20`).
 * Pairs with {@link semanticCssVars} hex vars on `:root` / `.dark`.
 * @param {{ light: Record<string, Record<string, string>>; dark: Record<string, Record<string, string>> }} dual
 * @param {Record<string, Record<string, string>>} semantic
 * @param {string} [prefix='--iptv-color']
 */
function semanticRgbCssVars(dual, semantic, prefix = '--iptv-color') {
  /** @type {Record<string, string>} */
  const vars = {};
  for (const [group, shades] of Object.entries(semantic)) {
    for (const [shade, paletteRef] of Object.entries(shades)) {
      const hex = resolvePaletteRef(dual, paletteRef);
      const suffix = shade === 'DEFAULT' ? group : `${group}-${shade}`;
      vars[`${prefix}-${suffix}-rgb`] = hexToRgbSpaceSeparated(hex);
    }
  }
  return vars;
}

/**
 * Build Tailwind nested color object: each leaf is var(--iptv-paint-family-step).
 * @param {Record<string, Record<string, string>>} lightBranch shape only (keys must match dark)
 */
function buildIptvTavernTailwindColors(lightBranch) {
  /** @type {Record<string, Record<string, string>>} */
  const out = {};
  for (const [family, steps] of Object.entries(lightBranch)) {
    out[family] = {};
    for (const step of Object.keys(steps)) {
      out[family][step] = `var(--iptv-paint-${family}-${step})`;
    }
  }
  return out;
}

/**
 * @param {string} hex #RRGGBB
 * @returns {string} "r g b" for Tailwind rgb(… / <alpha-value>)
 */
function hexToRgbSpaceSeparated(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

module.exports = {
  semanticCssVars,
  semanticRgbCssVars,
  hexToRgbSpaceSeparated,
  resolvePaletteRef,
  flattenPaintVars,
  buildIptvTavernTailwindColors,
};
