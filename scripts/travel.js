import { MODULE_ID, MODULE_TITLE, getModuleTheme, localize } from "./constants.js";

/**
 * Atlas travel: the layer that turns a map pin into a place the table can actually
 * go to. A pin may link a Scene, and from its card the GM can preview it, activate
 * it, roll a cinematic transition for everyone, and move the whole party's tokens
 * onto it in formation.
 *
 * Everything here is GM-driven. Players only ever receive the cinematic broadcast,
 * which is why this is the module's single socket consumer.
 */

const SOCKET = `module.${MODULE_ID}`;
const L = (key, data) => localize(key, data);

/* -------------------------------------------- */
/*  Cinematic overlay                           */
/* -------------------------------------------- */

/**
 * The overlay element currently on screen, and the resolver waiting on it.
 * Only ever one cinematic plays at a time — a second one replaces the first.
 * @type {{element: HTMLElement, finish: Function}|null}
 */
let cinematic = null;

/**
 * Take over the screen with a letterboxed video, in the current theme edition's
 * chrome. Resolves when the video ends, when it is skipped, or immediately if it
 * cannot be played at all — a broken cinematic must never strand the travel it
 * was introducing.
 * @param {object} options
 * @param {string} options.src        The video source (file path or URL).
 * @param {string} [options.title]    A caption shown over the letterbox bar.
 * @param {boolean} [options.local]   True when this client is only receiving a broadcast,
 *                                    so skipping dismisses it here without telling anyone.
 * @returns {Promise<void>}
 */
export function playCinematic({ src, title = "", local = false } = {}) {
  stopCinematic();
  if ( !src ) return Promise.resolve();

  const element = document.createElement("div");
  element.className = "vj-cinematic";
  element.dataset.osjEdition = getModuleTheme();
  element.innerHTML = `
    <div class="vj-cinematic-bar top"></div>
    <div class="vj-cinematic-bar bottom"></div>
    <video class="vj-cinematic-video" autoplay playsinline></video>
    ${title ? `<p class="vj-cinematic-title"></p>` : ""}
    <button type="button" class="vj-cinematic-skip">
      <span>${Handlebars.escapeExpression(L("VJ.Travel.Skip"))}</span>
      <i class="fa-solid fa-forward" inert></i>
    </button>`;
  if ( title ) element.querySelector(".vj-cinematic-title").textContent = title;

  const video = element.querySelector("video");
  video.src = src;
  try { video.volume = game.settings.get("core", "globalInterfaceVolume") ?? 1; }
  catch ( err ) { /* Core renamed or dropped the setting: play at full volume */ }
  document.body.append(element);

  return new Promise(resolve => {
    const finish = () => {
      if ( cinematic?.element !== element ) return;
      cinematic = null;
      // Detaching the node is not enough to reliably silence a playing video.
      video.pause();
      element.classList.add("closing");
      // Let the fade-out play before the node leaves the document.
      setTimeout(() => element.remove(), 420);
      resolve();
    };
    cinematic = { element, finish };
    video.addEventListener("ended", finish);
    video.addEventListener("error", finish);
    element.querySelector(".vj-cinematic-skip").addEventListener("click", () => {
      if ( !local ) emit({ t: "cinematic-stop" });
      finish();
    });
    // Autoplay can still be refused (a player who has not interacted with the page yet).
    video.play().catch(() => {});
  });
}

/**
 * Dismiss the cinematic currently on screen, resolving whoever awaited it.
 */
export function stopCinematic() {
  cinematic?.finish();
}

/**
 * Send a payload to every other connected client.
 * @param {object} payload
 */
function emit(payload) {
  game.socket?.emit(SOCKET, payload);
}

/**
 * Listen for the cinematic broadcast. Registered once, from the module's init hook.
 */
export function registerTravelSocket() {
  game.socket?.on(SOCKET, payload => {
    if ( payload?.t === "cinematic" ) playCinematic({ src: payload.src, title: payload.title, local: true });
    else if ( payload?.t === "cinematic-stop" ) stopCinematic();
  });
}

/* -------------------------------------------- */

