/**
 * The butcher's bill: who died, in which scenario, and what they were carrying
 * when they went down. Items on a dead unit are gone with them, so this is the
 * only record of what the campaign has actually cost.
 *
 * Two timescales, because one save cannot answer both. Finished scenarios are
 * measured between consecutive scenario-start saves, which is what `roster.ts`
 * already does. The scenario in progress is measured across its own autosaves,
 * which is the only way to see a unit that was recruited and killed inside it.
 */

import { listSaves, type SaveFile } from "./paths";
import { loadBoard, type Unit } from "./save";
import { snapshots, casualties } from "./roster";

export interface Fallen {
  id: string;
  name: string;
  type: string;
  level: number;
  /** Item names as the save spelled them out, in the last save the unit was alive in. */
  items: string[];
  scenario: string;
  /** Set for a loss inside the scenario in progress: the last turn they were seen alive. */
  lastSeenTurn: number | null;
  /** The save that last held them alive, so the claim can be checked by hand. */
  lastSeenSave: string;
}

export interface Ledger {
  /** Losses in scenarios that have finished, measured between scenario-start saves. */
  past: Fallen[];
  /** Losses inside the scenario being played now. */
  current: Fallen[];
  currentScenario: string;
  /** Losses per scenario, oldest first, for the tally. */
  perScenario: { scenario: string; lost: number }[];
  /** Every save the ledger read, so the numbers can be traced back. */
  readSaves: number;
}

interface Roll {
  save: SaveFile;
  turn: number;
  scenarioId: string;
  scenarioName: string;
  units: Map<string, Unit>;
}

const rollCache = new Map<string, Roll>();

/** One save's side-1 roster, on the map and on the recall list alike, keyed by unit id. */
function rollFor(save: SaveFile): Roll {
  const key = `${save.path}@${save.mtime.getTime()}`;
  const hit = rollCache.get(key);
  if (hit) return hit;
  const board = loadBoard(save.path);
  const units = new Map<string, Unit>();
  for (const u of board.units) {
    // A carryover save writes the roster with no side at all; a live one uses side 1.
    if (u.side !== 1 && u.side !== 0) continue;
    units.set(u.id || u.name, u);
  }
  const roll: Roll = {
    save,
    turn: board.turn,
    scenarioId: board.scenarioId,
    scenarioName: board.scenarioName || board.scenarioId,
    units,
  };
  rollCache.set(key, roll);
  return roll;
}

/**
 * Every save belonging to the scenario in progress, oldest first: the plain
 * scenario-start save and the autosaves Wesnoth wrote after it.
 */
function currentScenarioSaves(): SaveFile[] {
  const playable = listSaves()
    .filter((s) => !s.isReplay)
    .sort((a, b) => a.mtime.getTime() - b.mtime.getTime());
  const newest = playable[playable.length - 1];
  if (!newest) return [];
  // The scenario's own saves share the filename stem before the autosave suffix.
  const stem = newest.name.replace(/-Auto-Save\d+$/, "");
  return playable.filter((s) => s.name === stem || s.name.startsWith(`${stem}-Auto-Save`));
}

export function fallenLedger(): Ledger {
  const snaps = snapshots();
  const past: Fallen[] = casualties(snaps).map((c) => ({
    id: c.name,
    name: c.name,
    type: c.type,
    level: c.level,
    items: c.items,
    scenario: c.lostIn,
    lastSeenTurn: null,
    lastSeenSave: snaps.find((s) => s.scenarioName === c.lostIn)?.save.name ?? "",
  }));

  const saves = currentScenarioSaves();
  const current: Fallen[] = [];
  let currentScenario = "";
  let previous: Roll | undefined;
  for (const save of saves) {
    const roll = rollFor(save);
    currentScenario = roll.scenarioName;
    if (previous) {
      for (const [id, u] of previous.units) {
        if (roll.units.has(id)) continue;
        // A unit that leaves the roster between two saves of the same scenario died in it.
        current.push({
          id,
          name: u.name,
          type: u.type,
          level: u.level,
          items: u.items,
          scenario: roll.scenarioName,
          lastSeenTurn: previous.turn,
          lastSeenSave: previous.save.name,
        });
      }
    }
    previous = roll;
  }

  const perScenario: { scenario: string; lost: number }[] = [];
  for (const s of snaps) {
    perScenario.push({ scenario: s.scenarioName, lost: past.filter((f) => f.scenario === s.scenarioName).length });
  }
  const here = perScenario.find((p) => p.scenario === currentScenario);
  if (here) here.lost += current.length;
  else if (currentScenario) perScenario.push({ scenario: currentScenario, lost: current.length });

  return { past, current, currentScenario, perScenario, readSaves: snaps.length + saves.length };
}
