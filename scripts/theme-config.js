import { MODULE_ID, getTheme, getModuleTheme } from "./constants.js";

const { HandlebarsApplicationMixin, DocumentSheetV2 } = foundry.applications.api;

/**
 * A visual configuration application for the Velvet Journals theme.
 * All settings are stored in JournalEntry flags and edited through graphical controls.
 */
export default class VelvetThemeConfig extends HandlebarsApplicationMixin(DocumentSheetV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["velvet-config"],
    sheetConfig: false,
    window: {
      icon: "fa-solid fa-palette",
      resizable: true,
      contentClasses: ["standard-form"]
    },
    position: {
      width: 520,
      height: 660
    },
    form: {
      submitOnChange: true,
      closeOnSubmit: false
    },
    actions: {
      osjResetTheme: VelvetThemeConfig.#onResetTheme
    }
  };

  /** @override */
  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/theme-config.hbs`,
      scrollable: [""]
    }
  };

  /** @override */
  get title() {
    return `${game.i18n.localize("VJ.ThemeConfig.Title")}: ${this.document.name}`;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.theme = getTheme(this.document);
    context.flagPath = `flags.${MODULE_ID}.theme`;
    context.options = {
      mode: {
        dark: "VJ.Mode.Dark",
        light: "VJ.Mode.Light"
      },
      fit: {
        cover: "VJ.Fit.Cover",
        contain: "VJ.Fit.Contain"
      },
      defaultTab: {
        auto: "VJ.Tabs.Auto",
        dashboard: "VJ.Tabs.Dashboard",
        npcs: "VJ.Tabs.Npcs",
        quests: "VJ.Tabs.Quests",
        atlas: "VJ.Tabs.Atlas",
        pages: "VJ.Tabs.Pages"
      }
    };
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.dataset.osjEdition = getModuleTheme();
  }

  /* -------------------------------------------- */

  /**
   * Reset the theme to its defaults by clearing the stored flag.
   * @this {VelvetThemeConfig}
   */
  static async #onResetTheme() {
    await this.document.unsetFlag(MODULE_ID, "theme");
    this.render();
  }
}
