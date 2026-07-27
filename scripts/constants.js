export const MODULE_ID = "velvet-journals";

/** Human-readable title, used in notifications and log prefixes. */
export const MODULE_TITLE = "Velvet Journals";

/**
 * Localize a key, substituting `data` into its `{placeholders}` when given.
 *
 * v14 merged the old `format()` into `localize(key, data)` and dropped
 * `format` from Localization entirely, while v13's `localize` ignores a
 * second argument and only `format` interpolates. Neither call works on both
 * generations, so the version decides — with a capability check behind it in
 * case `game.release` is not readable yet.
 *
 * @param {string} key
 * @param {object} [data]
 * @returns {string}
 */
export function localize(key, data) {
  if ( !data ) return game.i18n.localize(key);
  if ( (game.release?.generation ?? 13) >= 14 ) return game.i18n.localize(key, data);
  return (typeof game.i18n.format === "function")
    ? game.i18n.format(key, data)
    : game.i18n.localize(key, data);
}

export const THEME_DEFAULTS = Object.freeze({
  mode: "dark",
  accent: "#d3b06a",
  accent2: "#8ea6bd",
  background: "",
  fit: "cover",
  posX: 50,
  posY: 50,
  blur: 0,
  brightness: 70,
  overlay: "#0c0a10",
  overlayOpacity: 55,
  banner: "",
  logo: "",
  kicker: "",
  subtitle: "",
  author: "",
  tags: "",
  footerText: "",
  showHero: true,
  showMeta: true,
  showFooter: false,
  animations: true,
  parallax: true,
  showMenu: true,
  defaultTab: "auto"
});

/**
 * Per-edition palette defaults, layered under THEME_DEFAULTS so a journal that hasn't been
 * hand-customized (no stored accent/overlay flag) picks up its edition's colors automatically,
 * while any GM-picked accent/overlay on a specific entry still takes precedence.
 * @type {Record<string, object>}
 */
const EDITION_DEFAULTS = Object.freeze({
  classic: Object.freeze({ accent: "#d3b06a", accent2: "#8ea6bd", overlay: "#0c0a10" }),
  survival: Object.freeze({ accent: "#d9a441", accent2: "#7d8f63", overlay: "#07090a" }),
  cyber: Object.freeze({ accent: "#00cfff", accent2: "#a100ff", overlay: "#000a14" })
});

/**
 * The module-wide theme edition selected in the module settings.
 * @returns {string} "classic", "survival" or "cyber"
 */
export function getModuleTheme() {
  let value;
  try {
    value = game.settings?.get(MODULE_ID, "theme");
  }
  catch ( err ) { /* Setting not registered yet (very early boot) */ }
  return EDITION_DEFAULTS[value] ? value : "classic";
}

/**
 * Resolve the effective theme for a JournalEntry, merging stored flags over the
 * selected edition's palette over the base defaults.
 * @param {JournalEntry} entry
 * @returns {object}
 */
export function getTheme(entry) {
  const edition = getModuleTheme();
  const defaults = foundry.utils.mergeObject(THEME_DEFAULTS, EDITION_DEFAULTS[edition], { inplace: false, insertKeys: false });
  const flags = entry.getFlag(MODULE_ID, "theme") ?? {};
  return foundry.utils.mergeObject(defaults, flags, { inplace: false, insertKeys: true });
}
