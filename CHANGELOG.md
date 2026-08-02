# Changelog

All notable changes to Velvet Journals are documented here.
This project follows [Semantic Versioning](https://semver.org/).

## [3.0.1] — 2026-08-01

### Fixed
- La rotacion del token de refresco se serializa. El servidor revoca el token al usarlo
  y trata una segunda presentacion como reutilizacion, revocando la familia entera; dos
  pestanas de Foundry comparten localStorage y bastaban para provocarlo.

## [3.0.0] — 2026-07-27

First release verified on **Foundry VTT v14**, and the first to ship the
Patreon layer. Foundry **v13 remains fully supported**.

### Added

- **Markdown in every editor.** NPC bios, quest summaries and atlas pin
  descriptions are now written in Markdown and rendered with headings, lists,
  quotes and dividers styled to the active theme. Text pasted without any
  formatting no longer collapses into a single block, because single line
  breaks are preserved.
- **Formatting toolbar.** The bio, quest and pin fields gained a small toolbar
  — heading, bold, italic, bullet list, numbered list, quote, link and
  divider. Buttons wrap the selection or prefix the selected lines, the way
  they do on GitHub or Discord.
- **Patreon licensing, as a free trial.** The module is never gated: every
  feature works with or without a subscription. Unlicensed worlds show a
  periodic notice instead.
  - The GM's notice carries the full Patreon flow, including an "I have a
    code" fallback for browsers that block the popup.
  - Players get a purely informational notice — the subscription is the GM's
    alone, and nothing asks players to subscribe or to pester the GM.
  - Once verified, the licence is trusted for **30 days**, and every
    successful check restarts that window. An active subscriber authorises
    once and is never asked again.
  - Settings → *Manage licence* (GM only) connects, re-authorises, or releases
    the installation slot for use on another machine.

### Changed

- Existing HTML and `@UUID[…]` document links in bios, summaries and pin
  descriptions keep working exactly as before — Markdown is layered under the
  existing enrichment, not in place of it.

### Fixed

- **Foundry v14 compatibility.** v14 removed `game.i18n.format()`, having
  merged it into `game.i18n.localize(key, data)`. Every interpolated string
  now goes through one version-aware helper, so both generations work from the
  same build.
- Markdown rendering degrades to the raw source instead of throwing if a
  future core release stops exposing the bundled Showdown converter.
- The licence card no longer appears for a GM whose world is already licensed
  but who is connecting from a second browser without stored credentials.
- A tier reported by the server is no longer lost on token refresh:
  `/token/refresh` answers without a tier, and an absent field now means
  "unchanged" rather than "lapsed".

[3.0.0]: https://github.com/gmredvelvet-rgb/velvet-journals/releases/tag/v3.0.0
