/** Turning a savegame into the board state the advisor reasons about. */

import { readWmlFile, parseWml, children, child, clean, num, type WNode } from "./wml";
import { resolveSave, type SaveFile } from "./paths";
import { lookupType } from "./unittypes";

export interface Attack {
  name: string;
  type: string;
  range: string;
  damage: number;
  number: number;
  specials: string[];
  accuracy: number;
  parry: number;
}

export interface Detail {
  id: string;
  name: string;
  description: string;
}

/** One item worn by a unit: the save carries its name, its slot and its catalogue number. */
export interface Equipment {
  name: string;
  sort: string;
  number: number;
}

export interface AbilityAura {
  tag: string;
  id: string;
  value: number;
  cumulative: boolean;
  affectSelf: boolean;
  affectAllies: boolean;
  affectEnemies: boolean;
}

export interface Unit {
  id: string;
  name: string;
  type: string;
  side: number;
  level: number;
  hp: number;
  maxHp: number;
  xp: number;
  maxXp: number;
  moves: number;
  maxMoves: number;
  x: number;
  y: number;
  alignment: string;
  canRecruit: boolean;
  onRecallList: boolean;
  attacks: Attack[];
  defence: Record<string, number>;
  movement: Record<string, number>;
  resistance: Record<string, number>;
  abilities: string[];
  /** Ability nodes that project onto neighbours: leadership, despair, and friends. */
  auras: AbilityAura[];
  traits: string[];
  items: string[];
  /** Names and explanations for the traits above, as the save spells them out. */
  traitDetails: Detail[];
  abilityDetails: Detail[];
  equipment: Equipment[];
  statuses: string[];
  /** `full` or `loyal`; a loyal unit costs no upkeep. */
  upkeep: string;
}

export interface Side {
  side: number;
  /** The side's own name, e.g. "Efraim de Ceise". */
  name: string;
  teamName: string;
  controller: string;
  /** Wesnoth's flag colour for the side: red, blue, green, ... */
  colour: string;
  gold: number;
  income: number;
  villageGold: number;
  recruits: string[];
  isPlayer: boolean;
  /** Objectives text as the running game shows it, markup included. */
  objectives: string;
  /** Villages this side currently holds. */
  villages: [number, number][];
}

export interface TimeOfDay {
  id: string;
  name: string;
  lawfulBonus: number;
}

export interface Board {
  save: SaveFile;
  /** True for a save written between scenarios: a recall list and gold, no board. */
  betweenScenarios: boolean;
  scenarioId: string;
  scenarioName: string;
  nextScenario: string;
  turn: number;
  turns: number;
  currentTimeIndex: number;
  schedule: TimeOfDay[];
  experienceModifier: number;
  sides: Side[];
  units: Unit[];
  map: string[][];
  itemStorage: { sort: string; type: number }[];
}

function table(n: WNode | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!n) return out;
  for (const [k, v] of Object.entries(n.attrs)) {
    const parsed = Number(v);
    if (Number.isFinite(parsed)) out[k] = parsed;
  }
  return out;
}

/** `increase_total=4` or `increase_total="20%"`, resolved against a base value. */
function applyDelta(base: number, raw: string | undefined, level: number, timesPerLevel: boolean): number {
  if (raw === undefined || raw === "") return base;
  const perLevel = timesPerLevel ? Math.max(1, level) : 1;
  if (raw.trim().endsWith("%")) {
    const pctVal = Number(raw.trim().slice(0, -1));
    if (!Number.isFinite(pctVal)) return base;
    return Math.round(base + (base * pctVal * perLevel) / 100);
  }
  const flat = Number(raw);
  if (!Number.isFinite(flat)) return base;
  return base + flat * perLevel;
}

/**
 * Rebuilds the type baseline with the unit's traits and equipped items applied,
 * the way Wesnoth does when it loads a unit whose resolved stats the save omitted.
 */
