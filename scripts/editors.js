/**
 * DialogV2-based editors for the Velvet interactive menu.
 * They return a plain data object on save, or null when cancelled/dismissed.
 */

import { localize } from "./constants.js";

const L = (key, data) => localize(key, data);
const esc = value => Handlebars.escapeExpression(value ?? "");

/* -------------------------------------------- */
/*  Markdown mini-editor                        */
/* -------------------------------------------- */

/**
 * Toolbar actions for the Markdown mini-editor. `wrap` actions surround the
 * selection with inline markers; `block` actions prefix each selected line.
 */
const MD_ACTIONS = {
  heading: { icon: "fa-solid fa-heading", block: "## " },
  bold: { icon: "fa-solid fa-bold", wrap: "**" },
  italic: { icon: "fa-solid fa-italic", wrap: "*" },
  ul: { icon: "fa-solid fa-list-ul", block: "- " },
  ol: { icon: "fa-solid fa-list-ol", block: "1. " },
  quote: { icon: "fa-solid fa-quote-left", block: "> " },
  link: { icon: "fa-solid fa-link" },
  hr: { icon: "fa-solid fa-minus" }
};

/**
 * Build a Markdown mini-editor: a formatting toolbar over a plain textarea.
 * The toolbar is wired up in the dialog's render callback.
 * @param {string} name   The textarea input name.
 * @param {string} value  The current Markdown source.
 * @param {number} rows
 * @returns {string}
 */
const mdEditor = (name, value, rows = 8) => `
  <div class="vj-md-editor">
    <div class="vj-md-toolbar">
      ${Object.entries(MD_ACTIONS).map(([action, def]) => `
        <button type="button" data-md="${action}" tabindex="-1"
                data-tooltip aria-label="${esc(L(`VJ.MD.${action.capitalize()}`))}">
          <i class="${def.icon}" inert></i>
        </button>`).join("")}
    </div>
    <textarea name="${name}" rows="${rows}">${esc(value)}</textarea>
  </div>`;

/**
 * Apply a toolbar action to the textarea's current selection.
 * @param {HTMLTextAreaElement} textarea
 * @param {string} action  A key of MD_ACTIONS.
 */
function applyMarkdown(textarea, action) {
  const { selectionStart: start, selectionEnd: end, value } = textarea;
  const selected = value.slice(start, end);

  if ( action === "link" ) {
    const label = selected || L("VJ.MD.LinkText");
    textarea.setRangeText(`[${label}](https://)`, start, end);
    // Select the URL part so the user can type over it immediately.
    const urlStart = start + label.length + 3;
    textarea.setSelectionRange(urlStart, urlStart + 8);
  }
  else if ( action === "hr" ) {
    const before = (start > 0) && (value[start - 1] !== "\n") ? "\n" : "";
    textarea.setRangeText(`${before}\n---\n\n`, start, end, "end");
  }
  else if ( MD_ACTIONS[action].wrap ) {
    const wrap = MD_ACTIONS[action].wrap;
    const inner = selected || L("VJ.MD.Placeholder");
    textarea.setRangeText(`${wrap}${inner}${wrap}`, start, end);
    textarea.setSelectionRange(start + wrap.length, start + wrap.length + inner.length);
  }
  else {
    // Line-prefix actions: expand the selection to whole lines, prefix each.
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const nextBreak = value.indexOf("\n", end);
    const lineEnd = nextBreak === -1 ? value.length : nextBreak;
    let n = 0;
    const prefixed = value.slice(lineStart, lineEnd)
      .split("\n")
      .map(line => (action === "ol") ? `${++n}. ${line}` : `${MD_ACTIONS[action].block}${line}`)
      .join("\n");
    textarea.setRangeText(prefixed, lineStart, lineEnd, "end");
  }
  textarea.focus();
}

/**
 * Open a DialogV2 form and resolve with its submitted data.
 * @param {string} title
 * @param {string} icon
 * @param {string} content
 * @returns {Promise<object|null>}
 */
