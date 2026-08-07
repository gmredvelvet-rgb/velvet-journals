import { MODULE_ID } from "./constants.js";

/**
 * Flag-backed data layer for the Velvet interactive menu (dashboard cards, NPC gallery, quests).
 * Everything lives in JournalEntry flags so it exports, duplicates and syncs like native data.
 */

export const QUEST_STATUSES = Object.freeze(["active", "done", "failed"]);

/**
 * Read a flag array, deep-cloned so callers can mutate before saving.
 * @param {JournalEntry} entry
 * @param {string} key
 * @returns {object[]}
 */
function readFlag(entry, key) {
  const value = entry.getFlag(MODULE_ID, key) ?? [];
  return foundry.utils.deepClone(Array.isArray(value) ? value : []);
}

/* -------------------------------------------- */
/*  Dashboard cards                             */
/* -------------------------------------------- */

/** @returns {object[]} */
export function getCards(entry) {
  return readFlag(entry, "cards");
}

export function setCards(entry, cards) {
  return entry.setFlag(MODULE_ID, "cards", cards);
}

/**
 * Build a new dashboard card, optionally seeded from a dropped document.
 * @param {object} [data]
 * @returns {object}
 */
export function createCard(data = {}) {
  return {
    id: foundry.utils.randomID(),
    title: "",
    subtitle: "",
    media: "",
    uuid: "",
    url: "",
    size: "md",
    category: "",
    ...data
  };
}

/* -------------------------------------------- */
/*  NPC gallery                                 */
/* -------------------------------------------- */

/** @returns {object[]} */
export function getNpcs(entry) {
  return readFlag(entry, "npcs");
}

export function setNpcs(entry, npcs) {
  return entry.setFlag(MODULE_ID, "npcs", npcs);
}

export function createNpc(uuid, data = {}) {
  return {
    id: foundry.utils.randomID(),
    uuid,
    role: "",
    portrait: "",
    bio: "",
    mapId: "",
    hidden: false,
    ...data
  };
}

/* -------------------------------------------- */
/*  Quests                                      */
/* -------------------------------------------- */

/** @returns {object[]} */
export function getQuests(entry) {
  return readFlag(entry, "quests");
}

export function setQuests(entry, quests) {
  return entry.setFlag(MODULE_ID, "quests", quests);
}

export function createQuest(data = {}) {
  return {
    id: foundry.utils.randomID(),
    name: "",
    img: "",
    summary: "",
    status: "active",
    hidden: false,
    objectives: [],
    rewards: createRewards(),
    ...data
  };
}

export function createObjective(text) {
  return { id: foundry.utils.randomID(), text, done: false };
}

/**
 * Build a quest's reward package: a system-agnostic currency label, an XP
 * number, a freeform note (reputation, favors...) and a list of item rewards.
 * @param {object} [data]
 * @returns {object}
 */
export function createRewards(data = {}) {
  return { currency: "", xp: 0, other: "", items: [], ...data };
}

/**
 * Build a single reward-item reference, resolved to its document at render time.
 * @param {string} uuid
 * @param {number} [qty]
 * @returns {object}
 */
export function createRewardItem(uuid, qty = 1) {
  return { uuid, qty };
}

/* -------------------------------------------- */
/*  Atlas (maps, pins & points of interest)     */
/* -------------------------------------------- */

/** @returns {object[]} */
export function getMaps(entry) {
  return readFlag(entry, "maps");
}

export function setMaps(entry, maps) {
  return entry.setFlag(MODULE_ID, "maps", maps);
}

export function createMap(data = {}) {
  return {
    id: foundry.utils.randomID(),
    name: "",
    image: "",
    description: "",
    parent: "",
    pins: [],
    ...data
  };
}

/**
 * Build a new map pin. Coordinates are percentages of the map image.
 * @param {number} x
 * @param {number} y
 * @param {object} [data]
 * @returns {object}
 */
export function createPin(x, y, data = {}) {
  return {
    id: foundry.utils.randomID(),
    x,
    y,
    name: "",
    type: "",
    color: "gold",
    image: "",
    description: "",
    hidden: false,
    mapLink: "",
    // Travel: the Scene this place is, where the party lands on it, and the
    // cinematic that introduces the journey.
    sceneUuid: "",
    arrival: null,
    cinematicVideo: "",
    cinematicMacro: "",
    npcs: [],
    items: [],
    ...data
  };
}
