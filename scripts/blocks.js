/**
 * Velvet content block library for the native ProseMirror editor.
 * Blocks are plain HTML structures styled by styles/blocks.css, so they remain fully
 * editable, exportable and portable like any other journal content.
 */

const L = key => game.i18n.localize(`VJ.Blocks.${key}`);

/**
 * Build a ProseMirror command which inserts an HTML fragment at the current selection.
 * @param {() => string} html  A lazy HTML factory, evaluated at insertion time.
 * @returns {ProseMirrorCommand}
 */
function insertBlock(html) {
  return (state, dispatch) => {
    const node = ProseMirror.dom.parseString(html(), state.schema);
    dispatch(state.tr.replaceSelectionWith(node).scrollIntoView());
    return true;
  };
}

/* -------------------------------------------- */
/*  Block HTML factories                        */
/* -------------------------------------------- */

const callout = variant => () => `
  <aside class="osj-callout ${variant}">
    <h4>${L(`Callout.${variant.capitalize()}`)}</h4>
    <p>${L("Placeholder")}</p>
  </aside>`;

const quote = () => `
  <blockquote class="osj-quote">
    <p>${L("Quote.Text")}</p>
    <cite>${L("Quote.Cite")}</cite>
  </blockquote>`;

const card = title => `
  <section class="osj-card">
    <h4>${title}</h4>
    <p>${L("Placeholder")}</p>
    <p class="osj-card-link">${L("Cards.Link")}</p>
  </section>`;

const cards = () => `
  <div class="osj-cards">
    ${card(`${L("Cards.Card")} 1`)}
    ${card(`${L("Cards.Card")} 2`)}
    ${card(`${L("Cards.Card")} 3`)}
  </div>`;

const columns = () => `
  <div class="osj-columns">
    <div class="osj-column"><h4>${L("Columns.Left")}</h4><p>${L("Placeholder")}</p></div>
    <div class="osj-column"><h4>${L("Columns.Right")}</h4><p>${L("Placeholder")}</p></div>
  </div>`;

const galleryItem = () => `
    <figure><img src="icons/svg/village.svg" alt=""><figcaption>${L("Gallery.Caption")}</figcaption></figure>`;

const gallery = () => `
  <div class="osj-gallery">
    ${galleryItem()}${galleryItem()}${galleryItem()}${galleryItem()}
  </div>`;

const timelineItem = n => `
    <li><h4>${L("Timeline.Event")} ${n}</h4><p>${L("Placeholder")}</p></li>`;

const timeline = () => `
  <ol class="osj-timeline">
    ${timelineItem(1)}${timelineItem(2)}${timelineItem(3)}
  </ol>`;

const npc = () => `
  <section class="osj-npc">
    <img class="osj-npc-portrait" src="icons/svg/mystery-man.svg" alt="">
    <div class="osj-npc-body">
      <h4>${L("NPC.Name")}</h4>
      <p class="osj-npc-role">${L("NPC.Role")}</p>
      <p>${L("Placeholder")}</p>
    </div>
  </section>`;

const location = () => `
  <section class="osj-location">
    <img class="osj-location-image" src="icons/svg/city.svg" alt="">
    <div class="osj-location-body">
      <p class="osj-kicker-inline">${L("Location.Kicker")}</p>
      <h4>${L("Location.Name")}</h4>
      <p>${L("Placeholder")}</p>
    </div>
  </section>`;

const statCell = n => `
    <div class="osj-stat"><span class="osj-stat-value">${n}</span><span class="osj-stat-label">${L("Stats.Label")}</span></div>`;

const stats = () => `
  <div class="osj-stats">
    ${statCell(89)}${statCell(16)}${statCell(19)}${statCell(12)}
  </div>`;

const button = () => `
  <p class="osj-btn-row"><a class="osj-btn">${L("Button.Label")}</a></p>`;

const divider = () => `<hr class="osj-divider">`;

const accordion = () => `
  <details class="osj-accordion">
    <summary>${L("Accordion.Summary")}</summary>
    <p>${L("Placeholder")}</p>
  </details>`;

/* -------------------------------------------- */

/**
 * Register the Velvet dropdown in every ProseMirror editor menu.
 */
export function registerBlocks() {
  Hooks.on("getProseMirrorMenuDropDowns", (menu, dropdowns) => {
    dropdowns.velvet = {
      title: "VJ.Blocks.Menu",
      cssClass: "velvet-blocks",
      entries: [
        {
          action: "osj-callouts", title: L("Callout.Menu"), children: [
            { action: "osj-callout-note", title: L("Callout.Note"), cmd: insertBlock(callout("note")) },
            { action: "osj-callout-quest", title: L("Callout.Quest"), cmd: insertBlock(callout("quest")) },
            { action: "osj-callout-loot", title: L("Callout.Loot"), cmd: insertBlock(callout("loot")) },
            { action: "osj-callout-danger", title: L("Callout.Danger"), cmd: insertBlock(callout("danger")) }
          ]
        },
        { action: "osj-quote", title: L("Quote.Menu"), cmd: insertBlock(quote) },
        { action: "osj-cards", title: L("Cards.Menu"), cmd: insertBlock(cards) },
        { action: "osj-columns", title: L("Columns.Menu"), cmd: insertBlock(columns) },
        { action: "osj-gallery", title: L("Gallery.Menu"), cmd: insertBlock(gallery) },
        { action: "osj-timeline", title: L("Timeline.Menu"), cmd: insertBlock(timeline) },
        { action: "osj-npc", title: L("NPC.Menu"), cmd: insertBlock(npc) },
        { action: "osj-location", title: L("Location.Menu"), cmd: insertBlock(location) },
        { action: "osj-stats", title: L("Stats.Menu"), cmd: insertBlock(stats) },
        { action: "osj-button", title: L("Button.Menu"), cmd: insertBlock(button) },
        { action: "osj-accordion", title: L("Accordion.Menu"), cmd: insertBlock(accordion) },
        { action: "osj-divider", title: L("Divider.Menu"), cmd: insertBlock(divider) }
      ]
    };
  });
}
