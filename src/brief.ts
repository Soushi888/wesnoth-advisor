/**
 * Scenario intel straight from the add-on source.
 *
 * The campaign's `.cfg` files are the authority on turn limits, gold, recruit lists
 * and win/lose conditions. They are written with difficulty macros (`{TURNS 16 15 13}`)
 * and `#ifdef EASY/NORMAL/HARD` blocks, so this reads them against the difficulty the
 * save says is actually in play.
 */

import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { addonsDir } from "./paths";
import { readWmlFile, parseWml, child, children, clean, type WNode } from "./wml";

export type Difficulty = "EASY" | "NORMAL" | "HARD";

export const DIFFICULTY_INDEX: Record<Difficulty, number> = { EASY: 0, NORMAL: 1, HARD: 2 };

export interface SideBrief {
  side: number;
  name: string;
  leaderType: string;
  team: string;
  gold: string;
  income: string;
  recruits: string;
  controller: string;
}

export interface ScenarioBrief {
  file: string;
  id: string;
  name: string;
  nextScenario: string;
  turns: string;
  experienceModifier: string;
  sides: SideBrief[];
  objectives: { condition: string; text: string }[];
  drops: string;
  carryover: string;
  notableEvents: string[];
}

/** Finds a scenario `.cfg` by its id across every add-on scenario directory. */
export function findScenarioFile(scenarioId: string, addon = "Legend_of_the_Invincibles"): string {
  const root = join(addonsDir(), addon);
  if (!existsSync(root)) throw new Error(`Add-on not found at ${root}`);
  const dirs = readdirSync(root).filter((d) => d.startsWith("scenarios"));
  for (const d of dirs) {
    const dir = join(root, d);
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".cfg")) continue;
      const path = join(dir, f);
      const text = readFileSync(path, "utf8");
      if (new RegExp(`id\\s*=\\s*"?${escapeRe(scenarioId)}"?\\s*$`, "m").test(text)) return path;
    }
  }
  throw new Error(`No scenario file declares id=${scenarioId} under ${root}`);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Resolves `{MACRO a b c}` to the value for this difficulty, or shows all three. */
function pickDifficulty(values: string[], difficulty: Difficulty): string {
  if (values.length === 0) return "?";
  if (values.length === 1) return values[0]!;
  const idx = DIFFICULTY_INDEX[difficulty];
  const picked = values[Math.min(idx, values.length - 1)];
  return `${picked}  (easy/normal/hard: ${values.join(" / ")})`;
}

function macroArgs(text: string, macro: string): string[] | undefined {
  const m = new RegExp(`\\{${macro}\\s+([^}]*)\\}`).exec(text);
  if (!m) return undefined;
  return m[1]!.trim().split(/\s+/);
}

/**
 * Strips the `#ifdef` branches that do not apply, so the recruit list and friends
 * read the way the running game sees them.
 */
function applyIfdefs(text: string, difficulty: Difficulty): string {
  const lines = text.split("\n");
  const out: string[] = [];
  const stack: boolean[] = [];
  const active = () => stack.every(Boolean);
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("#ifdef ")) {
      const sym = t.slice(7).trim();
      stack.push(isDifficultySymbol(sym) ? sym === difficulty : true);
      continue;
    }
    if (t.startsWith("#ifndef ")) {
      const sym = t.slice(8).trim();
      stack.push(isDifficultySymbol(sym) ? sym !== difficulty : true);
      continue;
    }
    if (t === "#else") {
      if (stack.length) stack[stack.length - 1] = !stack[stack.length - 1];
      continue;
    }
    if (t === "#endif") {
      stack.pop();
      continue;
    }
    if (active()) out.push(line);
  }
  return out.join("\n");
}

function isDifficultySymbol(sym: string): boolean {
  return sym === "EASY" || sym === "NORMAL" || sym === "HARD";
}