/**
 * Run a pin's cinematic: broadcast its video to every client and execute its macro.
 * Awaits the video so a caller can travel the moment it ends.
 * @param {object} pin
 * @param {string} [caption]  Fallback caption when the pin has no name.
 * @returns {Promise<void>}
 */
export async function runPinCinematic(pin, caption = "") {
  const title = pin?.name || caption;
  const src = pin?.cinematicVideo ?? "";
  let macro = null;
  try {
    if ( pin?.cinematicMacro ) macro = await fromUuid(pin.cinematicMacro);
  }
  catch ( err ) { /* A broken macro link simply means there is no macro to run */ }

  // The macro fires first so a Sequencer/FXMaster script can dress the scene the
  // video is about to reveal; a macro that fails must not eat the video.
  if ( macro?.execute ) {
    try { await macro.execute(); }
    catch ( err ) {
      console.error(`${MODULE_TITLE} | Cinematic macro failed`, err);
      ui.notifications.warn(L("VJ.Travel.MacroFailed"));
    }
  }
  if ( !src ) return;
  emit({ t: "cinematic", src, title });
  await playCinematic({ src, title });
}

/* -------------------------------------------- */
/*  Party resolution                            */
/* -------------------------------------------- */

/**
 * The characters the table would call "the party": every player's assigned character,
 * plus any player-owned token standing on the scene the GM is looking at. Keyed by
 * actor id so the same character never appears twice.
 * @returns {{actorId: string, name: string, img: string, sceneName: string}[]}
 */
