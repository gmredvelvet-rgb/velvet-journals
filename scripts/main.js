import { MODULE_ID, MODULE_TITLE } from "./constants.js";
import VelvetJournalSheet from "./sheet.js";
import { registerBlocks } from "./blocks.js";
import { initializeHub } from "./hub.js";
import { registerQuestIntake } from "./quest-intake.js";
import { registerTravelSocket } from "./travel.js";
import LicenseClient from "./license.js";
import LicenseUI, { licenseMenuClass, isWorldLicensed } from "./license-ui.js";
import { hubActive, licenseHub } from "./license-hub.js";

Hooks.once("init", () => {
  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    foundry.documents.JournalEntry,
    MODULE_ID,
    VelvetJournalSheet,
    { label: "VJ.SheetName", makeDefault: false }
  );

  // Written by the GM's client once Patreon verifies the subscription, and
  // read by every other client so players never contact the licence server.
  // Per-client window geometry, so the sheet opens the way each player left it rather
  // than at a size chosen for somebody else's monitor.
  game.settings.register(MODULE_ID, "sheetPosition", {
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(MODULE_ID, "worldLicensed", {
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  // With the hub active, its menu is the one place to manage the licence.
  if ( !hubActive() ) game.settings.registerMenu(MODULE_ID, "licenseMenu", {
    name: "VJ.Settings.License.Name",
    label: "VJ.Settings.License.Label",
    hint: "VJ.Settings.License.Hint",
    icon: "fa-brands fa-patreon",
    type: licenseMenuClass(),
    restricted: true
  });

  game.settings.register(MODULE_ID, "theme", {
    name: "VJ.Settings.Theme.Name",
    hint: "VJ.Settings.Theme.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      classic: "VJ.Settings.Theme.Classic",
      survival: "VJ.Settings.Theme.Survival",
      cyber: "VJ.Settings.Theme.Cyber"
    },
    default: "classic",
    requiresReload: true
  });

  Object.assign(CONFIG.fontDefinitions, {
    "Cinzel": {
      editor: true,
      fonts: [{ urls: [`modules/${MODULE_ID}/fonts/Cinzel-Variable.woff2`], weight: "400 900" }]
    },
    "Cormorant Garamond": {
      editor: true,
      fonts: [
        { urls: [`modules/${MODULE_ID}/fonts/CormorantGaramond-Variable.woff2`], weight: "300 700" },
        { urls: [`modules/${MODULE_ID}/fonts/CormorantGaramond-Italic-Variable.woff2`], weight: "300 700", style: "italic" }
      ]
    },
    "Italianno": {
      editor: true,
      fonts: [{ urls: [`modules/${MODULE_ID}/fonts/Italianno-Regular.woff2`], weight: "400" }]
    },
    "Baloo 2": {
      editor: true,
      fonts: [{ urls: [`modules/${MODULE_ID}/fonts/Baloo2-Variable.woff2`], weight: "400 800" }]
    },
    "Nunito Sans": {
      editor: true,
      fonts: [{ urls: [`modules/${MODULE_ID}/fonts/NunitoSans-Variable.woff2`], weight: "200 1000" }]
    }
  });

  registerBlocks();
  initializeHub();
  // After initializeHub, so its ready hook publishes module.api first and this
  // only extends the object rather than racing to create it.
  registerQuestIntake();
  registerTravelSocket();
});

/**
 * Licence check. Deliberately a soft gate: the module is fully functional
 * either way, and an unlicensed world only receives a periodic free-trial
 * reminder. Only the GM's client talks to the licence server — it verifies
 * the Patreon subscription and writes the world flag everyone else reads.
 */
Hooks.once("ready", async () => {
  // Foundry loads modules on the join, setup and stream pages too, where
  // there is no world to license and nobody to prompt.
  if ( game.view !== "game" ) return;
  // With the hub active the licence is the hub's: register and stay silent —
  // no server call, no card, no reminder of this module's own.
  const hub = licenseHub();
  if ( hub ) return void hub.register(MODULE_ID);
  try {
    if ( game.user?.isGM ) {
      const client = LicenseClient.instance;
      // True when verified right now, or still inside the 30-day window that
      // a past verification bought — an authorised GM is never asked twice.
      const licensed = await client.initialize();
      if ( licensed ) await game.settings.set(MODULE_ID, "worldLicensed", true);
      // Never open with the card when the world is already licensed: this is
      // a second browser or an outage, not someone who has to be asked.
      else if ( !client.hasStoredCredentials && !isWorldLicensed() ) LicenseUI.show();
    }
    LicenseUI.startReminder();
  }
  catch ( err ) {
    // The licence layer must never take the module down with it.
    console.error(`${MODULE_TITLE} | Licence check failed`, err);
  }
});

// The GM activating mid-session silences the reminder on every connected
// client without anyone reloading; the flag arrives as a world-setting update.
Hooks.on("updateSetting", setting => {
  if ( setting.key !== `${MODULE_ID}.worldLicensed` ) return;
  if ( licenseHub() ) return;
  if ( isWorldLicensed() ) LicenseUI.stopReminder();
  else LicenseUI.startReminder();
});
