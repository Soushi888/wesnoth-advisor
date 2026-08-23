/**
 * Terrain resolution.
 *
 * A map hex is a code like `Gg`, `Gg^Vh` or `Re^Gvs`. A unit's `[defense]` and
 * `[movement_costs]` blocks are keyed by base class ids (`flat`, `forest`, `village`, ...).
 * This module walks `data/core/terrain.cfg` to translate one into the other.
 *
 * Wesnoth's rule for a composite terrain: the unit takes the BEST defence and the
 * WORST movement cost among the terrain's alias classes.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { coreDataDir } from "./paths";
import { parseWml, children, type WNode } from "./wml";

interface TerrainType {
  id: string;
  code: string;
  aliasOf: string[];
  defAlias: string[];
  mvtAlias: string[];
  givesIncome: boolean;
  heals: number;
  recruitFrom: boolean;
}

let cache: { byCode: Map<string, TerrainType>; baseIds: Set<string> } | null = null;

function splitList(v: string | undefined): string[] {
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function loadSync() {
  if (cache) return cache;
  const path = join(coreDataDir(), "core/terrain.cfg");
  const raw = readFileSync(path, "utf8");
  const root = parseWml(raw);
  const byCode = new Map<string, TerrainType>();
  const baseIds = new Set<string>();
  for (const t of children(root, "terrain_type") as WNode[]) {
    const code = t.attrs["string"];
    const id = t.attrs["id"];
    if (!code || !id) continue;
    const tt: TerrainType = {
      id,
      code,
      aliasOf: splitList(t.attrs["aliasof"]),
      defAlias: splitList(t.attrs["def_alias"]),
      mvtAlias: splitList(t.attrs["mvt_alias"]),
      givesIncome: t.attrs["gives_income"] === "yes",
      heals: Number(t.attrs["heals"] ?? 0) || 0,
      recruitFrom: t.attrs["recruit_from"] === "yes",
    };
    byCode.set(code, tt);
    // A terrain with no aliases of any kind is a base class: its id is a
    // `[defense]` key. That is how `Gt` -> flat, `Ft` -> forest and friends work.
    if (tt.aliasOf.length === 0 && tt.defAlias.length === 0) baseIds.add(id);
  }
  cache = { byCode, baseIds };
  return cache;
}

/**
 * Resolves one hex code to the set of base class ids that apply to it.
 * `_bas` inside an overlay's alias list means "whatever the base half resolves to".
 */
export function classesFor(hexCode: string, which: "def" | "mvt" = "def"): string[] {
  const { byCode, baseIds } = loadSync();
  const parts = hexCode.split("^");
  const base = parts[0]!;
  const overlays = parts.slice(1).map((o) => "^" + o);

  const resolve = (code: string, seen = new Set<string>()): string[] => {
    if (seen.has(code)) return [];
    seen.add(code);
    const t = byCode.get(code);
    if (!t) return [];
    if (baseIds.has(t.id)) return [t.id];
    const list = which === "def" ? (t.defAlias.length ? t.defAlias : t.aliasOf) : t.mvtAlias.length ? t.mvtAlias : t.aliasOf;
    const out: string[] = [];
    for (const a of list) {
      if (a === "_bas" || a === "-") continue;
      out.push(...resolve(a, seen));
    }
    return out;
  };

  const baseClasses = resolve(base);
  if (overlays.length === 0) return unique(baseClasses);

  const out: string[] = [];
  for (const ov of overlays) {
    const t = byCode.get(ov);
    if (!t) continue;
    const list = which === "def" ? (t.defAlias.length ? t.defAlias : t.aliasOf) : t.mvtAlias.length ? t.mvtAlias : t.aliasOf;
    if (list.length === 0) {
      // A pure decoration with no aliases at all leaves the base untouched.
      continue;
    }
    for (const a of list) {
      if (a === "-") continue;
      if (a === "_bas") {
        out.push(...baseClasses);
        continue;
      }
      out.push(...resolve(a));
    }
  }
  return unique(out.length ? out : baseClasses);
}

function unique(a: string[]): string[] {
  return [...new Set(a)];
}

/** Best (lowest) chance-to-be-hit the unit gets on this hex, in percent. */
export function defenceOn(hexCode: string, defenceTable: Record<string, number>): number {
  const classes = classesFor(hexCode, "def");
  const values = classes.map((c) => defenceTable[c]).filter((v): v is number => typeof v === "number");
  if (values.length === 0) return 50;
  return Math.min(...values);
}

/** Worst (highest) movement cost among the hex's classes. */
export function moveCostOn(hexCode: string, moveTable: Record<string, number>): number {
  const classes = classesFor(hexCode, "mvt");
  const values = classes.map((c) => moveTable[c]).filter((v): v is number => typeof v === "number");
  if (values.length === 0) return 1;
  return Math.max(...values);
}

export interface HexInfo {
  code: string;
  classes: string[];
  isVillage: boolean;
  isCastle: boolean;
  isKeep: boolean;
  heals: number;
}

export function hexInfo(hexCode: string): HexInfo {
  const { byCode } = loadSync();
  const parts = hexCode.split("^");
  const pieces = [parts[0]!, ...parts.slice(1).map((o) => "^" + o)];
  let isVillage = false;
  let isKeep = false;
  let heals = 0;
  for (const p of pieces) {
    const t = byCode.get(p);
    if (!t) continue;
    if (t.givesIncome) isVillage = true;
    if (t.recruitFrom) isKeep = true;
    heals = Math.max(heals, t.heals);
  }
  const classes = classesFor(hexCode, "def");
  return { code: hexCode, classes, isVillage, isCastle: classes.includes("castle"), isKeep, heals };
}
