/**
 * The engine's own constants, read from `data/game_config.cfg` rather than assumed:
 * base income, what a village supports, poison and resting amounts, recall cost.
 * Upkeep and income arithmetic depends on these, and a campaign can change them.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { coreDataDir } from "./paths";
import { parseWml, child, num } from "./wml";

export interface GameConfig {
  baseIncome: number;
  villageIncome: number;
  /** Levels of upkeep each held village pays for. */
  villageSupport: number;
  poisonAmount: number;
  restHealAmount: number;
  recallCost: number;
  killExperience: number;
}

let cache: GameConfig | null = null;

export function gameConfig(): GameConfig {
  if (cache) return cache;
  const root = parseWml(readFileSync(join(coreDataDir(), "game_config.cfg"), "utf8"));
  const g = child(root, "game_config");
  if (!g) throw new Error("game_config.cfg carries no [game_config] block");
  cache = {
    baseIncome: num(g, "base_income", 2),
    villageIncome: num(g, "village_income", 1),
    villageSupport: num(g, "village_support", 1),
    poisonAmount: num(g, "poison_amount", 8),
    restHealAmount: num(g, "rest_heal_amount", 2),
    recallCost: num(g, "recall_cost", 20),
    killExperience: num(g, "kill_experience", 8),
  };
  return cache;
}
