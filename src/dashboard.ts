/**
 * The board as the dashboard needs it: one JSON snapshot per save, assembled from
 * the same modules the CLI uses. Nothing here computes game numbers of its own; it
 * arranges what `save.ts`, `terrain.ts`, `odds.ts` and `brief.ts` already resolve.
 */

import { loadBoard, timeOnTurn, alignmentModifier, hexCode, neighbours, type Board, type Side, type Unit } from "./save";
import { hexInfo, classesFor, defenceOn } from "./terrain";
import { lookupType } from "./unittypes";
import { auraModifier } from "./odds";
import { briefScenario, difficultyFromSave, type ScenarioBrief } from "./brief";
import { gameConfig, type GameConfig } from "./gameconfig";
import { lookupItem, type ItemDef } from "./items";

export interface TerrainView {
  code: string;
  /** Defence classes of the whole hex, overlays included. */
  classes: string[];
  /** Classes of the base half only, which is what the hex is coloured by. */
  base: string[];
  village: boolean;
  keep: boolean;
  castle: boolean;
  heals: number;
}

/** An item, wherever it sits: in the bag, or worn by someone. */
export interface ItemView {
  number: number;
  name: string;
  sort: string;
  /** Path on this server for the item's own icon, empty when the catalogue has none. */
  icon: string;
  description: string;
  flavour: string;
  properties: { key: string; value: string }[];
  grants: string[];
  /** Who is wearing it, empty when it sits in the bag. */
  wornBy: string;
}

export interface UnitView extends Unit {
  /** Path on this server for the unit's own sprite, empty when the type has none. */
  sprite: string;
  hostile: boolean;
  terrain: string;
  /** Chance to be hit on the hex it stands on, in percent. */
  hexDefence: number;
  /** Time-of-day multiplier on its damage, in percent. */
  alignmentPercent: number;
  /** Leadership and despair projected by its neighbours, in percent. */
  auraPercent: number;
  auraSources: string[];
  advancesTo: string;
  /** Ids of the units standing next to this one that it could attack right now. */
  adjacentEnemies: string[];
}

export interface SideView extends Side {
  hostile: boolean;
  onMap: number;
  recallList: number;
  villageCount: number;
  /** Levels on the map that are not loyal, which is what upkeep is charged against. */
  levelsOnMap: number;
  /** Levels beyond what the villages support, each costing a gold a turn. */
  upkeep: number;
  /** base income + the side's bonus + village gold - upkeep, per the engine's own constants. */
  netIncome: number;
}

export interface Snapshot {
  save: { name: string; path: string; mtime: string };
  scenario: {
    id: string;
    name: string;
    next: string;
    turn: number;
    turns: number;
    difficulty: string;
    experienceModifier: number;
    betweenScenarios: boolean;
    time: { id: string; name: string; lawfulBonus: number } | null;
    upcoming: { turn: number; id: string; name: string; lawfulBonus: number }[];
  };
  sides: SideView[];
  units: UnitView[];
  map: {
    width: number;
    height: number;
    /** Row-major hex codes, exactly as the save's `map_data` gives them. */
    rows: string[][];
    legend: Record<string, TerrainView>;
    /** `"x,y"` to the side holding that village. */
    villageOwner: Record<string, number>;
  };
  /** Items sitting in the shared bag, resolved against the add-on's own catalogue. */
  bag: ItemView[];
  /** Every item currently worn by someone, so nothing is lost track of. */
  worn: ItemView[];
  /** The engine's own constants, so the page never states a rule number it did not read. */
  rules: GameConfig;
  objectives: { condition: string; text: string }[];
  /** The objectives block the running game shows, markup stripped. */
  liveObjectives: string;
  brief: Pick<ScenarioBrief, "drops" | "carryover" | "notableEvents"> | null;
  generatedAt: string;
}

const terrainCache = new Map<string, TerrainView>();

function terrainView(code: string): TerrainView {
  const hit = terrainCache.get(code);
  if (hit) return hit;
  const info = hexInfo(code);
  const view: TerrainView = {
    code,
    classes: info.classes,
    base: classesFor(code.split("^")[0]!, "def"),
    village: info.isVillage,
    keep: info.isKeep,
    castle: info.isCastle,
    heals: info.heals,
  };
  terrainCache.set(code, view);
  return view;
}