async function formDialog(title, icon, content) {
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title, icon },
    position: { width: 460 },
    classes: ["velvet-config", "velvet-dialog"],
    content,
    rejectClose: false,
    buttons: [
      {
        action: "save",
        icon: "fa-solid fa-check",
        label: "VJ.Dialog.Save",
        default: true,
        callback: (event, button) => foundry.utils.expandObject(new foundry.applications.ux.FormDataExtended(button.form).object)
      },
      { action: "cancel", icon: "fa-solid fa-xmark", label: "VJ.Dialog.Cancel" }
    ],
    render: (event, dialog) => {
      const root = dialog?.element ?? dialog;

      // Wire up Markdown mini-editor toolbars.
      for ( const toolbar of root?.querySelectorAll?.(".vj-md-toolbar") ?? [] ) {
        const textarea = toolbar.parentElement.querySelector("textarea");
        toolbar.addEventListener("click", ev => {
          const button = ev.target.closest("button[data-md]");
          if ( button && textarea ) applyMarkdown(textarea, button.dataset.md);
        });
      }

      // Allow dropping any document onto the UUID field to link it.
      const input = root?.querySelector?.("input[name='uuid']");
      if ( !input ) return;
      input.addEventListener("dragover", ev => ev.preventDefault());
      input.addEventListener("drop", ev => {
        ev.preventDefault();
        ev.stopPropagation();
        try {
          const data = JSON.parse(ev.dataTransfer.getData("text/plain"));
          if ( data?.uuid ) input.value = data.uuid;
        } catch ( err ) { /* Not a document drag */ }
      });
    }
  });
  return (result && typeof result === "object") ? result : null;
}

/* -------------------------------------------- */

const group = (label, fields, hint = "") => `
  <div class="form-group">
    <label>${L(label)}</label>
    <div class="form-fields">${fields}</div>
    ${hint ? `<p class="hint">${L(hint)}</p>` : ""}
  </div>`;

/**
 * Build a form-group around a `<file-picker>`, always noting that a direct
 * image/video URL works as well as a local/server file.
 * @param {string} labelKey
 * @param {string} name
 * @param {string} value
 * @param {string} type      One of FilePicker.FILE_TYPES ("image", "imagevideo", ...).
 * @param {string} [hintKey] An additional field-specific hint, shown before the URL note.
 * @returns {string}
 */
const pickerGroup = (labelKey, name, value, type, hintKey = "") => `
  <div class="form-group">
    <label>${L(labelKey)}</label>
    <div class="form-fields">
      <file-picker name="${name}" type="${type}" value="${esc(value)}" placeholder="${L("VJ.UrlPlaceholder")}"></file-picker>
    </div>
    <p class="hint">${[hintKey ? L(hintKey) : "", L("VJ.UrlHint")].filter(Boolean).join(" ")}</p>
  </div>`;

/* -------------------------------------------- */

/**
 * Edit or create a dashboard card.
 * @param {object} [card]
 * @returns {Promise<object|null>}
 */
export function editCardDialog(card = {}, categories = []) {
  const sizes = ["md", "wide", "tall", "hero"]
    .map(s => `<option value="${s}" ${(card.size ?? "md") === s ? "selected" : ""}>${L(`VJ.Cards.Size${s.capitalize()}`)}</option>`)
    .join("");
  const listId = `vj-card-categories-${foundry.utils.randomID()}`;
  const datalist = categories.length
    ? `<datalist id="${listId}">${categories.map(c => `<option value="${esc(c)}">`).join("")}</datalist>`
    : "";
  const content = `
    ${group("VJ.Cards.Title", `<input type="text" name="title" value="${esc(card.title)}" autofocus>`)}
    ${group("VJ.Cards.Subtitle", `<input type="text" name="subtitle" value="${esc(card.subtitle)}">`)}
    ${group("VJ.Cards.Category", `<input type="text" name="category" list="${listId}" value="${esc(card.category)}" placeholder="${L("VJ.Cards.CategoryPlaceholder")}">${datalist}`, "VJ.Cards.CategoryHint")}
    ${pickerGroup("VJ.Cards.Media", "media", card.media, "imagevideo", "VJ.Cards.MediaHint")}
    ${group("VJ.Cards.Size", `<select name="size">${sizes}</select>`)}
    ${group("VJ.Cards.Link", `<input type="text" name="uuid" value="${esc(card.uuid)}" placeholder="Scene.abcd1234…">`, "VJ.Cards.LinkHint")}
    ${group("VJ.Cards.Url", `<input type="text" name="url" value="${esc(card.url)}" placeholder="https://…">`, "VJ.Cards.UrlHint")}`;
  const title = card.id ? "VJ.Cards.EditTitle" : "VJ.Cards.NewTitle";
  return formDialog(L(title), "fa-solid fa-clapperboard", content);
}

