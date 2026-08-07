import { MODULE_ID, MODULE_TITLE, getTheme, getModuleTheme, localize } from "./constants.js";
import VelvetThemeConfig from "./theme-config.js";
import {
  getCards, setCards, createCard,
  getNpcs, setNpcs, createNpc,
  getQuests, setQuests, createQuest, createObjective, createRewards, createRewardItem,
  getMaps, setMaps, createMap, createPin
} from "./menu-data.js";
import {
  editCardDialog, editQuestDialog, editNpcDialog, confirmDeleteDialog,
  editMapDialog, editPinDialog
} from "./editors.js";
import { openTravelDialog, runPinCinematic, pickArrivalPoint, arrivalInfo } from "./travel.js";

const { JournalEntrySheet } = foundry.applications.sheets.journal;

/**
 * Convert user-authored Markdown to HTML using the showdown library bundled with
 * Foundry core. Raw HTML written in the source passes through untouched, so bios
 * saved before Markdown support keep rendering exactly as they did.
 * @param {string} text
 * @returns {string}
 */
let mdConverter = null;
function markdownToHTML(text) {
  if ( !text ) return "";
  // Showdown ships with the core, but a journal must not go blank if a future
  // release stops exposing it: falling back to the raw source still enriches
  // and renders exactly as it did before Markdown support existed.
  if ( typeof showdown === "undefined" ) return text;
  try {
    mdConverter ??= new showdown.Converter({
      noHeaderId: true,
      tables: true,
      strikethrough: true,
      simpleLineBreaks: true,
      literalMidWordUnderscores: true,
      disableForced4SpacesIndentedSublists: true
    });
    return mdConverter.makeHtml(text);
  }
  catch ( err ) {
    console.warn(`${MODULE_TITLE} | Markdown conversion failed, using the raw source`, err);
    return text;
  }
}

/**
 * Best-effort, system-agnostic price label for an item document.
 * Understands common shapes (dnd5e `{value, denomination}`, pf2e `{value: {gp: 5}}`)
 * and falls back to an empty string.
 * @param {Item} item
 * @returns {string}
 */
function priceLabel(item) {
  try {
    const price = item?.system?.price;
    if ( price == null ) return "";
    if ( (typeof price === "number") || (typeof price === "string") ) return String(price);
    const value = price.value ?? price;
    if ( (typeof value === "object") && (value !== null) ) {
      return Object.entries(value)
        .filter(([, v]) => Number(v))
        .map(([denomination, v]) => `${v} ${denomination}`)
        .join(" · ");
    }
    if ( (value === undefined) || (value === null) || (value === "") ) return "";
    return `${value}${price.denomination ? ` ${price.denomination}` : ""}`;
  }
  catch ( err ) {
    return "";
  }
}

/**
 * Classify a document linked from a dashboard card into a badge (icon + label)
 * so the card visibly communicates what a click will do.
 * @param {ClientDocument} doc
 * @returns {{icon: string, label: string}}
 */
function classifyCardTarget(doc) {
  const badges = {
    Scene: { icon: "fa-solid fa-map", label: "VJ.Dashboard.TargetScene" },
    Macro: { icon: "fa-solid fa-terminal", label: "VJ.Dashboard.TargetMacro" },
    RollTable: { icon: "fa-solid fa-dice", label: "VJ.Dashboard.TargetTable" },
    Playlist: { icon: "fa-solid fa-music", label: "VJ.Dashboard.TargetPlaylist" },
    JournalEntryPage: { icon: "fa-solid fa-file-lines", label: "VJ.Dashboard.TargetPage" },
    JournalEntry: { icon: "fa-solid fa-book-open", label: "VJ.Dashboard.TargetJournal" },
    Actor: { icon: "fa-solid fa-user", label: "VJ.Dashboard.TargetActor" },
    Item: { icon: "fa-solid fa-suitcase", label: "VJ.Dashboard.TargetItem" }
  };
  return badges[doc.documentName] ?? { icon: "fa-solid fa-file", label: "VJ.Dashboard.TargetDoc" };
}

/**
 * The distinct, non-empty categories already used across a set of dashboard cards,
 * offered as autocomplete suggestions so section names stay consistent.
 * @param {object[]} cards
 * @returns {string[]}
 */
function cardCategories(cards) {
  const seen = new Set(cards.map(c => (c.category ?? "").trim()).filter(c => c));
  return [...seen].sort((a, b) => a.localeCompare(b));
}

/**
 * The Velvet Journals sheet. Extends the core v13 JournalEntrySheet, preserving all native
 * behavior (pages, permissions, search, drag & drop, editors) while adding a game-menu layer:
 * a tab bar, a dashboard of media cards, a draggable NPC gallery and a quest tracker.
 */