/** Wesnoth shows objectives with pango markup; the dashboard renders plain text. */
function stripMarkup(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

function itemView(def: ItemDef | undefined, fallback: { name: string; sort: string; number: number }, wornBy = ""): ItemView {
  return {
    number: fallback.number,
    name: def?.name || fallback.name || `${fallback.sort} #${fallback.number}`,
    sort: def?.sort || fallback.sort,
    icon: def?.image ? `/img/item/${fallback.number}` : "",
    description: def?.description ?? "",
    flavour: def?.flavour ?? "",
    properties: def?.properties ?? [],
    grants: def?.grants ?? [],
    wornBy,
  };
}

export function buildSnapshot(board: Board): Snapshot {
  const playerTeam = board.sides.find((s) => s.isPlayer)?.teamName ?? "";
  const hostileSides = new Set(board.sides.filter((s) => s.teamName !== playerTeam).map((s) => s.side));
  const time = timeOnTurn(board, board.turn) ?? null;

  const upcoming = Array.from({ length: Math.min(8, Math.max(0, board.turns - board.turn + 1)) || 8 }, (_, i) => {
    const t = timeOnTurn(board, board.turn + i);
    return t ? { turn: board.turn + i, id: t.id, name: t.name, lawfulBonus: t.lawfulBonus } : null;
  }).filter((t): t is NonNullable<typeof t> => t !== null);

  const villageOwner: Record<string, number> = {};
  for (const s of board.sides) for (const [x, y] of s.villages) villageOwner[`${x},${y}`] = s.side;

  const legend: Record<string, TerrainView> = {};
  const rows = board.map.map((row) =>
    row.map((cell) => {
      const code = hexCode(cell);
      if (!legend[code]) legend[code] = terrainView(code);
      return code;
    }),
  );

  const units: UnitView[] = board.units.map((u) => {
    const type = lookupType(u.type);
    const terrain = u.onRecallList ? "" : (rows[u.y]?.[u.x] ?? "");
    const aura = auraModifier(board, u);
    return {
      ...u,
      sprite: type?.image ? `/img/unit/${encodeURIComponent(u.type)}` : "",
      hostile: hostileSides.has(u.side),
      terrain,
      hexDefence: terrain ? defenceOn(terrain, u.defence) : 0,
      alignmentPercent: alignmentModifier(u.alignment, time?.lawfulBonus ?? 0),
      auraPercent: aura.percent,
      auraSources: aura.sources,
      advancesTo: type?.advancesTo && type.advancesTo !== "null" ? type.advancesTo : "",
      adjacentEnemies: u.onRecallList
        ? []
        : neighbours(board, u.x, u.y)
            .filter((other) => hostileSides.has(other.side) !== hostileSides.has(u.side))
            .map((other) => other.id),
    };
  });

  const cfg = gameConfig();
  const sides: SideView[] = board.sides.map((s) => {
    const mine = units.filter((u) => u.side === s.side);
    const onMap = mine.filter((u) => !u.onRecallList);
    // Loyal units cost nothing; every other level costs a gold a turn beyond what
    // the villages support. Both rules come from `game_config.cfg`.
    const levels = onMap.filter((u) => u.upkeep !== "loyal" && !u.traits.includes("loyal")).reduce((n, u) => n + Math.max(1, u.level), 0);
    const upkeep = Math.max(0, levels - s.villages.length * cfg.villageSupport);
    return {
      ...s,
      hostile: hostileSides.has(s.side),
      onMap: onMap.length,
      recallList: mine.length - onMap.length,
      villageCount: s.villages.length,
      levelsOnMap: levels,
      upkeep,
      netIncome: cfg.baseIncome + s.income + s.villages.length * s.villageGold - upkeep,
    };
  });

  const bag: ItemView[] = board.itemStorage.map((entry) =>
    itemView(lookupItem(entry.type), { name: "", sort: entry.sort, number: entry.type }),
  );
  const worn: ItemView[] = units.flatMap((u) =>
    u.equipment.map((e) => itemView(lookupItem(e.number), e, u.name)),
  );

  let brief: Snapshot["brief"] = null;
  let objectives: { condition: string; text: string }[] = [];
  try {
    const b = briefScenario(board.scenarioId, difficultyFromSave(board.save.path));
    brief = { drops: b.drops, carryover: b.carryover, notableEvents: b.notableEvents };
    objectives = b.objectives.map((o) => ({ condition: o.condition, text: stripMarkup(o.text) }));
  } catch {
    // A scenario the add-on does not carry, or a save between scenarios. The board still stands on its own.
  }

  let difficulty = "?";
  try {
    difficulty = difficultyFromSave(board.save.path);
  } catch {
    // Older saves may not carry the difficulty define.
  }

  return {
    save: { name: board.save.name, path: board.save.path, mtime: board.save.mtime.toISOString() },
    scenario: {
      id: board.scenarioId,
      name: board.scenarioName || board.scenarioId,
      next: board.nextScenario,
      turn: board.turn,
      turns: board.turns,
      difficulty,
      experienceModifier: board.experienceModifier,
      betweenScenarios: board.betweenScenarios,
      time: time ? { id: time.id, name: time.name, lawfulBonus: time.lawfulBonus } : null,
      upcoming,
    },
    sides,
    units,
    map: { width: rows[0]?.length ?? 0, height: rows.length, rows, legend, villageOwner },
    bag,
    worn,
    rules: cfg,
    objectives,
    liveObjectives: stripMarkup(board.sides.find((s) => s.isPlayer)?.objectives ?? ""),
    brief,
    generatedAt: new Date().toISOString(),
  };
}

export function snapshotFor(saveNameOrPath?: string): Snapshot {
  return buildSnapshot(loadBoard(saveNameOrPath));
}
