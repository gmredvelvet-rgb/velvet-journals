import { MODULE_ID, localize } from "./constants.js";

/**
 * The Velvet Hub: opens the Velvet game-menu journal from anywhere, like a standalone HUD.
 * Access points: the "J" hotkey, a Journal Notes scene-control tool, a Journal Directory
 * header button, and the `ui.velvetJournals` API.
 */

const SHEET_ID = `${MODULE_ID}.VelvetJournalSheet`;
const L = (key, data) => localize(key, data);

/**
 * Resolve the JournalEntry configured as the Velvet Hub.
 * @returns {JournalEntry|null}
 */
export function getHubJournal() {
  const name = game.settings.get(MODULE_ID, "homeJournalName")?.trim();
  if ( !name ) return null;
  return game.journal.find(j => j.name === name) ?? null;
}

/* -------------------------------------------- */

/**
 * Create the hub journal with the Velvet sheet, observer access and a welcome page.
 * @param {string} name
 * @returns {Promise<JournalEntry>}
 */
async function createHubJournal(name) {
  return JournalEntry.create({
    name,
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER },
    flags: {
      core: { sheetClass: SHEET_ID },
      [MODULE_ID]: {
        theme: {
          kicker: L("VJ.Hub.Kicker"),
          subtitle: L("VJ.Hub.Subtitle")
        }
      }
    },
    pages: [{
      name: L("VJ.Hub.WelcomeTitle"),
      type: "text",
      title: { show: true, level: 1 },
      text: { format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML, content: L("VJ.Hub.WelcomeContent") }
    }]
  });
}

/* -------------------------------------------- */

/**
 * Open the Velvet Hub as a large centered game menu, creating it on first GM use.
 * @returns {Promise<void>}
 */
export async function openHub() {
  let entry = getHubJournal();
  if ( !entry ) {
    if ( !game.user.isGM ) {
      ui.notifications.warn(L("VJ.Hub.NoJournal"));
      return;
    }
    const name = game.settings.get(MODULE_ID, "homeJournalName")?.trim() || "Velvet Hub";
    entry = await createHubJournal(name);
    ui.notifications.info(L("VJ.Hub.Created", { name }));
  }

  // Repair the hub if needed: it must use the Velvet sheet and stay visible to every
  // player (only individual quests/pins/NPCs are hidden via their own "hidden" flag).
  if ( game.user.isGM ) {
    const updates = {};
    if ( entry.getFlag("core", "sheetClass") !== SHEET_ID ) updates["flags.core.sheetClass"] = SHEET_ID;
    if ( (entry.ownership.default ?? 0) < CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER ) {
      updates["ownership.default"] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
    }
    if ( Object.keys(updates).length ) await entry.update(updates);
  }

  if ( !entry.testUserPermission(game.user, "OBSERVER") ) {
    return ui.notifications.warn(L("VJ.Hub.NoPermission"));
  }

  const sheet = entry.sheet;
  const { innerWidth: vw, innerHeight: vh } = window;
  const width = Math.min(1360, Math.round(vw * 0.86));
  const height = Math.min(920, Math.round(vh * 0.88));
  await sheet.render({
    force: true,
    position: {
      width,
      height,
      left: Math.round((vw - width) / 2),
      top: Math.round((vh - height) / 2)
    }
  });
}

/* -------------------------------------------- */

/**
 * Toggle the Velvet Hub window, mirroring the feel of a game menu key.
 * @returns {Promise<void>}
 */
export async function toggleHub() {
  const entry = getHubJournal();
  const sheet = entry?.sheet;
  if ( sheet?.rendered ) {
    if ( sheet.minimized ) return sheet.maximize();
    return sheet.close();
  }
  return openHub();
}

/* -------------------------------------------- */

/**
 * Register the hub setting, hotkey, scene-control tool and directory button.
 * Called once from the module's init hook.
 */
export function initializeHub() {
  game.settings.register(MODULE_ID, "homeJournalName", {
    name: "VJ.Hub.SettingName",
    hint: "VJ.Hub.SettingHint",
    scope: "world",
    config: true,
    type: String,
    default: "Velvet Hub"
  });

  game.keybindings.register(MODULE_ID, "toggleHub", {
    name: "VJ.Hub.Open",
    editable: [{ key: "KeyJ" }],
    restricted: false,
    precedence: CONST.KEYBINDING_PRECEDENCE.PRIORITY,
    onDown: () => {
      toggleHub();
      return true;
    }
  });

  // Journal Notes scene-control tool (v13 record shape, v12 array fallback).
  Hooks.on("getSceneControlButtons", controls => {
    const tool = {
      name: "velvet-hub",
      order: 10,
      title: "VJ.Hub.Open",
      icon: "fa-solid fa-book-open-reader",
      button: true,
      onChange: () => toggleHub(),
      onClick: () => toggleHub()
    };
    if ( Array.isArray(controls) ) controls.find(c => c.name === "notes")?.tools?.push(tool);
    else if ( controls.notes?.tools ) controls.notes.tools["velvet-hub"] = tool;
  });

  // Journal Directory header button.
  Hooks.on("renderJournalDirectory", (app, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if ( !root || root.querySelector(".vj-open-hub") ) return;
    const actions = root.querySelector(".header-actions.action-buttons")
      ?? root.querySelector(".directory-header");
    if ( !actions ) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "vj-open-hub";
    button.innerHTML = `<i class="fa-solid fa-book-open-reader" inert></i><span>${L("VJ.Hub.Open")}</span>`;
    button.addEventListener("click", () => toggleHub());
    actions.append(button);
  });

  // Public API.
  Hooks.once("ready", () => {
    const api = { open: openHub, toggle: toggleHub, close: () => getHubJournal()?.sheet?.close(), journal: getHubJournal };
    ui.velvetJournals = api;
    const module = game.modules.get(MODULE_ID);
    if ( module ) module.api = api;
  });
}