/* -------------------------------------------- */

/**
 * Edit or create a quest. Objectives are managed inline in the quest panel.
 * @param {object} [quest]
 * @returns {Promise<object|null>}
 */
export function editQuestDialog(quest = {}) {
  const statuses = ["active", "done", "failed"]
    .map(s => `<option value="${s}" ${(quest.status ?? "active") === s ? "selected" : ""}>${L(`VJ.Quests.Status.${s.capitalize()}`)}</option>`)
    .join("");
  const rewards = quest.rewards ?? {};
  const content = `
    ${group("VJ.Quests.Name", `<input type="text" name="name" value="${esc(quest.name)}" autofocus>`)}
    ${pickerGroup("VJ.Quests.Image", "img", quest.img, "image")}
    ${group("VJ.Quests.Summary", mdEditor("summary", quest.summary, 6), "VJ.Quests.SummaryHint")}
    ${group("VJ.Quests.StatusLabel", `<select name="status">${statuses}</select>`)}
    ${group("VJ.Quests.Hidden", `<input type="checkbox" name="hidden" ${quest.hidden ? "checked" : ""}>`, "VJ.Quests.HiddenHint")}
    ${group("VJ.Quests.RewardCurrency", `<input type="text" name="rewards.currency" value="${esc(rewards.currency)}" placeholder="${L("VJ.Quests.RewardCurrencyPlaceholder")}">`, "VJ.Quests.RewardCurrencyHint")}
    ${group("VJ.Quests.RewardXp", `<input type="number" name="rewards.xp" value="${Number(rewards.xp) || 0}" min="0" step="1">`)}
    ${group("VJ.Quests.RewardOther", `<input type="text" name="rewards.other" value="${esc(rewards.other)}" placeholder="${L("VJ.Quests.RewardOtherPlaceholder")}">`, "VJ.Quests.RewardOtherHint")}`;
  const title = quest.id ? "VJ.Quests.EditTitle" : "VJ.Quests.NewTitle";
  return formDialog(L(title), "fa-solid fa-scroll", content);
}

/* -------------------------------------------- */

/**
 * Edit the display data of an NPC gallery entry.
 * @param {object} npc
 * @param {string} name  The resolved actor name, shown in the dialog title.
 * @returns {Promise<object|null>}
 */
export function editNpcDialog(npc, name, maps = []) {
  const content = `
    ${group("VJ.Npcs.Role", `<input type="text" name="role" value="${esc(npc.role)}" placeholder="${L("VJ.Npcs.RolePlaceholder")}" autofocus>`)}
    ${group("VJ.Npcs.Location", mapSelect("mapId", maps, npc.mapId ?? ""), "VJ.Npcs.LocationHint")}
    ${pickerGroup("VJ.Npcs.Portrait", "portrait", npc.portrait, "image", "VJ.Npcs.PortraitHint")}
    ${group("VJ.Npcs.Bio", mdEditor("bio", npc.bio, 8), "VJ.Npcs.BioHint")}`;
  return formDialog(`${L("VJ.Npcs.EditTitle")}: ${name}`, "fa-solid fa-user-pen", content);
}

/* -------------------------------------------- */

