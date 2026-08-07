# Changelog

All notable changes to Velvet Journals are documented here.
This project follows [Semantic Versioning](https://semver.org/).

## [3.2.0] — 2026-08-07

### Added

- **Hidden maps.** An atlas map can now be kept from players, the way pins,
  quests and NPCs already could — so a region can be drawn, pinned and wired to
  its scenes long before the table is meant to know it exists. The checkbox is in
  the map editor (on creation as well as later), and the index carries an
  eye toggle next to each map for flipping it mid-session.
  - Hiding cascades: putting a region away hides everything nested under it, so a
    hidden parent never leaves its districts on display.
  - A hidden map is withheld everywhere it would otherwise leak — the atlas
    index, the tab's map count, and the NPC gallery's location filter, where a
    character parked on one reads as unassigned rather than naming it.
  - A pin that travels to a map the viewer cannot see opens its own card instead
    of advertising a destination that is not there for them.
  - The GM keeps seeing every map, dimmed and marked with an eye-slash.

## [3.1.1] — 2026-08-07

### Fixed

- The point-of-interest editor lost its Save and Cancel buttons. Core caps a
  window at the viewport height and clips whatever overflows, and nothing inside
  a dialog was set up to scroll — so once the travel section made the pin form
  tall enough to hit that cap, its footer was cut off. Dialog fields now take the
  scrollbar and the buttons stay put, however long the form gets. Every Velvet
  dialog benefits, not just the pin editor.

## [3.1.0] — 2026-08-07

### Added

- **Atlas travel.** A point of interest can now be the scene it depicts. Drop a
  Scene onto a pin's card (or paste its UUID in the pin editor) and the card
  gains a travel bar, for the GM only:
  - **Take the Party** — moves every selected character's token onto the linked
    scene, arranged around the arrival point in a compact block, a marching line
    or a circle. A character already on the target scene is repositioned; one
    standing elsewhere is carried over with its full token data — an unlinked
    token keeps its damage, effects and name — and removed from the map it left;
    one with no token anywhere is placed from its prototype.
  - **Activate** pulls every connected player onto the scene, **Preview** shows
    it to the GM alone, and **Arrival Point** marks the exact landing spot with
    one click on the scene itself. When no spot has been marked the party falls
    back to the scene's initial view, or — if that is unset too — the middle of
    the map; the card and the travel dialog both say which of the three is in
    effect, and flag the last one instead of letting it pass for a decision.
  - The roster is drawn from each player's assigned character plus any
    player-owned token on the scene on screen, and shows where each one is
    standing right now.
- **Cinematic transitions.** A pin can carry a video and a macro. The video
  plays full screen for every connected client, letterboxed and captioned in the
  active edition's chrome, and the party moves the moment it ends. The macro runs
  first, for whatever is already set up — Sequencer, FXMaster, weather, music.
  Either can also be fired on its own from the card.

### Changed

- Editor dialogs (card, quest, NPC, map, pin) now follow the selected edition
  instead of always painting in Classic.
- Any link field in an editor dialog accepts a dropped document, not just the
  dashboard card's.

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