export function partyMembers() {
  const found = new Map();
  const add = actor => {
    if ( !actor?.id || found.has(actor.id) ) return;
    // The party "actor" of systems that have one (pf2e) is a container, not a character.
    if ( actor.type === "party" ) return;
    const token = findActorToken(actor.id);
    found.set(actor.id, {
      actorId: actor.id,
      name: actor.name,
      img: token?.texture?.src || actor.img || "icons/svg/mystery-man.svg",
      sceneName: token?.parent?.name ?? ""
    });
  };
  for ( const user of game.users ) if ( !user.isGM && user.character ) add(user.character);
  for ( const token of canvas?.scene?.tokens ?? [] ) {
    if ( token.actor?.hasPlayerOwner ) add(token.actor);
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Locate an actor's token, preferring the scene on screen so a character with copies
 * on several maps travels from the one the table is actually playing on.
 * @param {string} actorId
 * @param {Scene} [preferred]
 * @returns {TokenDocument|null}
 */
function findActorToken(actorId, preferred = canvas?.scene) {
  const onPreferred = preferred?.tokens?.find(t => t.actorId === actorId);
  if ( onPreferred ) return onPreferred;
  for ( const scene of game.scenes ) {
    const token = scene.tokens.find(t => t.actorId === actorId);
    if ( token ) return token;
  }
  return null;
}

/* -------------------------------------------- */
/*  Formation                                   */
/* -------------------------------------------- */

/**
 * Lay `count` tokens out around an anchor point, in grid units.
 * @param {number} count
 * @param {string} shape  "grid", "line" or "circle".
 * @returns {{x: number, y: number}[]}  Offsets in grid squares, centered on (0, 0).
 */
function formationOffsets(count, shape) {
  if ( count <= 1 ) return [{ x: 0, y: 0 }];
  if ( shape === "line" ) {
    return Array.from({ length: count }, (_, i) => ({ x: i - ((count - 1) / 2), y: 0 }));
  }
  if ( shape === "circle" ) {
    // Wide enough that neighbours never share a square, however large the party gets.
    const radius = Math.max(1, count / (2 * Math.PI) + 0.5);
    return Array.from({ length: count }, (_, i) => {
      const angle = (2 * Math.PI * i) / count;
      return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
    });
  }
  // Compact block: the tightest rectangle that holds the party.
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  return Array.from({ length: count }, (_, i) => ({
    x: (i % cols) - ((cols - 1) / 2),
    y: Math.floor(i / cols) - ((rows - 1) / 2)
  }));
}

/**
 * Where a party lands on a scene, and how that point was decided. Three sources, in
 * order: the point the GM marked on this pin, the scene's own initial view position,
 * and — only when neither exists — the middle of the playable rectangle.
 *
 * The last one is the only spot nobody chose, so it is reported distinctly: the pin
 * card and the travel dialog both say so rather than quietly dropping the party in
 * the middle of the map.
 *
 * @param {Scene} scene
 * @param {object} [pin]
 * @returns {{point: {x: number, y: number}, marked: boolean, key: string, label: string}}
 */
export function arrivalInfo(scene, pin) {
  const isPoint = p => Number.isFinite(p?.x) && Number.isFinite(p?.y);
  let point;
  let key;
  if ( isPoint(pin?.arrival) ) {
    point = { x: pin.arrival.x, y: pin.arrival.y };
    key = "VJ.Travel.ArrivalMarked";
  }
  else if ( isPoint(scene?.initial) ) {
    point = { x: scene.initial.x, y: scene.initial.y };
    key = "VJ.Travel.ArrivalInitial";
  }
  else {
    const rect = scene?.dimensions?.sceneRect ?? scene?.dimensions?.rect;
    point = rect
      ? { x: rect.x + (rect.width / 2), y: rect.y + (rect.height / 2) }
      : { x: (scene?.width ?? 0) / 2, y: (scene?.height ?? 0) / 2 };
    key = "VJ.Travel.ArrivalCenter";
  }
  return {
    point,
    marked: key === "VJ.Travel.ArrivalMarked",
    key,
    label: `${Math.round(point.x)}, ${Math.round(point.y)}`
  };
}

/**
 * Snap a point to the scene's grid when the grid supports it, so arriving tokens
 * line up with everything already placed by hand.
 * @param {Scene} scene
 * @param {{x: number, y: number}} point
 * @returns {{x: number, y: number}}
 */
function snap(scene, point) {
  try {
    const snapped = scene.grid?.getSnappedPoint?.(point, { mode: CONST.GRID_SNAPPING_MODES.TOP_LEFT_CORNER });
    if ( Number.isFinite(snapped?.x) && Number.isFinite(snapped?.y) ) return snapped;
  }
  catch ( err ) { /* Gridless scenes and exotic grids simply keep the raw point. */ }
  return { x: Math.round(point.x), y: Math.round(point.y) };
}

/**
 * Turn a formation point — which is where a token's center should sit — into the
 * top-left corner a token document is actually positioned by, kept inside the
 * playable rectangle and snapped to the grid.
 * @param {Scene} scene
 * @param {object} data                   The token data being placed.
 * @param {{x: number, y: number}} center
 * @returns {{x: number, y: number}}
 */
function placeToken(scene, data, center) {
  const size = scene.grid?.size ?? 100;
  const width = (data.width ?? 1) * size;
  const height = (data.height ?? 1) * size;
  let x = center.x - (width / 2);
  let y = center.y - (height / 2);
  const rect = scene.dimensions?.sceneRect;
  if ( rect ) {
    x = Math.min(Math.max(x, rect.x), rect.x + rect.width - width);
    y = Math.min(Math.max(y, rect.y), rect.y + rect.height - height);
  }
  return snap(scene, { x, y });
}

/* -------------------------------------------- */
/*  Teleport                                    */
/* -------------------------------------------- */

/**
 * Move a set of characters onto a scene, arranged around an arrival point.
 *
 * A character that already stands on the target scene is repositioned; one standing
 * elsewhere is carried over with its full token data (so an unlinked token keeps its
 * damage, effects and name) and removed from the scene it left; one with no token
 * anywhere is created from its prototype.
 *
 * @param {object} options
 * @param {Scene} options.scene                 The destination.
 * @param {string[]} options.actorIds           Which characters travel.
 * @param {{x: number, y: number}} [options.arrival]  Where they land; defaults to the scene's own point.
 * @param {string} [options.formation]          "grid", "line" or "circle".
 * @returns {Promise<number>}                   How many tokens actually moved.
 */
export async function teleportParty({ scene, actorIds, arrival, formation = "grid" }) {
  if ( !game.user.isGM || !scene || !actorIds?.length ) return 0;

  const anchor = arrival ?? arrivalInfo(scene).point;
  const size = scene.grid?.size ?? 100;
  const offsets = formationOffsets(actorIds.length, formation);

  const creations = [];
  const updates = [];
  /** Tokens to remove from the scenes they are leaving, grouped by scene id. */
  const removals = new Map();
  const scheduleRemoval = token => {
    const ids = removals.get(token.parent.id) ?? [];
    ids.push(token.id);
    removals.set(token.parent.id, ids);
  };

  for ( const [i, actorId] of actorIds.entries() ) {
    const actor = game.actors.get(actorId);
    if ( !actor ) continue;

    const existing = scene.tokens.find(t => t.actorId === actorId);
    const source = existing ?? findActorToken(actorId);
    const data = source?.toObject() ?? (await actor.getTokenDocument()).toObject();

    const { x, y } = placeToken(scene, data, {
      x: anchor.x + (offsets[i].x * size),
      y: anchor.y + (offsets[i].y * size)
    });

    if ( existing ) updates.push({ _id: existing.id, x, y });
    else {
      // The carried-over token gets fresh ids; its actor delta (an unlinked token's
      // damage, effects and renames) travels with it inside the rest of the data.
      delete data._id;
      if ( data.delta ) delete data.delta._id;
      creations.push({ ...data, x, y });
      if ( source ) scheduleRemoval(source);
    }
  }

  if ( updates.length ) await scene.updateEmbeddedDocuments("Token", updates);
  if ( creations.length ) await scene.createEmbeddedDocuments("Token", creations);
  // Only after the arrivals exist, so a character is never briefly on no map at all.
  for ( const [sceneId, ids] of removals ) {
    await game.scenes.get(sceneId)?.deleteEmbeddedDocuments("Token", ids);
  }
  return updates.length + creations.length;
}

/* -------------------------------------------- */
/*  Arrival point picker                        */
/* -------------------------------------------- */

/**
 * Show the GM a scene and wait for one click on it, resolving with the point clicked
 * in scene coordinates. Right-click or Escape cancels.
 * @param {Scene} scene
 * @returns {Promise<{x: number, y: number}|null>}
 */
export async function pickArrivalPoint(scene) {
  if ( !game.user.isGM ) return null;
  if ( canvas?.scene?.id !== scene.id ) {
    await scene.view();
    // view() resolves before the new canvas is interactive on a heavy scene.
    if ( canvas?.scene?.id !== scene.id ) await new Promise(r => Hooks.once("canvasReady", r));
  }
  ui.notifications.info(L("VJ.Travel.PickHint"));

  return new Promise(resolve => {
    const board = canvas.app?.view ?? document.getElementById("board");
    const done = value => {
      board?.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("keydown", onKey, true);
      document.body.classList.remove("vj-picking-arrival");
      resolve(value);
    };
    const onPointer = event => {
      event.preventDefault();
      event.stopPropagation();
      if ( event.button !== 0 ) return done(null);
      const point = canvas.mousePosition;
      done(Number.isFinite(point?.x) ? { x: Math.round(point.x), y: Math.round(point.y) } : null);
    };
    const onKey = event => {
      if ( event.key !== "Escape" ) return;
      event.preventDefault();
      event.stopPropagation();
      done(null);
    };
    document.body.classList.add("vj-picking-arrival");
    board?.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey, true);
  });
}

/* -------------------------------------------- */
/*  Travel dialog                               */
/* -------------------------------------------- */

const esc = value => Handlebars.escapeExpression(value ?? "");

/**
 * Ask the GM who travels and how, then carry it out: cinematic, tokens, activation.
 * @param {object} options
 * @param {Scene} options.scene    The destination.
 * @param {object} options.pin     The atlas pin being travelled to.
 * @returns {Promise<void>}
 */
export async function openTravelDialog({ scene, pin }) {
  const members = partyMembers();
  if ( !members.length ) return void ui.notifications.warn(L("VJ.Travel.NoParty"));

  const hasCinematic = !!(pin?.cinematicVideo || pin?.cinematicMacro);
  const arrival = arrivalInfo(scene, pin);
  const roster = members.map(m => `
    <label class="vj-travel-member">
      <input type="checkbox" name="actorIds" value="${m.actorId}" checked>
      <img src="${esc(m.img)}" alt="">
      <span class="vj-travel-member-name">${esc(m.name)}</span>
      ${m.sceneName ? `<span class="vj-travel-member-scene">${esc(m.sceneName)}</span>` : ""}
    </label>`).join("");
  const shapes = ["grid", "line", "circle"]
    .map(s => `<option value="${s}">${esc(L(`VJ.Travel.Formation${s.capitalize()}`))}</option>`)
    .join("");

  const content = `
    <p class="vj-travel-target">
      <i class="fa-solid fa-map-location-dot" inert></i>
      <span>${esc(scene.name)}</span>
    </p>
    <p class="vj-travel-arrival ${arrival.marked ? "" : "is-unset"}">
      <i class="fa-solid fa-crosshairs" inert></i>
      <span>${esc(L(arrival.key))} · ${esc(arrival.label)}</span>
    </p>
    ${arrival.marked ? "" : `<p class="vj-travel-arrival-hint">${esc(L("VJ.Travel.ArrivalUnsetHint"))}</p>`}
    <div class="vj-travel-roster">${roster}</div>
    <div class="form-group">
      <label>${esc(L("VJ.Travel.Formation"))}</label>
      <div class="form-fields"><select name="formation">${shapes}</select></div>
      <p class="hint">${esc(L("VJ.Travel.FormationHint"))}</p>
    </div>
    <div class="form-group">
      <label>${esc(L("VJ.Travel.ActivateAfter"))}</label>
      <div class="form-fields"><input type="checkbox" name="activate" checked></div>
      <p class="hint">${esc(L("VJ.Travel.ActivateHint"))}</p>
    </div>
    ${hasCinematic ? `
    <div class="form-group">
      <label>${esc(L("VJ.Travel.WithCinematic"))}</label>
      <div class="form-fields"><input type="checkbox" name="cinematic" checked></div>
      <p class="hint">${esc(L("VJ.Travel.WithCinematicHint"))}</p>
    </div>` : ""}`;

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: L("VJ.Travel.DialogTitle"), icon: "fa-solid fa-person-walking-arrow-right" },
    position: { width: 440 },
    classes: ["velvet-config", "velvet-dialog", "vj-travel-dialog"],
    content,
    rejectClose: false,
    buttons: [
      {
        action: "go",
        icon: "fa-solid fa-person-walking-arrow-right",
        label: "VJ.Travel.Go",
        default: true,
        // Read the form directly rather than through FormDataExtended: the roster is a
        // set of checkboxes that all share one name, which flattens to a single value.
        callback: (event, button) => ({
          actorIds: [...button.form.querySelectorAll("input[name='actorIds']:checked")].map(i => i.value),
          formation: button.form.elements.formation?.value ?? "grid",
          activate: !!button.form.elements.activate?.checked,
          cinematic: !!button.form.elements.cinematic?.checked
        })
      },
      { action: "cancel", icon: "fa-solid fa-xmark", label: "VJ.Dialog.Cancel" }
    ],
    render: (event, dialog) => {
      const root = dialog?.element ?? dialog;
      if ( root ) root.dataset.osjEdition = getModuleTheme();
    }
  });
  if ( !result || (typeof result !== "object") ) return;
  const actorIds = result.actorIds ?? [];
  if ( !actorIds.length ) return void ui.notifications.warn(L("VJ.Travel.NobodySelected"));

  if ( result.cinematic ) await runPinCinematic(pin, scene.name);
  const moved = await teleportParty({ scene, actorIds, arrival: arrival.point, formation: result.formation ?? "grid" });
  if ( result.activate ) await scene.activate();
  ui.notifications.info(L("VJ.Travel.Done", { count: moved, scene: scene.name }));
}