/**
 * Build a `<select>` of atlas maps with a "none" first option.
 * @param {string} name        The input name.
 * @param {object[]} maps      All maps of the atlas.
 * @param {string} selected    The currently selected map id.
 * @param {string} [excludeId] A map id to omit (e.g. the map being edited).
 * @returns {string}
 */
function mapSelect(name, maps, selected, excludeId) {
  const options = maps
    .filter(m => m.id !== excludeId)
    .map(m => `<option value="${m.id}" ${selected === m.id ? "selected" : ""}>${esc(m.name || L("VJ.Atlas.Untitled"))}</option>`)
    .join("");
  return `<select name="${name}"><option value="">${L("VJ.Atlas.None")}</option>${options}</select>`;
}

/* -------------------------------------------- */

/**
 * Edit or create an atlas map.
 * @param {object} [map]
 * @param {object[]} [maps]  All maps, used to offer a parent map choice.
 * @returns {Promise<object|null>}
 */
export function editMapDialog(map = {}, maps = []) {
  const content = `
    ${group("VJ.Atlas.MapName", `<input type="text" name="name" value="${esc(map.name)}" autofocus>`)}
    ${pickerGroup("VJ.Atlas.MapImage", "image", map.image, "image", "VJ.Atlas.MapImageHint")}
    ${group("VJ.Atlas.MapParent", mapSelect("parent", maps, map.parent ?? "", map.id), "VJ.Atlas.MapParentHint")}
    ${group("VJ.Atlas.MapDescription", `<textarea name="description" rows="3">${esc(map.description)}</textarea>`)}`;
  const title = map.id ? "VJ.Atlas.EditMap" : "VJ.Atlas.NewMap";
  return formDialog(L(title), "fa-solid fa-map", content);
}

/* -------------------------------------------- */

/**
 * Edit or create a map pin (point of interest).
 * @param {object} [pin]
 * @param {object[]} [maps]  All maps, used to offer a map-link choice.
 * @returns {Promise<object|null>}
 */
export function editPinDialog(pin = {}, maps = []) {
  const colors = ["gold", "slate", "crimson", "sage"]
    .map(c => `<option value="${c}" ${(pin.color ?? "gold") === c ? "selected" : ""}>${L(`VJ.Atlas.Color.${c.capitalize()}`)}</option>`)
    .join("");
  const content = `
    ${group("VJ.Atlas.PinName", `<input type="text" name="name" value="${esc(pin.name)}" autofocus>`)}
    ${group("VJ.Atlas.PinType", `<input type="text" name="type" value="${esc(pin.type)}" placeholder="${L("VJ.Atlas.PinTypePlaceholder")}">`)}
    ${group("VJ.Atlas.PinColor", `<select name="color">${colors}</select>`)}
    ${group("VJ.Atlas.PinMapLink", mapSelect("mapLink", maps, pin.mapLink ?? ""), "VJ.Atlas.PinMapLinkHint")}
    ${pickerGroup("VJ.Atlas.PinImage", "image", pin.image, "image")}
    ${group("VJ.Atlas.PinDescription", mdEditor("description", pin.description, 6), "VJ.Quests.SummaryHint")}
    ${group("VJ.Atlas.PinHidden", `<input type="checkbox" name="hidden" ${pin.hidden ? "checked" : ""}>`, "VJ.Atlas.PinHiddenHint")}`;
  const title = pin.id ? "VJ.Atlas.EditPin" : "VJ.Atlas.NewPin";
  return formDialog(L(title), "fa-solid fa-location-dot", content);
}

/* -------------------------------------------- */

/**
 * Ask for confirmation before deleting a menu element.
 * @param {string} name
 * @returns {Promise<boolean>}
 */
export async function confirmDeleteDialog(name) {
  const result = await foundry.applications.api.DialogV2.confirm({
    window: { title: L("VJ.Dialog.DeleteTitle"), icon: "fa-solid fa-trash" },
    classes: ["velvet-config", "velvet-dialog"],
    content: `<p>${L("VJ.Dialog.DeleteConfirm", { name: esc(name) })}</p>`,
    rejectClose: false,
    modal: true
  });
  return result === true;
}
