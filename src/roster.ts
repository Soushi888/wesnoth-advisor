/**
 * Who is still alive and who is not, reconstructed from the savegames.
 *
 * Wesnoth writes one save per scenario as it begins, holding the carryover
 * roster. Diffing consecutive scenario-start rosters says exactly who did not
 * survive the scenario between them. That is evidence rather than memory, so a
 * later session can regenerate the count instead of trusting a stale list.
 *
 * The one blind spot: a unit recruited and killed inside the same scenario
 * never appears in either snapshot, so it is invisible here. The report says so.
 */

import { listSaves, type SaveFile } from "./paths";
import { loadBoard, type Unit } from "./save";

export interface RosterEntry {
  name: string;
  type: string;
  level: number;
  xp: number;
  maxXp: number;
  items: string[];
  loyal: boolean;
}

export interface Snapshot {
  save: SaveFile;
  scenarioId: string;
  scenarioName: string;
  units: Map<string, RosterEntry>;
  gold: number;
  /** Unequipped items, as `sort #number` strings, for diffing the bag. */
  storage: string[];
}

/** What one scenario cost and earned, measured between its start and the next one's. */
export interface ScenarioDelta {
  scenario: string;
  turnsUnknown: true;
  goldStart: number;
  goldNext: number;
  lost: Casualty[];
  joined: RosterEntry[];
  levelled: { name: string; from: number; to: number; type: string }[];
  xpGained: { name: string; gained: number }[];
  itemsGained: string[];
  itemsLost: string[];
}

export interface Casualty {
  name: string;
  type: string;
  level: number;
  items: string[];
  /** The scenario they were last seen alive at the start of. */
  lostIn: string;
}

/** A scenario-start save: the plain campaign save Wesnoth writes, no autosave suffix, no replay. */
function isScenarioStart(s: SaveFile): boolean {
  return !s.isReplay && !/-Auto-Save\d+$/.test(s.name);
}

/**
 * A between-scenarios save carries the carryover roster but no scenario name,
 * so fall back to the campaign prefix in the filename: `LotI1-Banished`.
 */
function labelFromSaveName(name: string): string {
  return name.replace(/^[A-Za-z0-9]+-/, "").trim() || name;
}

function entry(u: Unit): RosterEntry {
  return {
    name: u.name,
    type: u.type,
    level: u.level,
    xp: u.xp,
    maxXp: u.maxXp,
    items: u.items,
    loyal: u.traits.includes("loyal"),
  };
}

/** Saves more than this far apart belong to different playthroughs. */
const RUN_GAP_DAYS = 30;

/**
 * Keeps only the most recent playthrough. A campaign restarted months later
 * would otherwise inherit the previous run's roster and report its dead as ours.
 */
function latestRun(snaps: Snapshot[]): Snapshot[] {
  if (snaps.length === 0) return snaps;
  let start = 0;
  for (let i = 1; i < snaps.length; i++) {
    const gap = snaps[i]!.save.mtime.getTime() - snaps[i - 1]!.save.mtime.getTime();
    if (gap > RUN_GAP_DAYS * 86_400_000) start = i;
  }
  return snaps.slice(start);
}

/**
 * Scenario-start snapshots for the current playthrough, oldest first. `since`
 * overrides the automatic run split when you want an explicit cutoff.
 */
export function snapshots(since?: Date): Snapshot[] {
  const all = listSaves()
    .filter(isScenarioStart)
    .filter((s) => !since || s.mtime >= since)
    .sort((a, b) => a.mtime.getTime() - b.mtime.getTime())
    .map((s) => {
      const board = loadBoard(s.path);
      const units = new Map<string, RosterEntry>();
      // A scenario-start save stores the carryover roster with no side field, so
      // select on having a unit type rather than on side.
      for (const u of board.units.filter((u) => u.type && (u.side === 1 || !u.side))) units.set(u.name, entry(u));
      return {
        save: s,
        scenarioId: board.scenarioId,
        scenarioName: board.scenarioName || labelFromSaveName(s.name),
        units,
        gold: board.sides[0]?.gold ?? 0,
        storage: board.itemStorage.map((i) => `${i.sort} #${i.type}`).sort(),
      };
    })
    .filter((s) => s.units.size > 0);
  return since ? all : latestRun(all);
}

/** Names present at the start of one scenario and absent at the start of the next. */
export function casualties(snaps: Snapshot[]): Casualty[] {
  const out: Casualty[] = [];
  for (let i = 0; i < snaps.length - 1; i++) {
    const before = snaps[i]!;
    const after = snaps[i + 1]!;
    for (const [name, u] of before.units) {
      if (!after.units.has(name)) {
        out.push({ name, type: u.type, level: u.level, items: u.items, lostIn: before.scenarioName });
      }
    }
  }
  return out;
}

/** Everyone who has ever appeared, and the scenario they first showed up in. */
export function debuts(snaps: Snapshot[]): Map<string, string> {
  const seen = new Map<string, string>();
  for (const s of snaps) {
    for (const name of s.units.keys()) if (!seen.has(name)) seen.set(name, s.scenarioName);
  }
  return seen;
}

function multisetDiff(before: string[], after: string[]): string[] {
  const pool = [...after];
  const missing: string[] = [];
  for (const b of before) {
    const at = pool.indexOf(b);
    if (at === -1) missing.push(b);
    else pool.splice(at, 1);
  }
  return missing;
}

/**
 * What happened during the scenario that snapshot `i` opens, measured against
 * the snapshot that follows it. Everything here is a difference between two
 * saves, so none of it depends on anyone remembering the run correctly.
 */
export function scenarioDelta(snaps: Snapshot[], i: number): ScenarioDelta | undefined {
  const before = snaps[i];
  const after = snaps[i + 1];
  if (!before || !after) return undefined;

  const lost: Casualty[] = [];
  const levelled: ScenarioDelta["levelled"] = [];
  const xpGained: ScenarioDelta["xpGained"] = [];
  for (const [name, u] of before.units) {
    const now = after.units.get(name);
    if (!now) {
      lost.push({ name, type: u.type, level: u.level, items: u.items, lostIn: before.scenarioName });
      continue;
    }
    if (now.level > u.level) levelled.push({ name, from: u.level, to: now.level, type: now.type });
    // A level up or an advancement resets experience, so only count a plain gain.
    if (now.xp > u.xp) xpGained.push({ name, gained: now.xp - u.xp });
  }
  const joined = [...after.units.entries()].filter(([n]) => !before.units.has(n)).map(([, u]) => u);

  return {
    scenario: before.scenarioName,
    turnsUnknown: true,
    goldStart: before.gold,
    goldNext: after.gold,
    lost,
    joined,
    levelled,
    xpGained: xpGained.sort((a, b) => b.gained - a.gained),
    itemsGained: multisetDiff(after.storage, before.storage),
    itemsLost: multisetDiff(before.storage, after.storage),
  };
}