export function briefScenario(scenarioId: string, difficulty: Difficulty, addon?: string): ScenarioBrief {
  const file = findScenarioFile(scenarioId, addon);
  const raw = readFileSync(file, "utf8");
  const resolved = applyIfdefs(raw, difficulty);
  const root = parseWml(resolved);
  const scenario = child(root, "scenario") ?? root;

  const turnsArgs = macroArgs(resolved, "TURNS");
  const dropsArgs = macroArgs(resolved, "DROPS");

  const sides: SideBrief[] = children(scenario, "side").map((s) => {
    const sideText = sliceSide(resolved, Number(s.attrs["side"] ?? 0));
    const gold = macroArgs(sideText, "GOLD");
    const income = macroArgs(sideText, "INCOME");
    return {
      side: Number(s.attrs["side"] ?? 0),
      name: clean(s.attrs["name"]) || s.attrs["id"] || "?",
      leaderType: clean(s.attrs["type"]),
      team: clean(s.attrs["user_team_name"]) || clean(s.attrs["team_name"]),
      gold: gold ? pickDifficulty(gold, difficulty) : (s.attrs["gold"] ?? "0"),
      income: income ? pickDifficulty(income, difficulty) : (s.attrs["income"] ?? "0"),
      recruits: s.attrs["recruit"] ?? "(none)",
      controller: s.attrs["controller"] ?? (s.attrs["canrecruit"] === "yes" ? "ai" : "?"),
    };
  });

  const objectives: { condition: string; text: string }[] = [];
  for (const ev of children(scenario, "event")) {
    for (const o of children(ev, "objectives")) {
      for (const obj of children(o, "objective")) {
        objectives.push({ condition: obj.attrs["condition"] ?? "?", text: clean(obj.attrs["description"]) });
      }
      const carry = child(o, "gold_carryover");
      if (carry) {
        objectives.push({
          condition: "carryover",
          text: `${carry.attrs["carryover_percentage"] ?? "?"}% of remaining gold carries over` +
            (carry.attrs["bonus"] === "yes" ? ", with an early-finish bonus" : ""),
        });
      }
    }
  }

  const notableEvents = collectNotableEvents(scenario);

  return {
    file,
    id: scenarioId,
    name: clean(scenario.attrs["name"]),
    nextScenario: scenario.attrs["next_scenario"] ?? "",
    turns: turnsArgs ? pickDifficulty(turnsArgs, difficulty) : (scenario.attrs["turns"] ?? "unlimited"),
    experienceModifier: scenario.attrs["experience_modifier"] ?? "100",
    sides,
    objectives,
    drops: dropsArgs ? `${dropsArgs[0]}% item drop, ${dropsArgs[1]}% gem drop, from side ${dropsArgs[dropsArgs.length - 1]}` : "(none declared)",
    carryover: "",
    notableEvents,
  };
}

/** The raw text of one `[side]` block, so its macro calls can be read in isolation. */
function sliceSide(text: string, side: number): string {
  const blocks = text.split("[side]").slice(1);
  for (const b of blocks) {
    const body = b.split("[/side]")[0] ?? "";
    if (new RegExp(`^\\s*side\\s*=\\s*${side}\\s*$`, "m").test(body)) return body;
  }
  return "";
}

/** Events worth knowing about before playing: side activation, unit joins, defeats. */
function collectNotableEvents(scenario: WNode): string[] {
  const out: string[] = [];
  for (const ev of children(scenario, "event")) {
    const name = ev.attrs["name"] ?? "";
    const bits: string[] = [];
    for (const ms of children(ev, "modify_side")) {
      bits.push(`side ${ms.attrs["side"]} becomes ${ms.attrs["controller"] ?? "modified"}`);
    }
    for (const mu of children(ev, "modify_unit")) {
      const f = child(mu, "filter");
      const who = f?.attrs["id"] ?? "a unit";
      if (mu.attrs["side"]) bits.push(`${who} joins side ${mu.attrs["side"]}`);
    }
    for (const el of children(ev, "endlevel")) {
      const f = child(ev, "filter");
      bits.push(`${el.attrs["result"]} when ${f?.attrs["id"] ?? name}`);
    }
    if (bits.length) out.push(`on ${name}: ${bits.join("; ")}`);
  }
  return out;
}

/** The difficulty the running game is set to, read from a savegame. */
export function difficultyFromSave(savePath: string): Difficulty {
  const root = parseWml(readWmlFile(savePath));
  const d = root.attrs["difficulty"] ?? child(root, "snapshot")?.attrs["difficulty"];
  if (d === "EASY" || d === "NORMAL" || d === "HARD") return d;
  return "NORMAL";
}
