/**
 * Unit type index.
 *
 * A savegame writes each unit as a delta against its type: anything unchanged from
 * the type definition is simply absent. A freshly recruited orc therefore carries no
 * `[defense]`, `[resistance]` or `[attack]` block at all. This module reads the
 * installed unit definitions and movetypes so those gaps can be filled from the same
 * files the running game used.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { coreDataDir, addonsDir } from "./paths";
import { parseWml, children, child, clean, type WNode } from "./wml";
import type { Attack } from "./save";

export interface MoveType {
  name: string;
  defence: Record<string, number>;
  movement: Record<string, number>;
  resistance: Record<string, number>;
}

export interface UnitType {
  id: string;
  level: number;
  hitpoints: number;
  experience: number;
  movement: number;
  alignment: string;
  advancesTo: string;
  movementType: string;
  baseUnit?: string;
  attacks: Attack[];
  defence: Record<string, number>;
  moveCosts: Record<string, number>;
  resistance: Record<string, number>;
  abilities: string[];
}

let index: { types: Map<string, UnitType>; moves: Map<string, MoveType> } | null = null;

function walkCfgs(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) walkCfgs(p, out);
    else if (entry.endsWith(".cfg")) out.push(p);
  }
  return out;
}

function numTable(n: WNode | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!n) return out;
  for (const [k, v] of Object.entries(n.attrs)) {
    const parsed = Number(v);
    if (Number.isFinite(parsed)) out[k] = parsed;
  }
  return out;
}

function readAttacks(n: WNode): Attack[] {
  return children(n, "attack").map((a) => ({
    name: clean(a.attrs["description"]) || a.attrs["name"] || "attack",
    type: a.attrs["type"] ?? "blade",
    range: a.attrs["range"] ?? "melee",
    damage: Number(a.attrs["damage"] ?? 0) || 0,
    number: Number(a.attrs["number"] ?? 0) || 0,
    accuracy: Number(a.attrs["accuracy"] ?? 0) || 0,
    parry: Number(a.attrs["parry"] ?? 0) || 0,
    specials: (child(a, "specials")?.children ?? []).map((s) => clean(s.attrs["id"]) || s.tag),
  }));
}

function build() {
  if (index) return index;
  const types = new Map<string, UnitType>();
  const moves = new Map<string, MoveType>();

  const files: string[] = [];
  const core = coreDataDir();
  files.push(join(core, "core/units.cfg"));
  files.push(...walkCfgs(join(core, "core/units")));
  const addons = addonsDir();
  if (existsSync(addons)) {
    for (const addon of readdirSync(addons)) {
      files.push(...walkCfgs(join(addons, addon, "units")));
    }
  }

  for (const f of files) {
    let root: WNode;
    try {
      root = parseWml(readFileSync(f, "utf8"));
    } catch {
      continue;
    }
    collect(root, types, moves);
  }

  index = { types, moves };
  return index;
}

/** Unit types and movetypes can sit at any depth inside a campaign's `.cfg`. */
function collect(n: WNode, types: Map<string, UnitType>, moves: Map<string, MoveType>) {
  for (const c of n.children) {
    if (c.tag === "movetype") {
      const name = c.attrs["name"];
      if (name && !moves.has(name)) {
        moves.set(name, {
          name,
          defence: numTable(child(c, "defense")),
          movement: numTable(child(c, "movement_costs")),
          resistance: numTable(child(c, "resistance")),
        });
      }
      continue;
    }
    if (c.tag === "unit_type") {
      const id = c.attrs["id"];
      if (id && !types.has(id)) {
        types.set(id, {
          id,
          level: Number(c.attrs["level"] ?? 1) || 1,
          hitpoints: Number(c.attrs["hitpoints"] ?? 1) || 1,
          experience: Number(c.attrs["experience"] ?? 0) || 0,
          movement: Number(c.attrs["movement"] ?? 5) || 5,
          alignment: c.attrs["alignment"] ?? "neutral",
          advancesTo: c.attrs["advances_to"] ?? "null",
          movementType: c.attrs["movement_type"] ?? "",
          baseUnit: child(c, "base_unit")?.attrs["id"],
          attacks: readAttacks(c),
          defence: numTable(child(c, "defense")),
          moveCosts: numTable(child(c, "movement_costs")),
          resistance: numTable(child(c, "resistance")),
          abilities: (child(c, "abilities")?.children ?? []).map((a) => clean(a.attrs["id"]) || a.tag),
        });
      }
      // Variations and nested types still need scanning.
    }
    collect(c, types, moves);
  }
}

export interface ResolvedType extends UnitType {
  /** Tables with the movetype merged in underneath the unit's own overrides. */
  effectiveDefence: Record<string, number>;
  effectiveMoveCosts: Record<string, number>;
  effectiveResistance: Record<string, number>;
}

export function lookupType(id: string, seen = new Set<string>()): ResolvedType | undefined {
  const { types, moves } = build();
  const t = types.get(id);
  if (!t) return undefined;
  if (seen.has(id)) return undefined;
  seen.add(id);

  const base = t.baseUnit ? lookupType(t.baseUnit, seen) : undefined;
  const mt = moves.get(t.movementType || base?.movementType || "");

  const merge = (own: Record<string, number>, inherited?: Record<string, number>, fromMove?: Record<string, number>) => ({
    ...(fromMove ?? {}),
    ...(inherited ?? {}),
    ...own,
  });

  return {
    ...t,
    level: t.level || base?.level || 1,
    hitpoints: t.hitpoints || base?.hitpoints || 1,
    experience: t.experience || base?.experience || 0,
    movement: t.movement || base?.movement || 5,
    alignment: t.alignment || base?.alignment || "neutral",
    movementType: t.movementType || base?.movementType || "",
    attacks: t.attacks.length ? t.attacks : (base?.attacks ?? []),
    abilities: t.abilities.length ? t.abilities : (base?.abilities ?? []),
    effectiveDefence: merge(t.defence, base?.effectiveDefence, mt?.defence),
    effectiveMoveCosts: merge(t.moveCosts, base?.effectiveMoveCosts, mt?.movement),
    effectiveResistance: merge(t.resistance, base?.effectiveResistance, mt?.resistance),
  };
}

export function typeCount(): number {
  return build().types.size;
}
