import { MODULE_ID, MODULE_TITLE, localize } from "./constants.js";
import { getQuests, setQuests, createQuest, createObjective, createRewards } from "./menu-data.js";
import { getHubJournal } from "./hub.js";

/**
 * Quest intake: the public entry point other modules use to file a quest into
 * the Velvet quest log.
 *
 * This exists so companion modules never have to reach into `velvet-journals`
 * flags themselves. They call `addQuest`, and the shape of the stored data
 * stays this module's business -- if the quest schema gains a field, callers
 * do not break.
 *
 * Writing a JournalEntry flag requires ownership of that entry, so this is a
 * GM-side operation by design. A module offering a quest to players is
 * expected to relay the request to a GM client itself.
 */

/**
 * Normalize an objective, which callers may pass as a bare string or as an
 * object already in the log's shape.
 * @param {string|object} value
 * @returns {object|null}
 */
function toObjective(value) {
  if ( typeof value === "string" ) {
    const text = value.trim();
    return text ? createObjective(text) : null;
  }
  if ( value && (typeof value === "object") && value.text ) {
    return { ...createObjective(String(value.text)), done: value.done === true };
  }
  return null;
}

/**
 * Find a quest already filed from the same origin, so accepting the same
 * notice twice updates one entry instead of stacking duplicates.
 * @param {object[]} quests
 * @param {object} source
 * @returns {object|undefined}
 */
function findBySource(quests, source) {
  if ( !source?.module || !source?.id ) return undefined;
  return quests.find(q => (q.source?.module === source.module) && (q.source?.id === source.id));
}

/**
 * File a quest into the Velvet quest log.
 *
 * @param {object} data
 * @param {string} data.name                     Quest title. Required.
 * @param {string} [data.summary]                Markdown body, rendered by the quest tracker.
 * @param {string} [data.img]                    Illustration path.
 * @param {string} [data.status="active"]        "active", "done" or "failed".
 * @param {boolean} [data.hidden=false]          Hide from players.
 * @param {string} [data.mapId]                  Atlas map to file it under.
 * @param {Array<string|object>} [data.objectives]
 * @param {object} [data.rewards]                {currency, xp, other, items}
 * @param {object} [data.source]                 {module, id, label} origin, used to de-duplicate.
 * @param {object} [options]
 * @param {JournalEntry} [options.entry]         Target journal; defaults to the configured hub.
 * @returns {Promise<{quest: object, entry: JournalEntry, created: boolean}>}
 * @throws {Error} If there is no target journal, or the caller cannot write to it.
 */
export async function addQuest(data = {}, { entry } = {}) {
  const name = String(data.name ?? "").trim();
  if ( !name ) throw new Error(`${MODULE_TITLE} | A quest needs a name`);

  const target = entry ?? getHubJournal();
  if ( !target ) throw new Error(localize("VJ.Intake.NoJournal"));
  if ( !target.isOwner ) throw new Error(localize("VJ.Intake.NoPermission"));

  const quests = getQuests(target);
  const source = data.source ?? null;
  const existing = findBySource(quests, source);

  const objectives = (Array.isArray(data.objectives) ? data.objectives : [])
    .map(toObjective)
    .filter(Boolean);

  const rewards = createRewards({
    ...(data.rewards ?? {}),
    items: Array.isArray(data.rewards?.items) ? data.rewards.items : []
  });

  if ( existing ) {
    // Refresh the wording and artwork, but never silently undo a GM's status
    // change or tick objectives back off: the log is theirs once it is filed.
    Object.assign(existing, {
      name,
      summary: data.summary ?? existing.summary,
      img: data.img ?? existing.img,
      rewards: existing.rewards ?? rewards
    });
    await setQuests(target, quests);
    return { quest: existing, entry: target, created: false };
  }

  const quest = createQuest({
    name,
    summary: data.summary ?? "",
    img: data.img ?? "",
    status: ["active", "done", "failed"].includes(data.status) ? data.status : "active",
    hidden: data.hidden === true,
    mapId: typeof data.mapId === "string" ? data.mapId : "",
    objectives,
    rewards,
    ...(source ? { source } : {})
  });

  await setQuests(target, [...quests, quest]);
  return { quest, entry: target, created: true };
}

/**
 * Whether a quest from this origin is already filed.
 * @param {object} source  {module, id}
 * @param {JournalEntry} [entry]
 * @returns {boolean}
 */
export function hasQuest(source, entry) {
  const target = entry ?? getHubJournal();
  if ( !target ) return false;
  return Boolean(findBySource(getQuests(target), source));
}

/**
 * Extend the module's public API with the intake helpers.
 *
 * Registered after `initializeHub`, so its `ready` hook has already published
 * `module.api` and this only has to add to it.
 */
export function registerQuestIntake() {
  Hooks.once("ready", () => {
    const module = game.modules.get(MODULE_ID);
    const api = module?.api ?? {};
    Object.assign(api, { addQuest, hasQuest });
    if ( module ) module.api = api;
    if ( ui.velvetJournals ) Object.assign(ui.velvetJournals, { addQuest, hasQuest });
  });
}