function typeBaseline(type: ReturnType<typeof lookupType>, mods: WNode | undefined, level: number, experienceModifier: number) {
  if (!type) return undefined;
  const out = {
    maxHp: type.hitpoints,
    // The scenario's experience_modifier scales the requirement before traits apply.
    maxXp: Math.max(1, Math.round((type.experience * experienceModifier) / 100)),
    maxMoves: type.movement,
    attacks: type.attacks.map((a) => ({ ...a, specials: [...a.specials] })),
    defence: { ...type.effectiveDefence },
    resistance: { ...type.effectiveResistance },
  };
  if (!mods) return out;

  const effectSources = [...children(mods, "trait"), ...children(mods, "object"), ...children(mods, "advancement")];
  for (const src of effectSources) {
    for (const eff of children(src, "effect")) {
      const applyTo = eff.attrs["apply_to"];
      const perLevel = eff.attrs["times"] === "per level";
      switch (applyTo) {
        case "hitpoints":
          out.maxHp = applyDelta(out.maxHp, eff.attrs["increase_total"], level, perLevel);
          break;
        case "max_experience":
          out.maxXp = applyDelta(out.maxXp, eff.attrs["increase"], level, perLevel);
          break;
        case "movement":
          out.maxMoves = applyDelta(out.maxMoves, eff.attrs["increase"], level, perLevel);
          break;
        case "attack": {
          const range = eff.attrs["range"];
          const name = eff.attrs["name"];
          for (const a of out.attacks) {
            if (range && a.range !== range) continue;
            if (name && a.name !== name && eff.attrs["name"] !== a.name) continue;
            a.damage = applyDelta(a.damage, eff.attrs["increase_damage"], level, perLevel);
            a.number = applyDelta(a.number, eff.attrs["increase_attacks"], level, perLevel);
            if (eff.attrs["set_damage"]) a.damage = Number(eff.attrs["set_damage"]) || a.damage;
          }
          break;
        }
        case "resistance": {
          const t = child(eff, "resistance");
          if (!t) break;
          const replace = eff.attrs["replace"] === "yes";
          for (const [k, v] of Object.entries(t.attrs)) {
            const val = Number(v);
            if (!Number.isFinite(val)) continue;
            out.resistance[k] = replace ? val : (out.resistance[k] ?? 100) + val;
          }
          break;
        }
        case "defense": {
          const t = child(eff, "defense");
          if (!t) break;
          const replace = eff.attrs["replace"] === "yes";
          for (const [k, v] of Object.entries(t.attrs)) {
            const val = Number(v);
            if (!Number.isFinite(val)) continue;
            out.defence[k] = replace ? val : Math.max(0, Math.min(100, (out.defence[k] ?? 50) + val));
          }
          break;
        }
        default:
          break;
      }
    }
  }
  return out;
}