export default class VelvetJournalSheet extends JournalEntrySheet {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["velvet-journal"],
    actions: {
      osjThemeConfig: VelvetJournalSheet.#onThemeConfig,
      vjTab: VelvetJournalSheet.#onTab,
      vjCardAdd: VelvetJournalSheet.#onCardAdd,
      vjCardEdit: VelvetJournalSheet.#onCardEdit,
      vjCardDelete: VelvetJournalSheet.#onCardDelete,
      vjCardOpen: VelvetJournalSheet.#onCardOpen,
      vjCardMute: VelvetJournalSheet.#onCardMute,
      vjNpcOpen: VelvetJournalSheet.#onNpcOpen,
      vjNpcEdit: VelvetJournalSheet.#onNpcEdit,
      vjNpcDelete: VelvetJournalSheet.#onNpcDelete,
      vjNpcHide: VelvetJournalSheet.#onNpcHide,
      vjQuestAdd: VelvetJournalSheet.#onQuestAdd,
      vjQuestEdit: VelvetJournalSheet.#onQuestEdit,
      vjQuestDelete: VelvetJournalSheet.#onQuestDelete,
      vjQuestStatus: VelvetJournalSheet.#onQuestStatus,
      vjQuestHide: VelvetJournalSheet.#onQuestHide,
      vjQuestFilter: VelvetJournalSheet.#onQuestFilter,
      vjObjectiveToggle: VelvetJournalSheet.#onObjectiveToggle,
      vjObjectiveAdd: VelvetJournalSheet.#onObjectiveAdd,
      vjObjectiveDelete: VelvetJournalSheet.#onObjectiveDelete,
      vjRewardQtyInc: VelvetJournalSheet.#onRewardQtyInc,
      vjRewardQtyDec: VelvetJournalSheet.#onRewardQtyDec,
      vjRewardItemRemove: VelvetJournalSheet.#onRewardItemRemove,
      vjMapAdd: VelvetJournalSheet.#onMapAdd,
      vjMapEdit: VelvetJournalSheet.#onMapEdit,
      vjMapDelete: VelvetJournalSheet.#onMapDelete,
      vjMapHide: VelvetJournalSheet.#onMapHide,
      vjMapSelect: VelvetJournalSheet.#onMapSelect,
      vjAtlasZoomIn: VelvetJournalSheet.#onAtlasZoomIn,
      vjAtlasZoomOut: VelvetJournalSheet.#onAtlasZoomOut,
      vjAtlasReset: VelvetJournalSheet.#onAtlasReset,
      vjPinPlace: VelvetJournalSheet.#onPinPlaceMode,
      vjPinOpen: VelvetJournalSheet.#onPinOpen,
      vjPinEdit: VelvetJournalSheet.#onPinEdit,
      vjPinDelete: VelvetJournalSheet.#onPinDelete,
      vjPinHide: VelvetJournalSheet.#onPinHide,
      vjModalClose: VelvetJournalSheet.#onModalClose,
      vjRefOpen: VelvetJournalSheet.#onRefOpen,
      vjRefRemove: VelvetJournalSheet.#onRefRemove,
      vjShowPlayers: VelvetJournalSheet.#onShowPlayers,
      vjSceneView: VelvetJournalSheet.#onSceneView,
      vjSceneActivate: VelvetJournalSheet.#onSceneActivate,
      vjSceneArrival: VelvetJournalSheet.#onSceneArrival,
      vjSceneUnlink: VelvetJournalSheet.#onSceneUnlink,
      vjPartyTravel: VelvetJournalSheet.#onPartyTravel,
      vjCinematicPlay: VelvetJournalSheet.#onCinematicPlay
    }
  };

  /** @override */
  static PARTS = {
    menu: {
      template: `modules/${MODULE_ID}/templates/tabs.hbs`
    },
    sidebar: {
      template: `modules/${MODULE_ID}/templates/sidebar.hbs`,
      templates: ["templates/journal/toc.hbs"],
      scrollable: [".toc"]
    },
    pages: {
      template: `modules/${MODULE_ID}/templates/pages.hbs`,
      scrollable: [".journal-entry-pages"]
    },
    dashboard: {
      template: `modules/${MODULE_ID}/templates/dashboard.hbs`,
      scrollable: [".osj-panel-scroll"]
    },
    npcs: {
      template: `modules/${MODULE_ID}/templates/npcs.hbs`,
      scrollable: [".osj-panel-scroll"]
    },
    quests: {
      template: `modules/${MODULE_ID}/templates/quests.hbs`,
      scrollable: [".osj-panel-scroll"]
    },
    atlas: {
      template: `modules/${MODULE_ID}/templates/atlas.hbs`
    }
  };

  /**
   * The main menu tabs, in display order.
   * @type {{id: string, icon: string, label: string}[]}
   */
  static MENU_TABS = [
    { id: "dashboard", icon: "fa-solid fa-compass", label: "VJ.Tabs.Dashboard" },
    { id: "npcs", icon: "fa-solid fa-users", label: "VJ.Tabs.Npcs" },
    { id: "quests", icon: "fa-solid fa-scroll", label: "VJ.Tabs.Quests" },
    { id: "atlas", icon: "fa-solid fa-map", label: "VJ.Tabs.Atlas" },
    { id: "pages", icon: "fa-solid fa-book-open", label: "VJ.Tabs.Pages" }
  ];

  /**
   * The theme configuration application for this entry.
   * @type {VelvetThemeConfig}
   */
  #themeConfig;

  /**
   * Cached resolved theme for the current render.
   * @type {object}
   */
  #theme;

  /**
   * Whether a parallax frame is already queued.
   * @type {boolean}
   */
  #scrollQueued = false;

  /**
   * The user-selected menu tab, if any. Falls back to the theme default.
   * @type {string|null}
   */
  #activeTab = null;

  /**
   * The active quest status filter.
   * @type {string}
   */
  #questFilter = "active";

  /**
   * The active NPC location filter: "all", "unassigned", or a map id.
   * @type {string}
   */
  #npcMapFilter = "all";

  /**
   * The current NPC quick-search text.
   * @type {string}
   */
  #npcSearch = "";

  /**
   * Quest cards the user has expanded, preserved across re-renders.
   * @type {Set<string>}
   */
  #openQuests = new Set();

  /**
   * The atlas map currently displayed.
   * @type {string|null}
   */
  #activeMapId = null;

  /**
   * The pin whose modal card is open, if any.
   * @type {string|null}
   */
  #openPinId = null;

  /**
   * The NPC whose dossier modal is open, if any.
   * @type {string|null}
   */
  #openNpcId = null;

  /**
   * Per-map pan & zoom state, preserved across re-renders.
   * @type {Map<string, {x: number, y: number, scale: number}>}
   */
  #atlasViews = new Map();

  /**
   * Whether the atlas is in pin-placement mode (next map click places a POI).
   * @type {boolean}
   */
  #pinPlacing = false;

  /**
   * The resolved Velvet theme for this entry.
   * @type {object}
   */
  get theme() {
    return this.#theme ??= getTheme(this.entry);
  }

  /**
   * The currently active menu tab.
   * @type {string}
   */
  get activeTab() {
    if ( !this.theme.showMenu ) return "pages";
    if ( this.#activeTab ) return this.#activeTab;
    const preferred = this.theme.defaultTab || "auto";
    if ( preferred !== "auto" ) return preferred;
    return getCards(this.entry).length ? "dashboard" : "pages";
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _configureRenderOptions(options) {
    this.#theme = null;
    super._configureRenderOptions(options);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    if ( !this.theme.showMenu ) {
      delete parts.menu;
      delete parts.dashboard;
      delete parts.npcs;
      delete parts.quests;
      delete parts.atlas;
    }
    return parts;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _getHeaderControls() {
    const controls = super._getHeaderControls();
    controls.unshift({
      icon: "fa-solid fa-palette",
      label: "VJ.ThemeConfig.Open",
      visible: this.isEditable,
      action: "osjThemeConfig"
    });
    return controls;
  }

  /* -------------------------------------------- */

  /**
   * Prepare Velvet presentation data shared by templates.
   * @returns {object}
   */
  _prepareVelvetContext() {
    const theme = this.theme;
    const stats = this.entry._stats ?? {};
    const tags = String(theme.tags ?? "").split(",").map(t => t.trim()).filter(t => t);
    const updated = stats.modifiedTime
      ? new Date(stats.modifiedTime).toLocaleDateString(game.i18n.lang, { year: "numeric", month: "short", day: "numeric" })
      : "";
    const author = theme.author || game.users?.get(stats.lastModifiedBy)?.name || "";
    const breadcrumb = [];
    let folder = this.entry.folder;
    while ( folder ) {
      breadcrumb.unshift(folder.name);
      folder = folder.folder;
    }
    if ( this.entry.pack ) breadcrumb.unshift(game.packs.get(this.entry.pack)?.title ?? game.i18n.localize("PACKAGE.TagCompendium"));
    return {
      theme, tags, updated, author, breadcrumb,
      name: this.entry.name,
      pageCount: this.entry.pages.size
    };
  }

  /* -------------------------------------------- */

  /**
   * Resolve a document reference to its name/image, tolerating stale UUIDs.
   * @param {string} uuid
   * @param {string} fallbackImg
   * @param {string} missingKey  Localization key for the missing-document name.
   * @returns {Promise<{doc: ClientDocument|null, missing: boolean, name: string, img: string}>}
   */
  async #resolveRef(uuid, fallbackImg, missingKey) {
    let doc = null;
    try {
      doc = await fromUuid(uuid);
    }
    catch ( err ) { /* Broken reference, rendered as missing */ }
    return {
      doc,
      missing: !doc,
      name: doc?.name ?? game.i18n.localize(missingKey),
      img: doc?.img || fallbackImg,
      // LIMITED matches the core sheet's own viewPermission threshold (see DocumentSheetV2),
      // so a player only sees an "open sheet" affordance when it would actually work.
      canView: !!doc?.testUserPermission?.(game.user, "LIMITED")
    };
  }

  /* -------------------------------------------- */

  /**
   * Quests visible to the current user.
   * @returns {object[]}
   */
  #visibleQuests() {
    const isOwner = this.entry.isOwner;
    return getQuests(this.entry).filter(q => isOwner || !q.hidden);
  }

  /**
   * NPC references visible to the current user.
   * @returns {object[]}
   */
  #visibleNpcs() {
    const isOwner = this.entry.isOwner;
    return getNpcs(this.entry).filter(n => isOwner || !n.hidden);
  }

  /**
   * Atlas maps visible to the current user.
   *
   * Hiding cascades down the tree: a map is shown only when nothing above it is
   * hidden, so a region put away for prep never leaves its districts on display.
   * The walk guards against a parent cycle, which a hand-edited flag could create.
   * @returns {object[]}
   */
  #visibleMaps() {
    const maps = getMaps(this.entry);
    if ( this.entry.isOwner ) return maps;
    const byId = new Map(maps.map(m => [m.id, m]));
    const shown = map => {
      const seen = new Set();
      let node = map;
      while ( node && !seen.has(node.id) ) {
        if ( node.hidden ) return false;
        seen.add(node.id);
        node = node.parent ? byId.get(node.parent) : null;
      }
      return true;
    };
    return maps.filter(shown);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    switch ( partId ) {
      case "menu": return this._prepareMenuContext(context);
      case "dashboard": return this._prepareDashboardContext(context);
      case "npcs": return this._prepareNpcsContext(context);
      case "quests": return this._prepareQuestsContext(context);
      case "atlas": return this._prepareAtlasContext(context);
    }
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Prepare context for the menu tab bar.
   * @param {object} context
   * @returns {object}
   */
  _prepareMenuContext(context) {
    const osj = this._prepareVelvetContext();
    const active = this.activeTab;
    const badges = {
      npcs: this.#visibleNpcs().length,
      quests: this.#visibleQuests().filter(q => q.status === "active").length,
      atlas: this.#visibleMaps().length,
      pages: this.entry.pages.size
    };
    context.vjMenu = {
      logo: osj.theme.logo,
      name: this.entry.name,
      tabs: this.constructor.MENU_TABS.map(tab => ({
        ...tab,
        active: tab.id === active,
        badge: badges[tab.id] || 0
      }))
    };
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Prepare context for the dashboard landing panel, resolving each card's linked
   * document to show what it actually does (open a scene, run a macro, jump to a
   * page...) and to fall back to the document's own art when no media is set.
   * @param {object} context
   * @returns {Promise<object>}
   */
  async _prepareDashboardContext(context) {
    const theme = this.theme;
    const quests = this.#visibleQuests();
    const cards = [];
    for ( const card of getCards(this.entry) ) {
      let doc = null;
      let target = null;
      if ( card.uuid ) {
        try {
          doc = await fromUuid(card.uuid);
        }
        catch ( err ) { /* Broken reference, rendered as missing */ }
        target = doc
          ? { ...classifyCardTarget(doc), name: doc.name }
          : { icon: "fa-solid fa-link-slash", label: "VJ.Dashboard.TargetMissing", name: "" };
      }
      else if ( card.url ) {
        target = { icon: "fa-solid fa-arrow-up-right-from-square", label: "VJ.Dashboard.TargetLink", name: card.url };
      }
      if ( target ) {
        target.tooltip = target.name
          ? localize("VJ.Dashboard.TargetTooltip", { type: game.i18n.localize(target.label), name: target.name })
          : game.i18n.localize(target.label);
      }
      const media = card.media || doc?.thumb || doc?.img || doc?.background?.src || "";
      cards.push({
        ...card,
        size: card.size || "md",
        media,
        isVideo: !!media && foundry.helpers.media.VideoHelper.hasVideoExtension(media),
        hasTarget: !!(card.uuid || card.url),
        target
      });
    }
    // Group cards into named sections, in first-appearance order. Uncategorized
    // cards always form the last group so they never interrupt the ordering, and
    // only get a visible "Uncategorized" header once at least one real section exists.
    const named = new Map();
    const uncategorized = [];
    for ( const card of cards ) {
      const key = (card.category ?? "").trim();
      if ( !key ) { uncategorized.push(card); continue; }
      if ( !named.has(key) ) named.set(key, []);
      named.get(key).push(card);
    }
    const sections = [...named.entries()].map(([name, sectionCards]) => ({ name, cards: sectionCards }));
    if ( uncategorized.length ) {
      sections.push({ name: sections.length ? game.i18n.localize("VJ.Dashboard.Uncategorized") : "", cards: uncategorized });
    }

    context.vjDash = {
      name: this.entry.name,
      kicker: theme.kicker,
      subtitle: theme.subtitle,
      cards,
      sections,
      stats: [
        { tab: "pages", icon: "fa-regular fa-file-lines", label: "VJ.Tabs.Pages", value: this.entry.pages.size },
        { tab: "npcs", icon: "fa-solid fa-users", label: "VJ.Tabs.Npcs", value: this.#visibleNpcs().length },
        { tab: "quests", icon: "fa-solid fa-fire", label: "VJ.Quests.Active", value: quests.filter(q => q.status === "active").length },
        { tab: "quests", icon: "fa-solid fa-trophy", label: "VJ.Quests.Done", value: quests.filter(q => q.status === "done").length }
      ]
    };
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Prepare context for the NPC gallery panel, resolving actor documents and the
   * open dossier's enriched bio.
   * @param {object} context
   * @returns {Promise<object>}
   */
  async _prepareNpcsContext(context) {
    const isOwner = this.entry.isOwner;
    const TextEditor = foundry.applications.ux.TextEditor.implementation;
    // A character parked on a hidden map reads as unassigned rather than naming it.
    const maps = this.#visibleMaps();
    const untitled = game.i18n.localize("VJ.Atlas.Untitled");
    const list = [];
    let openNpc = null;
    let hasUnassigned = false;
    for ( const ref of this.#visibleNpcs() ) {
      const resolved = await this.#resolveRef(ref.uuid, "icons/svg/mystery-man.svg", "VJ.Npcs.Missing");
      const map = maps.find(m => m.id === ref.mapId);
      if ( !map ) hasUnassigned = true;
      const entry = {
        id: ref.id,
        uuid: ref.uuid,
        role: ref.role ?? "",
        hidden: !!ref.hidden,
        missing: resolved.missing,
        canView: resolved.canView,
        name: resolved.name,
        img: ref.portrait || resolved.img,
        mapId: ref.mapId || "",
        mapName: map ? (map.name || untitled) : ""
      };
      list.push(entry);
      if ( ref.id === this.#openNpcId ) {
        openNpc = {
          ...entry,
          bioHTML: ref.bio
            ? await TextEditor.enrichHTML(markdownToHTML(ref.bio), { relativeTo: this.entry, secrets: isOwner })
            : ""
        };
      }
    }
    if ( this.#openNpcId && !openNpc ) this.#openNpcId = null;

    const count = mapId => list.filter(n => (mapId === "unassigned" ? !n.mapId : n.mapId === mapId)).length;
    const locations = maps.map(m => ({ id: m.id, name: m.name || untitled, count: count(m.id) }));
    if ( hasUnassigned ) locations.push({ id: "unassigned", name: game.i18n.localize("VJ.Npcs.Unassigned"), count: count("unassigned") });

    context.vjNpcs = { list, openNpc, locations, mapFilter: this.#npcMapFilter, search: this.#npcSearch };
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Prepare context for the quest tracker panel.
   * @param {object} context
   * @returns {Promise<object>}
   */
  async _prepareQuestsContext(context) {
    const isOwner = this.entry.isOwner;
    const TextEditor = foundry.applications.ux.TextEditor.implementation;
    const quests = this.#visibleQuests();
    const list = [];
    for ( const quest of quests ) {
      const objectives = Array.isArray(quest.objectives) ? quest.objectives : [];
      const doneCount = objectives.filter(o => o.done).length;
      const progress = objectives.length
        ? Math.round((doneCount / objectives.length) * 100)
        : (quest.status === "done" ? 100 : 0);

      const rewardsData = quest.rewards ?? createRewards();
      const rewardItems = [];
      for ( const ref of rewardsData.items ?? [] ) {
        const resolved = await this.#resolveRef(ref.uuid, "icons/svg/item-bag.svg", "VJ.Atlas.MissingItem");
        rewardItems.push({ uuid: ref.uuid, qty: ref.qty ?? 1, missing: resolved.missing, name: resolved.name, img: resolved.img });
      }
      const rewards = {
        currency: rewardsData.currency ?? "",
        xp: Number(rewardsData.xp) || 0,
        other: rewardsData.other ?? "",
        items: rewardItems
      };
      const hasRewards = !!(rewards.currency || rewards.xp || rewards.other || rewardItems.length);

      list.push({
        ...quest,
        img: quest.img || "icons/svg/book.svg",
        objectives,
        doneCount,
        totalCount: objectives.length,
        progress,
        rewards,
        hasRewards,
        open: this.#openQuests.has(quest.id),
        isActive: quest.status === "active",
        isDone: quest.status === "done",
        isFailed: quest.status === "failed",
        statusLabel: `VJ.Quests.Status.${quest.status.capitalize()}`,
        summaryHTML: quest.summary
          ? await TextEditor.enrichHTML(markdownToHTML(quest.summary), { relativeTo: this.entry, secrets: isOwner })
          : ""
      });
    }
    const count = status => list.filter(q => q.status === status).length;
    context.vjQuests = {
      filter: this.#questFilter,
      list,
      tabs: [
        { id: "active", icon: "fa-solid fa-fire", label: "VJ.Quests.Active", count: count("active"), active: this.#questFilter === "active" },
        { id: "done", icon: "fa-solid fa-trophy", label: "VJ.Quests.Done", count: count("done"), active: this.#questFilter === "done" },
        { id: "failed", icon: "fa-solid fa-skull", label: "VJ.Quests.Failed", count: count("failed"), active: this.#questFilter === "failed" }
      ]
    };
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Prepare context for the atlas panel, resolving documents for the open pin's modal.
   * @param {object} context
   * @returns {Promise<object>}
   */
  async _prepareAtlasContext(context) {
    const isOwner = this.entry.isOwner;
    const TextEditor = foundry.applications.ux.TextEditor.implementation;
    const maps = this.#visibleMaps();
    const visibleIds = new Set(maps.map(m => m.id));
    const activeMap = maps.find(m => m.id === this.#activeMapId) ?? maps[0] ?? null;
    this.#activeMapId = activeMap?.id ?? null;

    let map = null;
    let openPin = null;
    if ( activeMap ) {
      // A pin leading somewhere the viewer cannot see opens its own card instead,
      // rather than advertising a map that is not there for them.
      const pins = (activeMap.pins ?? [])
        .filter(p => isOwner || !p.hidden)
        .map(p => (p.mapLink && !visibleIds.has(p.mapLink)) ? { ...p, mapLink: "" } : p);
      map = { ...activeMap, pins };
      const pin = this.#openPinId ? pins.find(p => p.id === this.#openPinId) : null;
      if ( !pin ) this.#openPinId = null;
      else {
        const npcs = [];
        for ( const uuid of pin.npcs ?? [] ) {
          const ref = await this.#resolveRef(uuid, "icons/svg/mystery-man.svg", "VJ.Npcs.Missing");
          npcs.push({ uuid, missing: ref.missing, canView: ref.canView, name: ref.name, img: ref.img });
        }
        const items = [];
        for ( const uuid of pin.items ?? [] ) {
          const ref = await this.#resolveRef(uuid, "icons/svg/item-bag.svg", "VJ.Atlas.MissingItem");
          items.push({ uuid, missing: ref.missing, canView: ref.canView, name: ref.name, img: ref.img, price: ref.doc ? priceLabel(ref.doc) : "" });
        }
        openPin = {
          ...pin,
          npcs,
          items,
          travel: await this.#resolvePinTravel(pin),
          descriptionHTML: pin.description
            ? await TextEditor.enrichHTML(markdownToHTML(pin.description), { relativeTo: this.entry, secrets: isOwner })
            : ""
        };
      }
    }

    // Navigation tree: root maps (big cities, regions) with their child maps.
    const untitled = game.i18n.localize("VJ.Atlas.Untitled");
    const node = m => ({
      id: m.id,
      name: m.name || untitled,
      active: m.id === this.#activeMapId,
      hidden: !!m.hidden,
      pinCount: (m.pins ?? []).filter(p => isOwner || !p.hidden).length
    });
    const descendants = rootId => {
      const out = [];
      const seen = new Set([rootId]);
      const queue = maps.filter(m => m.parent === rootId);
      while ( queue.length ) {
        const m = queue.shift();
        if ( seen.has(m.id) ) continue;
        seen.add(m.id);
        out.push(m);
        queue.push(...maps.filter(c => c.parent === m.id));
      }
      return out;
    };
    const tree = maps
      .filter(m => !m.parent || !visibleIds.has(m.parent) || m.parent === m.id)
      .map(root => ({ ...node(root), children: descendants(root.id).map(node) }));

    context.vjAtlas = { tree, map, openPin, placing: this.#pinPlacing, isGM: game.user.isGM };
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Resolve a pin's travel setup — the Scene it stands for, where the party lands on
   * it and whether a cinematic introduces the journey — for the pin card's travel bar.
   * Only the GM can act on any of it, so nothing here is resolved for players.
   * @param {object} pin
   * @returns {Promise<object|null>}
   */
  async #resolvePinTravel(pin) {
    if ( !game.user.isGM ) return null;
    const hasCinematic = !!(pin.cinematicVideo || pin.cinematicMacro);
    if ( !pin.sceneUuid && !hasCinematic ) return null;

    let scene = null;
    if ( pin.sceneUuid ) {
      let doc = null;
      try {
        doc = await fromUuid(pin.sceneUuid);
      }
      catch ( err ) { /* Broken reference, rendered as missing */ }
      // A Scene inside a compendium cannot be activated or populated with tokens.
      const usable = (doc?.documentName === "Scene") && !doc.pack;
      const arrival = usable ? arrivalInfo(doc, pin) : null;
      scene = {
        uuid: pin.sceneUuid,
        name: doc?.name ?? game.i18n.localize("VJ.Travel.SceneMissing"),
        thumb: doc?.thumb || doc?.background?.src || "",
        active: !!doc?.active,
        missing: !usable,
        // Flagged on the card when nobody picked the landing spot, so a party is
        // never dropped in the middle of a map by accident.
        arrivalMarked: !!arrival?.marked,
        arrivalKey: arrival?.key ?? "",
        arrivalLabel: arrival?.label ?? ""
      };
    }
    return { scene, hasCinematic };
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preparePagesContext(context, options) {
    await super._preparePagesContext(context, options);
    context.osj = this._prepareVelvetContext();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareSidebarContext(context, options) {
    await super._prepareSidebarContext(context, options);
    context.osj = this._prepareVelvetContext();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.#applyTheme();
    this.#updateBackdrop();
    this.#bindParallax();
    this.element.dataset.osjTab = this.activeTab;
    this.#bindMenuInteractions();
    this.#syncMedia();
    this.#applyAtlasView();
    this.#hardenImages();
    this.#applyNpcFilter();
  }

  /* -------------------------------------------- */

  /**
   * The core sheet disables every `<button>` in the window when the document isn't
   * editable (any non-owner, i.e. every player). That's correct for actions which
   * create, edit or delete content — those controls are already omitted from the
   * templates entirely for non-owners — but several Velvet controls are pure
   * navigation (switching tabs, opening a pin, filtering quests, zooming the atlas)
   * and must stay usable for every viewer, not just the GM.
   * @inheritDoc
   */
  _toggleDisabled(disabled) {
    super._toggleDisabled(disabled);
    if ( !disabled ) return;
    const viewOnly = [
      ".osj-menu-tab", ".osj-dash-stat", ".osj-quest-tab", ".osj-atlas-node-btn",
      ".osj-atlas-controls button", ".osj-modal-close", ".osj-pin",
      ".osj-dcard-tools button[data-action='vjCardMute']",
      "button[data-action='vjRefOpen']",
      ".osj-npc-search-input", ".osj-npc-location-select"
    ];
    for ( const el of this.element.querySelectorAll(viewOnly.join(", ")) ) el.disabled = false;
  }

  /* -------------------------------------------- */

  /**
   * Opt structural images out of the core sheet's click-to-popout behavior,
   * which would otherwise open an ImagePopout over our own interactions.
   */
  #hardenImages() {
    const selectors = [
      ".osj-menu img", ".osj-side-brand img", ".osj-hero-media img", ".osj-hero-logo",
      ".osj-dcard-media img", ".osj-npc-frame img", ".osj-quest-img",
      ".osj-atlas-frame > img", ".osj-modal-media img", ".osj-atlas-npc img", ".osj-atlas-item img",
      ".osj-reward-item img"
    ];
    for ( const img of this.element.querySelectorAll(selectors.join(", ")) ) {
      img.classList.add("nopopout");
    }
  }

  /* -------------------------------------------- */

  /**
   * Apply the current quick-search text and location filter to the NPC gallery.
   * Runs entirely client-side against the rendered cards, so it responds instantly
   * and survives re-renders triggered by unrelated edits.
   */
  #applyNpcFilter() {
    const panel = this.element.querySelector(".osj-panel-npcs");
    if ( !panel ) return;
    const search = this.#npcSearch.trim().toLowerCase();
    const filter = this.#npcMapFilter;
    let visible = 0;
    for ( const card of panel.querySelectorAll(".osj-npc-card") ) {
      const name = card.querySelector(".osj-npc-name")?.textContent.toLowerCase() ?? "";
      const role = card.querySelector(".osj-npc-role")?.textContent.toLowerCase() ?? "";
      const matchesSearch = !search || name.includes(search) || role.includes(search);
      const mapId = card.dataset.mapId || "";
      const matchesFilter = (filter === "all") || (filter === "unassigned" ? !mapId : mapId === filter);
      const show = matchesSearch && matchesFilter;
      card.hidden = !show;
      if ( show ) visible++;
    }
    const noMatch = panel.querySelector(".osj-npc-no-match");
    if ( noMatch ) noMatch.hidden = visible > 0;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onClose(options) {
    super._onClose(options);
    this.#themeConfig?.close();
  }

  /* -------------------------------------------- */
  /*  Theme Application                           */
  /* -------------------------------------------- */

  /**
   * Apply theme classes and CSS custom properties to the application frame.
   */
  #applyTheme() {
    const t = this.theme;
    const el = this.element;
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.dataset.osjEdition = getModuleTheme();
    el.classList.toggle("osj-light", t.mode === "light");
    el.classList.toggle("osj-no-anim", !t.animations || reducedMotion);
    el.classList.toggle("osj-parallax", !!t.parallax && t.animations && !reducedMotion);
    const vars = {
      "--osj-accent": t.accent,
      "--osj-accent-2": t.accent2,
      "--osj-bg-blur": `${t.blur}px`,
      "--osj-bg-brightness": `${t.brightness}%`,
      "--osj-bg-fit": t.fit,
      "--osj-bg-pos": `${t.posX}% ${t.posY}%`,
      "--osj-overlay": t.overlay,
      "--osj-overlay-alpha": String((t.overlayOpacity ?? 0) / 100)
    };
    for ( const [k, v] of Object.entries(vars) ) el.style.setProperty(k, v);
  }

  /* -------------------------------------------- */

  /**
   * Create or refresh the full-window backdrop layer (image or video).
   */
  #updateBackdrop() {
    const t = this.theme;
    let backdrop = this.element.querySelector(":scope > .osj-backdrop");
    if ( !backdrop ) {
      backdrop = document.createElement("div");
      backdrop.className = "osj-backdrop";
      backdrop.setAttribute("aria-hidden", "true");
      this.element.prepend(backdrop);
    }
    const key = `${t.background}|${t.fit}`;
    if ( backdrop.dataset.key === key ) return;
    backdrop.dataset.key = key;
    backdrop.replaceChildren();
    if ( t.background ) {
      let media;
      if ( foundry.helpers.media.VideoHelper.hasVideoExtension(t.background) ) {
        media = document.createElement("video");
        media.autoplay = true;
        media.loop = true;
        media.muted = true;
        media.playsInline = true;
        media.disablePictureInPicture = true;
      }
      else {
        media = document.createElement("img");
        media.alt = "";
      }
      media.className = "osj-backdrop-media";
      media.src = t.background;
      backdrop.append(media);
    }
    const overlay = document.createElement("div");
    overlay.className = "osj-backdrop-overlay";
    backdrop.append(overlay);
  }

  /* -------------------------------------------- */

  /**
   * Track content scrolling to drive the GPU-accelerated hero parallax.
   */
  #bindParallax() {
    const scroller = this.element.querySelector(".journal-entry-pages");
    if ( !scroller || scroller.dataset.osjParallax ) return;
    scroller.dataset.osjParallax = "1";
    scroller.addEventListener("scroll", () => {
      if ( this.#scrollQueued ) return;
      this.#scrollQueued = true;
      requestAnimationFrame(() => {
        this.#scrollQueued = false;
        this.element.style.setProperty("--osj-scroll", String(scroller.scrollTop));
      });
    }, { passive: true });
  }

  /* -------------------------------------------- */
  /*  Menu Interactions                           */
  /* -------------------------------------------- */

  /**
   * Bind non-action listeners (drag & drop, keyboard, details state) to the menu panels.
   * Part elements are replaced on re-render, so each fresh element is bound exactly once.
   */
  #bindMenuInteractions() {
    const root = this.element;

    // Dashboard: drop a document to create a card, drag cards to reorder.
    const dash = root.querySelector(".osj-panel-dashboard");
    if ( dash && !dash.dataset.vjBound ) {
      dash.dataset.vjBound = "1";
      dash.addEventListener("dragover", ev => { if ( this.isEditable ) ev.preventDefault(); });
      dash.addEventListener("drop", ev => this.#onDropDashboard(ev));
      dash.addEventListener("dragstart", ev => {
        const card = ev.target.closest?.(".osj-dcard");
        if ( !card || !this.isEditable ) return;
        ev.dataTransfer.setData("text/plain", JSON.stringify({ type: "velvet-card", vjCardId: card.dataset.cardId }));
      });
    }

    // NPC gallery: drop actors to add, drag cards to reorder or onto the canvas.
    const npcs = root.querySelector(".osj-panel-npcs");
    if ( npcs && !npcs.dataset.vjBound ) {
      npcs.dataset.vjBound = "1";
      npcs.addEventListener("dragover", ev => { if ( this.isEditable ) ev.preventDefault(); });
      npcs.addEventListener("drop", ev => this.#onDropNpcs(ev));
      npcs.addEventListener("dragstart", ev => {
        const card = ev.target.closest?.(".osj-npc-card");
        if ( !card ) return;
        ev.dataTransfer.setData("text/plain", JSON.stringify({
          type: "Actor",
          uuid: card.dataset.uuid,
          vjNpcId: card.dataset.npcId
        }));
      });
      const npcSearch = npcs.querySelector(".osj-npc-search-input");
      npcSearch?.addEventListener("input", () => {
        this.#npcSearch = npcSearch.value;
        this.#applyNpcFilter();
      });
      const npcLocation = npcs.querySelector(".osj-npc-location-select");
      npcLocation?.addEventListener("change", () => {
        this.#npcMapFilter = npcLocation.value;
        this.#applyNpcFilter();
      });
    }

    // Atlas: wheel zoom, drag pan, double-click to place pins, drag pins to move them.
    const atlas = root.querySelector(".osj-panel-atlas");
    if ( atlas && !atlas.dataset.vjBound ) {
      atlas.dataset.vjBound = "1";
      this.#bindAtlasInteractions(atlas);
    }

    // Quest tracker: remember expanded quests, add objectives with Enter.
    const quests = root.querySelector(".osj-panel-quests");
    if ( quests && !quests.dataset.vjBound ) {
      quests.dataset.vjBound = "1";
      quests.addEventListener("toggle", ev => {
        const details = ev.target;
        if ( !details.classList?.contains("osj-quest-card") ) return;
        if ( details.open ) this.#openQuests.add(details.dataset.questId);
        else this.#openQuests.delete(details.dataset.questId);
      }, true);
      quests.addEventListener("keydown", ev => {
        if ( ev.key !== "Enter" ) return;
        const input = ev.target.closest?.(".osj-obj-input");
        if ( !input ) return;
        ev.preventDefault();
        input.closest(".osj-obj-add")?.querySelector("[data-action='vjObjectiveAdd']")?.click();
      });
      // Drop an Item (from a compendium, sidebar or actor sheet) to add it as a quest reward.
      quests.addEventListener("dragover", ev => {
        if ( this.isEditable && ev.target.closest(".osj-quest-rewards") ) ev.preventDefault();
      });
      quests.addEventListener("drop", ev => this.#onDropQuestReward(ev));
    }
  }

  /* -------------------------------------------- */

  /**
   * The pan & zoom state for the active map.
   * @returns {{x: number, y: number, scale: number}}
   */
  get #atlasView() {
    const id = this.#activeMapId ?? "";
    if ( !this.#atlasViews.has(id) ) this.#atlasViews.set(id, { x: 0, y: 0, scale: 1 });
    return this.#atlasViews.get(id);
  }

  /**
   * Apply the current pan & zoom state to the atlas canvas.
   */
  #applyAtlasView() {
    const canvas = this.element.querySelector(".osj-atlas-canvas");
    if ( !canvas ) return;
    const view = this.#atlasView;
    canvas.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    canvas.style.setProperty("--osj-atlas-scale", String(view.scale));
    const label = this.element.querySelector(".osj-atlas-zoom-label");
    if ( label ) label.textContent = `${Math.round(view.scale * 100)}%`;
  }

  /**
   * Zoom the atlas by a factor, keeping the given viewport point stationary.
   * @param {number} factor
   * @param {number} [cx]  Viewport-relative x anchor in pixels.
   * @param {number} [cy]  Viewport-relative y anchor in pixels.
   */
  #atlasZoom(factor, cx, cy) {
    const viewport = this.element.querySelector(".osj-atlas-viewport");
    if ( !viewport ) return;
    const view = this.#atlasView;
    const scale = Math.clamp(view.scale * factor, 0.4, 6);
    const applied = scale / view.scale;
    if ( applied === 1 ) return;
    const rect = viewport.getBoundingClientRect();
    const ax = cx ?? rect.width / 2;
    const ay = cy ?? rect.height / 2;
    view.x = ax - (ax - view.x) * applied;
    view.y = ay - (ay - view.y) * applied;
    view.scale = scale;
    this.#applyAtlasView();
  }

  /**
   * Convert a pointer event to percentage coordinates on the map image.
   * @param {MouseEvent} event
   * @returns {{x: number, y: number}|null}
   */
  #atlasEventCoords(event) {
    const img = this.element.querySelector(".osj-atlas-frame > img");
    if ( !img ) return null;
    const rect = img.getBoundingClientRect();
    if ( !rect.width || !rect.height ) return null;
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    if ( (x < 0) || (x > 100) || (y < 0) || (y > 100) ) return null;
    return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
  }

  /**
   * Wire pointer, wheel and drop interactions for the atlas panel.
   * @param {HTMLElement} atlas
   */
  #bindAtlasInteractions(atlas) {
    const viewport = atlas.querySelector(".osj-atlas-viewport");

    if ( viewport ) {
      // Wheel zoom toward the cursor.
      viewport.addEventListener("wheel", event => {
        event.preventDefault();
        const rect = viewport.getBoundingClientRect();
        this.#atlasZoom(event.deltaY < 0 ? 1.18 : 1 / 1.18, event.clientX - rect.left, event.clientY - rect.top);
      }, { passive: false });

      // Drag to pan the map; drag a pin to move it (owners only).
      // The pointer is only captured once a real drag starts, so plain clicks
      // still reach the pins and trigger their open action.
      let gesture = null;
      let suppressClick = false;

      viewport.addEventListener("pointerdown", event => {
        if ( event.button !== 0 ) return;
        const pin = event.target.closest(".osj-pin");
        if ( pin && !this.isEditable ) return;
        gesture = {
          pin: pin ?? null,
          x: event.clientX,
          y: event.clientY,
          dragging: false
        };
      });

      viewport.addEventListener("pointermove", event => {
        if ( !gesture ) return;
        if ( !gesture.dragging ) {
          if ( Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 4 ) return;
          gesture.dragging = true;
          viewport.setPointerCapture(event.pointerId);
        }
        if ( gesture.pin ) {
          const coords = this.#atlasEventCoords(event);
          if ( !coords ) return;
          gesture.pin.style.left = `${coords.x}%`;
          gesture.pin.style.top = `${coords.y}%`;
        }
        else {
          const view = this.#atlasView;
          view.x += event.clientX - gesture.x;
          view.y += event.clientY - gesture.y;
          gesture.x = event.clientX;
          gesture.y = event.clientY;
          this.#applyAtlasView();
        }
      });

      viewport.addEventListener("pointerup", async event => {
        const g = gesture;
        gesture = null;
        if ( !g?.dragging ) return;
        suppressClick = true;
        if ( !g.pin ) return;
        const coords = this.#atlasEventCoords(event);
        if ( !coords ) return;
        const maps = getMaps(this.entry);
        const stored = maps.find(m => m.id === this.#activeMapId)?.pins?.find(p => p.id === g.pin.dataset.pinId);
        if ( !stored ) return;
        stored.x = coords.x;
        stored.y = coords.y;
        await setMaps(this.entry, maps);
      });

      viewport.addEventListener("pointercancel", () => { gesture = null; });

      // A drag gesture must not fire the pin's open action.
      viewport.addEventListener("click", event => {
        if ( !suppressClick ) return;
        suppressClick = false;
        event.preventDefault();
        event.stopPropagation();
      }, true);

      // Double-click on the map places a new pin (owners only).
      viewport.addEventListener("dblclick", event => {
        if ( !this.isEditable || event.target.closest(".osj-pin") ) return;
        const coords = this.#atlasEventCoords(event);
        if ( !coords ) return;
        event.preventDefault();
        event.stopPropagation();
        this.#placePinAt(coords);
      });

      // Pin-placement mode: a single click on the map places a POI.
      viewport.addEventListener("click", event => {
        if ( !this.#pinPlacing || !this.isEditable ) return;
        if ( event.target.closest(".osj-pin") ) return;
        const coords = this.#atlasEventCoords(event);
        if ( !coords ) return;
        event.preventDefault();
        event.stopPropagation();
        this.#placePinAt(coords);
      });
    }

    // Drop actors and items onto the open modal to attach them to the pin.
    const modal = atlas.querySelector(".osj-modal-card");
    if ( modal ) {
      modal.addEventListener("dragover", event => { if ( this.isEditable ) event.preventDefault(); });
      modal.addEventListener("drop", event => this.#onDropAtlasModal(event));
      modal.addEventListener("dragstart", event => {
        const chip = event.target.closest("[data-ref-uuid]");
        if ( !chip ) return;
        event.dataTransfer.setData("text/plain", JSON.stringify({ type: chip.dataset.refKind === "npcs" ? "Actor" : "Item", uuid: chip.dataset.refUuid }));
      });
    }
  }

  /* -------------------------------------------- */

  /**
   * Open the pin editor and create a POI at the given map coordinates.
   * @param {{x: number, y: number}} coords
   */
  async #placePinAt(coords) {
    const maps = getMaps(this.entry);
    const data = await editPinDialog({}, maps);
    if ( !data ) return;
    const map = maps.find(m => m.id === this.#activeMapId);
    if ( !map ) return;
    map.pins = Array.isArray(map.pins) ? map.pins : [];
    const pin = createPin(coords.x, coords.y, data);
    map.pins.push(pin);
    this.#pinPlacing = false;
    this.#openPinId = pin.id;
    await setMaps(this.entry, maps);
  }

  /* -------------------------------------------- */

  /**
   * Handle a document dropped onto the open pin modal: actors join the cast,
   * items stock the shop.
   * @param {DragEvent} event
   */
  async #onDropAtlasModal(event) {
    if ( !this.isEditable || !this.#openPinId ) return;
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if ( !data?.uuid || !["Actor", "Item", "Scene"].includes(data.type) ) return;
    event.preventDefault();
    event.stopPropagation();
    const maps = getMaps(this.entry);
    const pin = maps.find(m => m.id === this.#activeMapId)?.pins?.find(p => p.id === this.#openPinId);
    if ( !pin ) return;

    // A dropped scene makes this place somewhere the party can actually be taken to.
    if ( data.type === "Scene" ) {
      pin.sceneUuid = data.uuid;
      pin.arrival = null;
      return setMaps(this.entry, maps);
    }

    const key = data.type === "Actor" ? "npcs" : "items";
    pin[key] = Array.isArray(pin[key]) ? pin[key] : [];
    if ( pin[key].includes(data.uuid) ) return ui.notifications.info(game.i18n.localize("VJ.Atlas.Duplicate"));
    pin[key].push(data.uuid);
    await setMaps(this.entry, maps);
  }

  /* -------------------------------------------- */

  /**
   * Handle an Item dropped onto a quest's rewards section: adds it, or bumps
   * its quantity if already granted.
   * @param {DragEvent} event
   */
  async #onDropQuestReward(event) {
    if ( !this.isEditable ) return;
    const container = event.target.closest(".osj-quest-rewards");
    if ( !container ) return;
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if ( (data?.type !== "Item") || !data.uuid ) return;
    event.preventDefault();
    event.stopPropagation();
    await this.#updateQuest(container.dataset.questId, quest => {
      quest.rewards = createRewards(quest.rewards);
      const existing = quest.rewards.items.find(i => i.uuid === data.uuid);
      if ( existing ) existing.qty = (existing.qty ?? 1) + 1;
      else quest.rewards.items.push(createRewardItem(data.uuid));
    });
  }

  /* -------------------------------------------- */

  /**
   * Pause videos in inactive panels and resume those in the visible one.
   */
  #syncMedia() {
    const active = this.element.dataset.osjTab;
    for ( const video of this.element.querySelectorAll(".osj-panel video") ) {
      const panel = video.closest(".osj-panel");
      const visible = (active === "dashboard" && panel?.classList.contains("osj-panel-dashboard"))
        || (active === "npcs" && panel?.classList.contains("osj-panel-npcs"))
        || (active === "quests" && panel?.classList.contains("osj-panel-quests"));
      if ( visible ) video.play().catch(() => {});
      else video.pause();
    }
  }

  /* -------------------------------------------- */

  /**
   * Switch the visible menu tab without a re-render.
   * @param {string} tab
   */
  #activateTab(tab) {
    this.#activeTab = tab;
    this.element.dataset.osjTab = tab;
    for ( const button of this.element.querySelectorAll(".osj-menu-tab") ) {
      button.classList.toggle("active", button.dataset.tab === tab);
    }
    this.#syncMedia();
  }

  /* -------------------------------------------- */

  /**
   * Handle a document dropped onto the dashboard: reorder cards or create one from the document.
   * @param {DragEvent} event
   */
  async #onDropDashboard(event) {
    if ( !this.isEditable ) return;
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if ( !data ) return;
    const cards = getCards(this.entry);

    // Reorder an existing card.
    if ( data.vjCardId ) {
      event.preventDefault();
      event.stopPropagation();
      const from = cards.findIndex(c => c.id === data.vjCardId);
      if ( from < 0 ) return;
      const targetCard = event.target.closest?.(".osj-dcard");
      const targetEntry = (targetCard && (targetCard.dataset.cardId !== data.vjCardId))
        ? cards.find(c => c.id === targetCard.dataset.cardId)
        : null;
      let to = targetEntry ? cards.findIndex(c => c.id === targetEntry.id) : cards.length - 1;
      if ( to < 0 || to === from ) return;
      const [moved] = cards.splice(from, 1);
      // Dropping a card onto another one adopts its section, so reordering doubles as organizing.
      if ( targetEntry ) moved.category = targetEntry.category ?? "";
      cards.splice(to, 0, moved);
      return setCards(this.entry, cards);
    }

    // Create a card from any dropped document.
    if ( !data.uuid || data.vjNpcId ) return;
    event.preventDefault();
    event.stopPropagation();
    const doc = await fromUuid(data.uuid);
    if ( !doc ) return;
    const media = doc.thumb || doc.img || doc.background?.src || "";
    cards.push(createCard({ title: doc.name ?? "", media, uuid: data.uuid }));
    await setCards(this.entry, cards);
  }

  /* -------------------------------------------- */

  /**
   * Handle a drop onto the NPC gallery: add a new actor or reorder existing cards.
   * @param {DragEvent} event
   */
  async #onDropNpcs(event) {
    if ( !this.isEditable ) return;
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if ( !data ) return;
    const npcs = getNpcs(this.entry);

    // Reorder an existing gallery entry.
    if ( data.vjNpcId ) {
      event.preventDefault();
      event.stopPropagation();
      const from = npcs.findIndex(n => n.id === data.vjNpcId);
      if ( from < 0 ) return;
      const targetCard = event.target.closest?.(".osj-npc-card");
      let to = targetCard ? npcs.findIndex(n => n.id === targetCard.dataset.npcId) : npcs.length - 1;
      if ( to < 0 || to === from ) return;
      const [moved] = npcs.splice(from, 1);
      npcs.splice(to, 0, moved);
      return setNpcs(this.entry, npcs);
    }

    // Add a dropped actor.
    if ( data.type !== "Actor" || !data.uuid ) return;
    event.preventDefault();
    event.stopPropagation();
    if ( npcs.some(n => n.uuid === data.uuid) ) {
      return ui.notifications.info(game.i18n.localize("VJ.Npcs.Duplicate"));
    }
    const actor = await fromUuid(data.uuid);
    if ( !actor ) return;
    npcs.push(createNpc(data.uuid));
    await setNpcs(this.entry, npcs);
  }

  /* -------------------------------------------- */

  /**
   * Apply a mutation to a stored quest and persist the result.
   * @param {string} questId
   * @param {(quest: object) => void} mutate
   */
  async #updateQuest(questId, mutate) {
    const quests = getQuests(this.entry);
    const quest = quests.find(q => q.id === questId);
    if ( !quest ) return;
    mutate(quest);
    await setQuests(this.entry, quests);
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /**
   * Open the Velvet theme configuration for this entry.
   * @this {VelvetJournalSheet}
   */
  static #onThemeConfig() {
    this.#themeConfig ??= new VelvetThemeConfig({ document: this.entry });
    this.#themeConfig.render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Activate a menu tab.
   * @this {VelvetJournalSheet}
   */
  static #onTab(event, target) {
    this.#activateTab(target.dataset.tab);
  }

  /* -------------------------------------------- */

  /**
   * Create a new dashboard card through the editor dialog.
   * @this {VelvetJournalSheet}
   */
  static async #onCardAdd() {
    if ( !this.isEditable ) return;
    const cards = getCards(this.entry);
    const data = await editCardDialog({}, cardCategories(cards));
    if ( !data ) return;
    cards.push(createCard(data));
    await setCards(this.entry, cards);
  }

  /* -------------------------------------------- */

  /**
   * Edit an existing dashboard card.
   * @this {VelvetJournalSheet}
   */
  static async #onCardEdit(event, target) {
    if ( !this.isEditable ) return;
    const cards = getCards(this.entry);
    const card = cards.find(c => c.id === target.dataset.cardId);
    if ( !card ) return;
    const data = await editCardDialog(card, cardCategories(cards));
    if ( !data ) return;
    Object.assign(card, data);
    await setCards(this.entry, cards);
  }

  /* -------------------------------------------- */

  /**
   * Delete a dashboard card after confirmation.
   * @this {VelvetJournalSheet}
   */
  static async #onCardDelete(event, target) {
    if ( !this.isEditable ) return;
    const cards = getCards(this.entry);
    const card = cards.find(c => c.id === target.dataset.cardId);
    if ( !card ) return;
    if ( !await confirmDeleteDialog(card.title || game.i18n.localize("VJ.Cards.Untitled")) ) return;
    await setCards(this.entry, cards.filter(c => c.id !== card.id));
  }

  /* -------------------------------------------- */

  /**
   * Open the target linked by a dashboard card: URL, scene, macro, page or document sheet.
   * @this {VelvetJournalSheet}
   */
  static async #onCardOpen(event, target) {
    const card = getCards(this.entry).find(c => c.id === target.dataset.cardId);
    if ( !card ) return;
    if ( card.url ) return window.open(card.url, "_blank", "noopener");
    if ( !card.uuid ) return;
    const doc = await fromUuid(card.uuid);
    if ( !doc ) return ui.notifications.warn(game.i18n.localize("VJ.Dashboard.OpenMissing"));
    if ( doc.documentName === "Scene" ) return doc.view();
    if ( doc.documentName === "Macro" ) return doc.execute();
    if ( doc.documentName === "RollTable" ) return doc.draw();
    if ( doc.documentName === "Playlist" ) return doc.playing ? doc.stopAll() : doc.playAll();
    if ( doc.documentName === "JournalEntryPage" ) {
      if ( doc.parent === this.entry ) {
        this.#activateTab("pages");
        if ( typeof this.goToPage === "function" ) this.goToPage(doc.id);
        return;
      }
      const sheet = doc.parent.sheet;
      await sheet.render(true);
      if ( typeof sheet.goToPage === "function" ) sheet.goToPage(doc.id);
      return;
    }
    if ( (doc.documentName === "JournalEntry") && (doc === this.entry) ) return this.#activateTab("pages");
    return doc.sheet?.render(true);
  }

  /* -------------------------------------------- */

  /**
   * Toggle the sound of a video card.
   * @this {VelvetJournalSheet}
   */
  static #onCardMute(event, target) {
    const video = target.closest(".osj-dcard")?.querySelector("video");
    if ( !video ) return;
    video.muted = !video.muted;
    if ( !video.muted ) video.play().catch(() => {});
    const icon = target.querySelector("i");
    if ( icon ) icon.className = video.muted ? "fa-solid fa-volume-xmark" : "fa-solid fa-volume-high";
    target.classList.toggle("unmuted", !video.muted);
  }

  /* -------------------------------------------- */

  /**
   * Open the dossier modal for an NPC gallery entry: portrait, role and bio,
   * with a shortcut to the actual character sheet.
   * @this {VelvetJournalSheet}
   */
  static #onNpcOpen(event, target) {
    this.#openNpcId = target.dataset.npcId;
    this.render({ parts: ["npcs"] });
  }

  /* -------------------------------------------- */

  /**
   * Edit the display data of an NPC gallery entry.
   * @this {VelvetJournalSheet}
   */
  static async #onNpcEdit(event, target) {
    if ( !this.isEditable ) return;
    const npcs = getNpcs(this.entry);
    const ref = npcs.find(n => n.id === target.dataset.npcId);
    if ( !ref ) return;
    const actor = await fromUuid(ref.uuid);
    const data = await editNpcDialog(ref, actor?.name ?? game.i18n.localize("VJ.Npcs.Missing"), getMaps(this.entry));
    if ( !data ) return;
    Object.assign(ref, data);
    await setNpcs(this.entry, npcs);
  }

  /* -------------------------------------------- */

  /**
   * Remove an NPC from the gallery after confirmation.
   * @this {VelvetJournalSheet}
   */
  static async #onNpcDelete(event, target) {
    if ( !this.isEditable ) return;
    const npcs = getNpcs(this.entry);
    const ref = npcs.find(n => n.id === target.dataset.npcId);
    if ( !ref ) return;
    const actor = await fromUuid(ref.uuid);
    if ( !await confirmDeleteDialog(actor?.name ?? game.i18n.localize("VJ.Npcs.Missing")) ) return;
    await setNpcs(this.entry, npcs.filter(n => n.id !== ref.id));
  }

  /* -------------------------------------------- */

  /**
   * Toggle player visibility of an NPC gallery entry.
   * @this {VelvetJournalSheet}
   */
  static async #onNpcHide(event, target) {
    if ( !this.isEditable ) return;
    const npcs = getNpcs(this.entry);
    const ref = npcs.find(n => n.id === target.dataset.npcId);
    if ( !ref ) return;
    ref.hidden = !ref.hidden;
    await setNpcs(this.entry, npcs);
  }

  /* -------------------------------------------- */

  /**
   * Create a new quest through the editor dialog.
   * @this {VelvetJournalSheet}
   */
  static async #onQuestAdd() {
    if ( !this.isEditable ) return;
    const data = await editQuestDialog();
    if ( !data ) return;
    data.rewards = createRewards(data.rewards);
    const quests = getQuests(this.entry);
    const quest = createQuest(data);
    quests.push(quest);
    this.#openQuests.add(quest.id);
    this.#questFilter = quest.status;
    await setQuests(this.entry, quests);
  }

  /* -------------------------------------------- */

  /**
   * Edit an existing quest.
   * @this {VelvetJournalSheet}
   */
  static async #onQuestEdit(event, target) {
    if ( !this.isEditable ) return;
    const quests = getQuests(this.entry);
    const quest = quests.find(q => q.id === target.dataset.questId);
    if ( !quest ) return;
    const data = await editQuestDialog(quest);
    if ( !data ) return;
    // The dialog only edits currency/xp/other — preserve reward items dropped onto the card.
    if ( data.rewards ) data.rewards = createRewards({ ...quest.rewards, ...data.rewards, items: quest.rewards?.items ?? [] });
    Object.assign(quest, data);
    await setQuests(this.entry, quests);
  }

  /* -------------------------------------------- */

  /**
   * Delete a quest after confirmation.
   * @this {VelvetJournalSheet}
   */
  static async #onQuestDelete(event, target) {
    if ( !this.isEditable ) return;
    const quests = getQuests(this.entry);
    const quest = quests.find(q => q.id === target.dataset.questId);
    if ( !quest ) return;
    if ( !await confirmDeleteDialog(quest.name || game.i18n.localize("VJ.Quests.Untitled")) ) return;
    await setQuests(this.entry, quests.filter(q => q.id !== quest.id));
  }

  /* -------------------------------------------- */

  /**
   * Move a quest to another status (active, done, failed).
   * @this {VelvetJournalSheet}
   */
  static async #onQuestStatus(event, target) {
    if ( !this.isEditable ) return;
    const status = target.dataset.status;
    this.#questFilter = status;
    await this.#updateQuest(target.dataset.questId, quest => { quest.status = status; });
  }

  /* -------------------------------------------- */

  /**
   * Toggle player visibility of a quest.
   * @this {VelvetJournalSheet}
   */
  static async #onQuestHide(event, target) {
    if ( !this.isEditable ) return;
    await this.#updateQuest(target.dataset.questId, quest => { quest.hidden = !quest.hidden; });
  }

  /* -------------------------------------------- */

  /**
   * Switch the quest status filter without a re-render.
   * @this {VelvetJournalSheet}
   */
  static #onQuestFilter(event, target) {
    this.#questFilter = target.dataset.filter;
    const panel = this.element.querySelector(".osj-panel-quests");
    if ( !panel ) return;
    panel.dataset.questFilter = this.#questFilter;
    for ( const button of panel.querySelectorAll(".osj-quest-tab") ) {
      button.classList.toggle("active", button.dataset.filter === this.#questFilter);
    }
  }

  /* -------------------------------------------- */

  /**
   * Toggle completion of a quest objective.
   * @this {VelvetJournalSheet}
   */
  static async #onObjectiveToggle(event, target) {
    if ( !this.isEditable ) return;
    await this.#updateQuest(target.dataset.questId, quest => {
      const objective = (quest.objectives ?? []).find(o => o.id === target.dataset.objId);
      if ( objective ) objective.done = !objective.done;
    });
  }

  /* -------------------------------------------- */

  /**
   * Append a new objective to a quest from the inline input.
   * @this {VelvetJournalSheet}
   */
  static async #onObjectiveAdd(event, target) {
    if ( !this.isEditable ) return;
    const input = target.closest(".osj-obj-add")?.querySelector(".osj-obj-input");
    const text = input?.value.trim();
    if ( !text ) return;
    await this.#updateQuest(target.dataset.questId, quest => {
      quest.objectives = Array.isArray(quest.objectives) ? quest.objectives : [];
      quest.objectives.push(createObjective(text));
    });
  }

  /* -------------------------------------------- */

  /**
   * Remove an objective from a quest.
   * @this {VelvetJournalSheet}
   */
  static async #onObjectiveDelete(event, target) {
    if ( !this.isEditable ) return;
    await this.#updateQuest(target.dataset.questId, quest => {
      quest.objectives = (quest.objectives ?? []).filter(o => o.id !== target.dataset.objId);
    });
  }

  /* -------------------------------------------- */

  /**
   * Increase the quantity of a reward item by one.
   * @this {VelvetJournalSheet}
   */
  static async #onRewardQtyInc(event, target) {
    if ( !this.isEditable ) return;
    await this.#updateQuest(target.dataset.questId, quest => {
      const item = quest.rewards?.items?.find(i => i.uuid === target.dataset.itemUuid);
      if ( item ) item.qty = (item.qty ?? 1) + 1;
    });
  }

  /**
   * Decrease the quantity of a reward item by one, removing it at zero.
   * @this {VelvetJournalSheet}
   */
  static async #onRewardQtyDec(event, target) {
    if ( !this.isEditable ) return;
    await this.#updateQuest(target.dataset.questId, quest => {
      const items = quest.rewards?.items ?? [];
      const item = items.find(i => i.uuid === target.dataset.itemUuid);
      if ( !item ) return;
      item.qty = (item.qty ?? 1) - 1;
      if ( item.qty <= 0 ) quest.rewards.items = items.filter(i => i.uuid !== item.uuid);
    });
  }

  /**
   * Remove a reward item from a quest.
   * @this {VelvetJournalSheet}
   */
  static async #onRewardItemRemove(event, target) {
    if ( !this.isEditable ) return;
    await this.#updateQuest(target.dataset.questId, quest => {
      if ( quest.rewards ) quest.rewards.items = (quest.rewards.items ?? []).filter(i => i.uuid !== target.dataset.itemUuid);
    });
  }

  /* -------------------------------------------- */

  /**
   * Create a new atlas map through the editor dialog.
   * @this {VelvetJournalSheet}
   */
  static async #onMapAdd() {
    if ( !this.isEditable ) return;
    const maps = getMaps(this.entry);
    const data = await editMapDialog({}, maps);
    if ( !data ) return;
    const map = createMap(data);
    maps.push(map);
    this.#activeMapId = map.id;
    this.#openPinId = null;
    await setMaps(this.entry, maps);
  }

  /* -------------------------------------------- */

  /**
   * Edit the active atlas map.
   * @this {VelvetJournalSheet}
   */
  static async #onMapEdit(event, target) {
    if ( !this.isEditable ) return;
    const maps = getMaps(this.entry);
    const map = maps.find(m => m.id === (target.dataset.mapId || this.#activeMapId));
    if ( !map ) return;
    const data = await editMapDialog(map, maps);
    if ( !data ) return;
    if ( data.parent === map.id ) data.parent = "";
    Object.assign(map, data);
    await setMaps(this.entry, maps);
  }

  /* -------------------------------------------- */

  /**
   * Delete the active atlas map after confirmation.
   * @this {VelvetJournalSheet}
   */
  static async #onMapDelete(event, target) {
    if ( !this.isEditable ) return;
    const maps = getMaps(this.entry);
    const map = maps.find(m => m.id === (target.dataset.mapId || this.#activeMapId));
    if ( !map ) return;
    if ( !await confirmDeleteDialog(map.name || game.i18n.localize("VJ.Atlas.Untitled")) ) return;
    if ( this.#activeMapId === map.id ) this.#activeMapId = null;
    this.#openPinId = null;
    const remaining = maps.filter(m => m.id !== map.id);
    for ( const m of remaining ) {
      if ( m.parent === map.id ) m.parent = map.parent ?? "";
    }
    await setMaps(this.entry, remaining);
  }

  /* -------------------------------------------- */

  /**
   * Toggle player visibility of an atlas map, so a region can be drawn and pinned
   * well before the table is meant to know it exists.
   * @this {VelvetJournalSheet}
   */
  static async #onMapHide(event, target) {
    if ( !this.isEditable ) return;
    const maps = getMaps(this.entry);
    const map = maps.find(m => m.id === (target.dataset.mapId || this.#activeMapId));
    if ( !map ) return;
    map.hidden = !map.hidden;
    await setMaps(this.entry, maps);
  }

  /* -------------------------------------------- */

  /**
   * Display another atlas map.
   * @this {VelvetJournalSheet}
   */
  static #onMapSelect(event, target) {
    if ( target.dataset.mapId === this.#activeMapId ) return;
    this.#activeMapId = target.dataset.mapId;
    this.#openPinId = null;
    this.render({ parts: ["atlas"] });
  }

  /* -------------------------------------------- */

  /**
   * Zoom the atlas in around its center.
   * @this {VelvetJournalSheet}
   */
  static #onAtlasZoomIn() {
    this.#atlasZoom(1.3);
  }

  /**
   * Zoom the atlas out around its center.
   * @this {VelvetJournalSheet}
   */
  static #onAtlasZoomOut() {
    this.#atlasZoom(1 / 1.3);
  }

  /**
   * Reset the atlas pan & zoom.
   * @this {VelvetJournalSheet}
   */
  static #onAtlasReset() {
    const view = this.#atlasView;
    view.x = 0;
    view.y = 0;
    view.scale = 1;
    this.#applyAtlasView();
  }

  /**
   * Toggle pin-placement mode: while active, clicking the map places a POI.
   * @this {VelvetJournalSheet}
   */
  static #onPinPlaceMode(event, target) {
    if ( !this.isEditable ) return;
    this.#pinPlacing = !this.#pinPlacing;
    target.classList.toggle("active", this.#pinPlacing);
    this.element.querySelector(".osj-atlas-stage")?.classList.toggle("placing", this.#pinPlacing);
  }

  /* -------------------------------------------- */

  /**
   * Open the modal card of a map pin, or travel to its linked map.
   * @this {VelvetJournalSheet}
   */
  static #onPinOpen(event, target) {
    const maps = this.#visibleMaps();
    const pin = maps.find(m => m.id === this.#activeMapId)?.pins?.find(p => p.id === target.dataset.pinId);
    if ( pin?.mapLink && maps.some(m => m.id === pin.mapLink) ) {
      this.#activeMapId = pin.mapLink;
      this.#openPinId = null;
    }
    else this.#openPinId = target.dataset.pinId;
    this.render({ parts: ["atlas"] });
  }

  /**
   * Close whichever dossier modal is currently open (a map pin or an NPC).
   * @this {VelvetJournalSheet}
   */
  static #onModalClose() {
    const parts = [];
    if ( this.#openPinId ) { this.#openPinId = null; parts.push("atlas"); }
    if ( this.#openNpcId ) { this.#openNpcId = null; parts.push("npcs"); }
    if ( parts.length ) this.render({ parts });
  }

  /* -------------------------------------------- */

  /**
   * Apply a mutation to the currently open pin and persist the result.
   * @param {(pin: object, maps: object[]) => void|false} mutate  Return false to abort.
   */
  async #updateOpenPin(mutate) {
    const maps = getMaps(this.entry);
    const map = maps.find(m => m.id === this.#activeMapId);
    const pin = map?.pins?.find(p => p.id === this.#openPinId);
    if ( !pin ) return;
    if ( mutate(pin, maps) === false ) return;
    await setMaps(this.entry, maps);
  }

  /* -------------------------------------------- */

  /**
   * Edit the open pin through the editor dialog.
   * @this {VelvetJournalSheet}
   */
  static async #onPinEdit() {
    if ( !this.isEditable ) return;
    const maps = getMaps(this.entry);
    const pin = maps.find(m => m.id === this.#activeMapId)?.pins?.find(p => p.id === this.#openPinId);
    if ( !pin ) return;
    const data = await editPinDialog(pin, maps);
    if ( !data ) return;
    Object.assign(pin, data);
    await setMaps(this.entry, maps);
  }

  /**
   * Delete the open pin after confirmation.
   * @this {VelvetJournalSheet}
   */
  static async #onPinDelete() {
    if ( !this.isEditable ) return;
    const maps = getMaps(this.entry);
    const map = maps.find(m => m.id === this.#activeMapId);
    const pin = map?.pins?.find(p => p.id === this.#openPinId);
    if ( !pin ) return;
    if ( !await confirmDeleteDialog(pin.name || game.i18n.localize("VJ.Atlas.Untitled")) ) return;
    map.pins = map.pins.filter(p => p.id !== pin.id);
    this.#openPinId = null;
    await setMaps(this.entry, maps);
  }

  /**
   * Toggle player visibility of the open pin.
   * @this {VelvetJournalSheet}
   */
  static async #onPinHide() {
    if ( !this.isEditable ) return;
    await this.#updateOpenPin(pin => { pin.hidden = !pin.hidden; });
  }

  /* -------------------------------------------- */

  /**
   * Open the sheet of a document referenced by the pin modal (NPC or item).
   * @this {VelvetJournalSheet}
   */
  static async #onRefOpen(event, target) {
    const doc = await fromUuid(target.dataset.refUuid);
    if ( !doc ) return ui.notifications.warn(game.i18n.localize("VJ.Dashboard.OpenMissing"));
    if ( !doc.testUserPermission(game.user, "LIMITED") ) {
      return ui.notifications.warn(game.i18n.localize("VJ.Npcs.NoViewPermission"));
    }
    doc.sheet?.render(true);
  }

  /**
   * Detach a referenced document (NPC or item) from the open pin.
   * @this {VelvetJournalSheet}
   */
  static async #onRefRemove(event, target) {
    if ( !this.isEditable ) return;
    const { refKind: kind, refUuid: uuid } = target.dataset;
    if ( !["npcs", "items"].includes(kind) ) return;
    await this.#updateOpenPin(pin => {
      pin[kind] = (pin[kind] ?? []).filter(u => u !== uuid);
    });
  }

  /* -------------------------------------------- */

  /**
   * Broadcast a dossier's portrait to every connected player, the same "Show Players"
   * action available from any actor sheet.
   * @this {VelvetJournalSheet}
   */
  static #onShowPlayers(event, target) {
    if ( !this.isEditable ) return;
    const { shareSrc: src, shareTitle: title } = target.dataset;
    if ( !src ) return;
    Journal.showImage(src, { title, showTitle: true });
  }

  /* -------------------------------------------- */
  /*  Travel                                      */
  /* -------------------------------------------- */

  /**
   * The open pin together with the world Scene it links, or null with a warning when
   * the link is broken. Compendium scenes are refused: they cannot be activated, and
   * tokens cannot be created on them.
   * @returns {Promise<{pin: object, scene: Scene}|null>}
   */
  async #openPinTravel() {
    const pin = getMaps(this.entry).find(m => m.id === this.#activeMapId)?.pins?.find(p => p.id === this.#openPinId);
    if ( !pin?.sceneUuid ) return null;
    let doc = null;
    try {
      doc = await fromUuid(pin.sceneUuid);
    }
    catch ( err ) { /* Handled as a broken link below */ }
    if ( (doc?.documentName !== "Scene") || doc.pack ) {
      ui.notifications.warn(game.i18n.localize("VJ.Travel.SceneMissing"));
      return null;
    }
    return { pin, scene: doc };
  }

  /**
   * Preview the pin's scene on the GM's own canvas, without pulling the players to it.
   * @this {VelvetJournalSheet}
   */
  static async #onSceneView() {
    if ( !game.user.isGM ) return;
    const travel = await this.#openPinTravel();
    await travel?.scene.view();
  }

  /**
   * Activate the pin's scene, which moves every connected player onto it.
   * @this {VelvetJournalSheet}
   */
  static async #onSceneActivate() {
    if ( !game.user.isGM ) return;
    const travel = await this.#openPinTravel();
    await travel?.scene.activate();
  }

  /**
   * Mark the exact spot the party arrives at, by clicking the target scene. The sheet
   * steps out of the way for the pick and comes back once a point is chosen.
   * @this {VelvetJournalSheet}
   */
  static async #onSceneArrival() {
    if ( !game.user.isGM ) return;
    const travel = await this.#openPinTravel();
    if ( !travel ) return;
    await this.minimize();
    let point = null;
    try {
      point = await pickArrivalPoint(travel.scene);
    }
    finally {
      await this.maximize();
    }
    if ( !point ) return;
    await this.#updateOpenPin(pin => { pin.arrival = point; });
  }

  /**
   * Forget the pin's scene link and its arrival point.
   * @this {VelvetJournalSheet}
   */
  static async #onSceneUnlink() {
    if ( !this.isEditable ) return;
    await this.#updateOpenPin(pin => {
      pin.sceneUuid = "";
      pin.arrival = null;
    });
  }

  /**
   * Take the party to this place: pick who travels, then move their tokens onto the
   * linked scene in formation.
   * @this {VelvetJournalSheet}
   */
  static async #onPartyTravel() {
    if ( !game.user.isGM ) return;
    const travel = await this.#openPinTravel();
    if ( !travel ) return;
    await openTravelDialog(travel);
  }

  /**
   * Play the pin's cinematic for everyone, without travelling anywhere.
   * @this {VelvetJournalSheet}
   */
  static async #onCinematicPlay() {
    if ( !game.user.isGM ) return;
    const pin = getMaps(this.entry).find(m => m.id === this.#activeMapId)?.pins?.find(p => p.id === this.#openPinId);
    if ( !pin ) return;
    await runPinCinematic(pin);
  }
}
