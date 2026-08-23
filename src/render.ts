/** ASCII rendering of the board: terrain underneath, units on top. */

import { hexCode, type Board, type Unit } from "./save";
import { hexInfo } from "./terrain";

const RESET = "\x1b[0m";
const SIDE_COLOUR: Record<number, string> = {
  1: "\x1b[94m", // blue, the player
  2: "\x1b[92m", // green, ally
  3: "\x1b[93m", // yellow, conditional ally
  4: "\x1b[91m", // red, enemy
  5: "\x1b[95m",
  6: "\x1b[96m",
};

function terrainGlyph(code: string): string {
  const info = hexInfo(code);
  if (info.isVillage) return "v";
  if (info.isKeep) return "K";
  if (info.classes.includes("castle")) return "c";
  if (info.classes.includes("forest")) return "F";
  if (info.classes.includes("hills")) return "h";
  if (info.classes.includes("mountains")) return "M";
  if (info.classes.includes("shallow_water") || info.classes.includes("deep_water")) return "~";
  if (info.classes.includes("swamp_water")) return "s";
  if (info.classes.includes("sand")) return ":";
  if (info.classes.includes("impassable") || info.classes.includes("unwalkable")) return "#";
  return ".";
}

/**
 * A unit's marker. Friendly units read as their level digit and `@` for a leader;
 * hostile units read as a letter (a = level 1, b = level 2, ...) and `!` for a leader,
 * so the board stays legible when the output is piped somewhere without colour.
 */
function unitGlyph(u: Unit, colour: boolean, hostile: boolean): string {
  const level = Math.max(1, Math.min(9, u.level || 1));
  const ch = hostile
    ? u.canRecruit
      ? "!"
      : String.fromCharCode(96 + level)
    : u.canRecruit
      ? "@"
      : String(level);
  if (!colour) return ch;
  return `${SIDE_COLOUR[u.side] ?? ""}${ch}${RESET}`;
}

export interface RenderOptions {
  colour?: boolean;
  /** Only draw this window of the map, e.g. to focus on the front line. */
  yRange?: [number, number];
  xRange?: [number, number];
}

export function renderBoard(board: Board, opts: RenderOptions = {}): string {
  const colour = opts.colour ?? process.stdout.isTTY;
  const height = board.map.length;
  const width = board.map[0]?.length ?? 0;
  const [y0, y1] = opts.yRange ?? [0, height - 1];
  const [x0, x1] = opts.xRange ?? [0, width - 1];

  // Sides whose team differs from the player's are drawn as hostile.
  const playerTeam = board.sides.find((s) => s.isPlayer)?.teamName ?? "";
  const hostile = new Set(board.sides.filter((s) => s.teamName !== playerTeam).map((s) => s.side));

  const byHex = new Map<string, Unit[]>();
  for (const u of board.units) {
    if (u.onRecallList) continue;
    const key = `${u.x},${u.y}`;
    const list = byHex.get(key) ?? [];
    list.push(u);
    byHex.set(key, list);
  }

  const lines: string[] = [];
  // Column ruler: tens digit then units digit.
  const tens = ["    "];
  const ones = ["    "];
  for (let x = x0; x <= x1; x++) {
    tens.push(x % 10 === 0 ? String(Math.floor(x / 10) % 10) : " ");
    ones.push(String(x % 10));
  }
  lines.push(tens.join(""));
  lines.push(ones.join(""));

  for (let y = y0; y <= y1; y++) {
    const row = board.map[y];
    if (!row) continue;
    const cells: string[] = [String(y).padStart(3, " ") + " "];
    for (let x = x0; x <= x1; x++) {
      const cell = row[x];
      if (cell === undefined) {
        cells.push(" ");
        continue;
      }
      const here = byHex.get(`${x},${y}`);
      cells.push(here && here.length ? unitGlyph(here[0]!, colour, hostile.has(here[0]!.side)) : terrainGlyph(hexCode(cell)));
    }
    lines.push(cells.join(""));
  }

  lines.push("");
  lines.push("terrain  . flat/road   F forest   h hills   M mountains   v village   c castle   K keep   ~ water   # impassable");
  lines.push("friendly digit = level, @ = leader        hostile  a=L1 b=L2 c=L3 ..., ! = leader");
  const hostileList = board.sides.filter((s) => hostile.has(s.side)).map((s) => `${s.side} ${s.teamName}`);
  lines.push(`hostile sides: ${hostileList.length ? hostileList.join(", ") : "none"}`);
  return lines.join("\n");
}