function readUnit(n: WNode, experienceModifier: number): Unit {
  // A save omits everything a unit shares with its type, so the type fills the gaps.
  const type = lookupType(clean(n.attrs["type"]));

  const attacks: Attack[] = children(n, "attack").map((a) => ({
    name: clean(a.attrs["description"]) || a.attrs["name"] || "attack",
    type: a.attrs["type"] ?? "blade",
    range: a.attrs["range"] ?? "melee",
    damage: num(a, "damage"),
    number: num(a, "number"),
    accuracy: num(a, "accuracy"),
    parry: num(a, "parry"),
    specials: (child(a, "specials")?.children ?? []).map((s) => clean(s.attrs["id"]) || s.tag),
  }));

  const mods = child(n, "modifications");
  const traits = mods ? children(mods, "trait").map((t) => clean(t.attrs["id"])) : [];
  const traitDetails: Detail[] = mods
    ? children(mods, "trait").map((t) => ({
        id: clean(t.attrs["id"]),
        name: clean(t.attrs["name"]) || clean(t.attrs["male_name"]) || clean(t.attrs["id"]),
        description: clean(t.attrs["description"]),
      }))
    : [];
  const equipment: Equipment[] = mods
    ? children(mods, "object")
        .filter((o) => clean(o.attrs["name"]))
        .map((o) => ({
          name: clean(o.attrs["name"]),
          sort: clean(o.attrs["sort"]),
          number: Number(clean(o.attrs["number"])) || 0,
        }))
    : [];
  const items = equipment.map((e) => e.name);

  const abilitiesNode = child(n, "abilities");
  const abilities = abilitiesNode ? abilitiesNode.children.map((a) => clean(a.attrs["id"]) || a.tag) : [];
  const abilityDetails: Detail[] = (abilitiesNode?.children ?? []).map((a) => ({
    id: clean(a.attrs["id"]) || a.tag,
    name: clean(a.attrs["name"]) || clean(a.attrs["female_name"]) || clean(a.attrs["id"]) || a.tag,
    description: clean(a.attrs["description"]) || clean(a.attrs["special_note"]),
  }));
  const auras: AbilityAura[] = (abilitiesNode?.children ?? [])
    .filter((a) => a.tag === "leadership" || a.attrs["value"] !== undefined)
    .map((a) => ({
      tag: a.tag,
      id: clean(a.attrs["id"]) || a.tag,
      value: num(a, "value"),
      cumulative: a.attrs["cumulative"] === "yes",
      affectSelf: a.attrs["affect_self"] !== "no",
      affectAllies: a.attrs["affect_allies"] !== "no",
      affectEnemies: a.attrs["affect_enemies"] === "yes",
    }));

  const statusNode = child(n, "status");
  const statuses = statusNode
    ? Object.entries(statusNode.attrs)
        .filter(([, v]) => v === "yes")
        .map(([k]) => k)
    : [];

  const x = num(n, "x", -1);
  const y = num(n, "y", -1);

  const ownDefence = table(child(n, "defense"));
  const ownMovement = table(child(n, "movement_costs"));
  const ownResistance = table(child(n, "resistance"));
  const level = num(n, "level", type?.level ?? 1);
  const baseline = typeBaseline(type, mods, level, experienceModifier);

  return {
    id: n.attrs["id"] ?? "?",
    name: clean(n.attrs["name"]) || clean(n.attrs["language_name"]) || n.attrs["type"] || "?",
    type: clean(n.attrs["type"]),
    side: num(n, "side"),
    level,
    hp: num(n, "hitpoints", baseline?.maxHp ?? 1),
    maxHp: num(n, "max_hitpoints", baseline?.maxHp ?? 1),
    xp: num(n, "experience"),
    maxXp: num(n, "max_experience", baseline?.maxXp ?? 0),
    moves: num(n, "moves", baseline?.maxMoves ?? 0),
    maxMoves: num(n, "max_moves", baseline?.maxMoves ?? 0),
    x,
    y,
    alignment: n.attrs["alignment"] ?? type?.alignment ?? "neutral",
    canRecruit: n.attrs["canrecruit"] === "yes",
    onRecallList: x < 0 || y < 0,
    attacks: attacks.length ? attacks : (baseline?.attacks ?? []),
    defence: Object.keys(ownDefence).length ? ownDefence : (baseline?.defence ?? {}),
    movement: Object.keys(ownMovement).length ? ownMovement : (type?.effectiveMoveCosts ?? {}),
    resistance: Object.keys(ownResistance).length ? ownResistance : (baseline?.resistance ?? {}),
    abilities: abilities.length ? abilities : (type?.abilities ?? []),
    auras,
    traits,
    items,
    traitDetails,
    abilityDetails,
    equipment,
    statuses,
    upkeep: clean(n.attrs["upkeep"]) || "full",
  };
}

function parseMap(mapData: string): string[][] {
  return mapData
    .split("\n")
    .filter((l) => l.includes(","))
    .map((l) => l.split(",").map((c) => c.trim()));
}

/** A hex entry may carry a starting-position prefix, e.g. `1 Kh`. */
export function hexCode(cell: string): string {
  const parts = cell.split(" ");
  return parts[parts.length - 1]!;
}

export function loadBoard(nameOrPath?: string): Board {
  const save = resolveSave(nameOrPath);
  const root = parseWml(readWmlFile(save.path));
  // A save taken between scenarios has no board yet: only the carryover roster.
  const ctx = child(root, "snapshot") ?? child(root, "replay_start") ?? child(root, "carryover_sides_start");
  if (!ctx) throw new Error(`${save.name} contains no snapshot, replay_start or carryover block`);
  const betweenScenarios = ctx.tag === "carryover_sides_start";

  const sides: Side[] = children(ctx, "side").map((s) => ({
    side: num(s, "side"),
    name: clean(s.attrs["side_name"]) || clean(s.attrs["name"]) || clean(s.attrs["id"]),
    teamName: clean(s.attrs["user_team_name"]) || clean(s.attrs["team_name"]),
    controller: s.attrs["controller"] ?? "?",
    colour: clean(s.attrs["color"]) || "",
    gold: num(s, "gold"),
    income: num(s, "income"),
    villageGold: num(s, "village_gold", 1),
    recruits: (s.attrs["recruit"] ?? "").split(",").map((r) => r.trim()).filter(Boolean),
    isPlayer: s.attrs["controller"] === "human",
    objectives: clean(s.attrs["objectives"]),
    villages: children(s, "village").map((v) => [num(v, "x"), num(v, "y")] as [number, number]),
  }));

  const units: Unit[] = children(ctx, "side")
    .flatMap((s) => children(s, "unit"))
    .filter((u) => u.attrs["type"])
    .map((u) => readUnit(u, num(ctx, "experience_modifier", 100)));

  const schedule: TimeOfDay[] = children(ctx, "time").map((t) => ({
    id: t.attrs["id"] ?? "?",
    name: clean(t.attrs["name"]),
    lawfulBonus: num(t, "lawful_bonus"),
  }));

  const vars = child(ctx, "variables");
  const storage = vars ? child(vars, "item_storage") : undefined;
  const itemStorage = storage
    ? storage.children.map((c) => ({ sort: c.tag, type: num(c, "type") }))
    : [];

  return {
    save,
    betweenScenarios,
    scenarioId: ctx.attrs["id"] ?? root.attrs["label"] ?? "?",
    scenarioName: clean(ctx.attrs["name"]),
    nextScenario: ctx.attrs["next_scenario"] ?? "",
    turn: num(ctx, "turn_at", 1),
    turns: num(ctx, "turns", 0),
    currentTimeIndex: num(ctx, "current_time", 0),
    schedule,
    experienceModifier: num(ctx, "experience_modifier", 100),
    sides,
    units,
    map: parseMap(ctx.attrs["map_data"] ?? ""),
    itemStorage,
  };
}

/**
 * Time of day on a given turn. Wesnoth advances the schedule once per turn,
 * starting from the scenario's `current_time` offset on turn 1.
 */
export function timeOnTurn(board: Board, turn: number): TimeOfDay | undefined {
  if (board.schedule.length === 0) return undefined;
  const idx = (board.currentTimeIndex + (turn - board.turn)) % board.schedule.length;
  return board.schedule[((idx % board.schedule.length) + board.schedule.length) % board.schedule.length];
}

/** Damage multiplier from alignment against the current time of day, as a percentage. */
export function alignmentModifier(alignment: string, lawfulBonus: number): number {
  switch (alignment) {
    case "lawful":
      return 100 + lawfulBonus;
    case "chaotic":
      return 100 - lawfulBonus;
    case "liminal":
      return 100 - Math.abs(lawfulBonus);
    default:
      return 100;
  }
}


/**
 * Wesnoth's hex adjacency, matching `get_adjacent_tiles`.
 *
 * Odd columns sit half a hex HIGHER than even ones, so an even column's
 * diagonal neighbours are at y and y+1, and an odd column's are at y-1 and y.
 * Getting this backwards is silent: every hex still has six neighbours, they
 * are just the wrong six. The regression test pins it against scenario 02,
 * whose `moveto` trigger list is exactly the six hexes around Redain.
 */
export function adjacentHexes(x: number, y: number): [number, number][] {
  if (x % 2 === 0) {
    return [
      [x, y - 1],
      [x + 1, y],
      [x + 1, y + 1],
      [x, y + 1],
      [x - 1, y + 1],
      [x - 1, y],
    ];
  }
  return [
    [x, y - 1],
    [x + 1, y - 1],
    [x + 1, y],
    [x, y + 1],
    [x - 1, y],
    [x - 1, y - 1],
  ];
}

/** Units standing next to a hex. */
export function neighbours(board: Board, x: number, y: number): Unit[] {
  const keys = new Set(adjacentHexes(x, y).map(([a, b]) => `${a},${b}`));
  return board.units.filter((u) => !u.onRecallList && keys.has(`${u.x},${u.y}`));
}
