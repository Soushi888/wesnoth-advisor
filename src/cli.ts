#!/usr/bin/env bun
/** Command line entry point: `state`, `map`, `odds`, `brief`, `saves`. */

import { listSaves } from "./paths";
import { loadBoard, timeOnTurn, alignmentModifier, type Board, type Unit } from "./save";
import { renderBoard } from "./render";
import { computeExchange, hexAt } from "./odds";
import { defenceOn, hexInfo } from "./terrain";
import { briefScenario, difficultyFromSave } from "./brief";

const args = process.argv.slice(2);
const command = args[0] ?? "state";
const flags = new Set(args.filter((a) => a.startsWith("--")));
const positional = args.slice(1).filter((a) => !a.startsWith("--"));
const flagValue = (name: string): string | undefined => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};

function pct(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}

function unitLine(u: Unit, board: Board): string {
  const hex = u.onRecallList ? "recall" : `${u.x},${u.y}`;
  const terrain = u.onRecallList ? "" : ` ${hexInfo(hexAt(board, u.x, u.y)).code}`;
  const def = u.onRecallList ? "" : ` def ${defenceOn(hexAt(board, u.x, u.y), u.defence)}%`;
  const flags = [
    u.canRecruit ? "LEADER" : "",
    ...u.statuses.map((s) => s.toUpperCase()),
    ...u.items.slice(0, 3),
  ].filter(Boolean);
  return (
    `  s${u.side} L${u.level} ${u.type.padEnd(22).slice(0, 22)} ${u.name.padEnd(18).slice(0, 18)}` +
    ` ${String(u.hp).padStart(3)}/${String(u.maxHp).padEnd(3)} hp` +
    ` ${String(u.xp).padStart(3)}/${String(u.maxXp).padEnd(3)} xp` +
    ` mv${String(u.maxMoves).padStart(2)}` +
    ` @${hex.padEnd(7)}${terrain.padEnd(10)}${def.padEnd(9)} ${u.alignment.padEnd(8)}` +
    (flags.length ? ` [${flags.join(", ")}]` : "")
  );
}

function showState(board: Board) {
  if (board.betweenScenarios) {
    console.log(`save      ${board.save.name}  (${board.save.mtime.toLocaleString()})`);
    console.log("state     between scenarios: this save holds the carryover roster, not a board.");
    const gold = board.sides[0]?.gold ?? 0;
    const roster = board.units.filter((u) => u.type);
    console.log(`carryover gold ${gold}, ${roster.length} units on the recall list`);
    console.log("\nrecall list, best first");
    for (const u of roster.sort((a, b) => b.level - a.level || b.xp - a.xp)) {
      console.log(
        `  L${u.level} ${u.type.padEnd(22).slice(0, 22)} ${u.name.padEnd(18).slice(0, 18)}` +
          ` ${String(u.maxHp).padStart(3)} hp  ${String(u.xp).padStart(3)}/${String(u.maxXp).padEnd(3)} xp  ${u.alignment.padEnd(8)}` +
          (u.items.length ? ` [${u.items.join(", ")}]` : ""),
      );
    }
    console.log("\nStart the scenario in Wesnoth, then run this again for the board.");
    return;
  }
  const now = timeOnTurn(board, board.turn);
  console.log(`save      ${board.save.name}  (${board.save.mtime.toLocaleString()})`);
  console.log(`scenario  ${board.scenarioName} [${board.scenarioId}] -> ${board.nextScenario || "(end)"}`);
  console.log(
    `turn      ${board.turn}${board.turns ? ` / ${board.turns}` : ""}   time: ${now?.name ?? "?"} (lawful ${now && now.lawfulBonus >= 0 ? "+" : ""}${now?.lawfulBonus ?? 0}%)   xp modifier ${board.experienceModifier}%`,
  );

  console.log("\nupcoming turns");
  const horizon = board.turns ? Math.min(board.turns, board.turn + 7) : board.turn + 7;
  const row: string[] = [];
  for (let t = board.turn; t <= horizon; t++) {
    const tod = timeOnTurn(board, t);
    row.push(`T${t} ${tod?.name ?? "?"}${tod && tod.lawfulBonus !== 0 ? ` (${tod.lawfulBonus > 0 ? "+" : ""}${tod.lawfulBonus} lawful)` : ""}`);
  }
  console.log("  " + row.join("  |  "));

  console.log("\nsides");
  for (const s of board.sides) {
    const alive = board.units.filter((u) => u.side === s.side && !u.onRecallList).length;
    console.log(
      `  ${s.side}. ${(s.teamName || "?").padEnd(12)} ${s.controller.padEnd(7)} gold ${String(s.gold).padStart(4)}  income ${String(s.income).padStart(3)}  village gold ${s.villageGold}  on map ${alive}` +
        (s.recruits.length ? `\n      recruits: ${s.recruits.join(", ")}` : ""),
    );
  }

  const bySide = [...new Set(board.units.map((u) => u.side))].sort();
  for (const side of bySide) {
    const units = board.units
      .filter((u) => u.side === side)
      .sort((a, b) => Number(a.onRecallList) - Number(b.onRecallList) || b.level - a.level || b.xp - a.xp);
    if (!units.length) continue;
    console.log(`\nside ${side} units (${units.length})`);
    for (const u of units) console.log(unitLine(u, board));
  }

  if (board.itemStorage.length) {
    console.log(`\nitem storage (${board.itemStorage.length} unequipped)`);
    for (const it of board.itemStorage) console.log(`  ${it.sort} #${it.type}`);
  }
}

function findUnit(board: Board, needle: string): Unit {
  const lower = needle.toLowerCase();
  const hit =
    board.units.find((u) => u.id.toLowerCase() === lower) ??
    board.units.find((u) => u.name.toLowerCase() === lower) ??
    board.units.find((u) => u.name.toLowerCase().includes(lower)) ??
    board.units.find((u) => u.id.toLowerCase().includes(lower)) ??
    board.units.find((u) => u.type.toLowerCase().includes(lower));
  if (!hit) throw new Error(`No unit matching "${needle}". Run \`bun run state\` to see the roster.`);
  return hit;
}

function showOdds(board: Board) {
  if (positional.length < 2) {
    console.error("usage: bun run odds <attacker> <defender> [--backstab] [--from=x,y] [--attack=name] [--turn=N]");
    process.exit(1);
  }
  const attacker = findUnit(board, positional[0]!);
  const defender = findUnit(board, positional[1]!);
  const turn = flagValue("turn") ? Number(flagValue("turn")) : undefined;
  const fromRaw = flagValue("from")?.split(",").map(Number);
  const from: [number, number] | undefined =
    fromRaw && fromRaw.length === 2 && fromRaw.every(Number.isFinite) ? [fromRaw[0]!, fromRaw[1]!] : undefined;
  const ex = computeExchange(board, attacker, defender, {
    backstab: flags.has("--backstab"),
    attackName: flagValue("attack"),
    turn,
    from,
  });

  const t = ex.time;
  console.log(`${attacker.name} (${attacker.type}, ${attacker.hp}/${attacker.maxHp} hp, ${attacker.alignment})`);
  console.log(`  attacks ${defender.name} (${defender.type}, ${defender.hp}/${defender.maxHp} hp, ${defender.alignment})`);
  console.log(`  time of day: ${t?.name ?? "?"} — attacker damage x${(alignmentModifier(attacker.alignment, t?.lawfulBonus ?? 0) / 100).toFixed(2)}, defender x${(alignmentModifier(defender.alignment, t?.lawfulBonus ?? 0) / 100).toFixed(2)}`);
  console.log(`  attacker on ${ex.attackerHex}, defender on ${ex.defenderHex} (defence ${defenceOn(ex.defenderHex, defender.defence)}% to be hit)`);
  console.log("");
  const o = ex.offence;
  console.log(`  attack   ${o.attack.name} ${o.damage}x${o.strikes} ${o.attack.type} ${o.attack.range}, ${o.chanceToHit}% to hit${o.notes.length ? `  [${o.notes.join(", ")}]` : ""}`);
  if (ex.riposte) {
    const r = ex.riposte;
    console.log(`  riposte  ${r.attack.name} ${r.damage}x${r.strikes} ${r.attack.type} ${r.attack.range}, ${r.chanceToHit}% to hit${r.notes.length ? `  [${r.notes.join(", ")}]` : ""}`);
  } else {
    console.log("  riposte  none at this range");
  }
  console.log("");
  console.log(`  kill chance      ${pct(ex.chanceDefenderDies)}`);
  console.log(`  you die          ${pct(ex.chanceAttackerDies)}`);
  console.log(`  expected hp left ${defender.name}: ${ex.expectedDefenderHp.toFixed(1)}   ${attacker.name}: ${ex.expectedAttackerHp.toFixed(1)}`);
}

function showBrief(board: Board) {
  const id = positional[0] ?? board.scenarioId;
  const difficulty = difficultyFromSave(board.save.path);
  const b = briefScenario(id, difficulty);
  console.log(`${b.name} [${b.id}]   difficulty ${difficulty}`);
  console.log(`source    ${b.file}`);
  console.log(`turns     ${b.turns}`);
  console.log(`xp mod    ${b.experienceModifier}%   (higher means levelling is slower)`);
  console.log(`next      ${b.nextScenario || "(end of campaign)"}`);
  console.log(`drops     ${b.drops}`);
  console.log("\nsides");
  for (const s of b.sides) {
    console.log(`  ${s.side}. ${s.name} (${s.leaderType || "?"}) team ${s.team}`);
    console.log(`     gold ${s.gold}   income ${s.income}`);
    console.log(`     recruits: ${s.recruits}`);
  }
  console.log("\nobjectives");
  for (const o of b.objectives) console.log(`  [${o.condition}] ${o.text}`);
  if (b.notableEvents.length) {
    console.log("\nscripted events");
    for (const e of b.notableEvents) console.log(`  ${e}`);
  }
}

try {
  switch (command) {
    case "saves": {
      for (const s of listSaves().slice(0, 20)) {
        console.log(`${s.mtime.toISOString().slice(0, 16).replace("T", " ")}  ${s.isReplay ? "replay  " : "playable"}  ${s.name}`);
      }
      break;
    }
    case "state": {
      const board = loadBoard(flagValue("save"));
      showState(board);
      if (flags.has("--map")) {
        console.log("");
        console.log(renderBoard(board));
      }
      break;
    }
    case "map": {
      const board = loadBoard(flagValue("save"));
      const yr = flagValue("y")?.split("-").map(Number);
      const xr = flagValue("x")?.split("-").map(Number);
      console.log(renderBoard(board, {
        yRange: yr && yr.length === 2 ? [yr[0]!, yr[1]!] : undefined,
        xRange: xr && xr.length === 2 ? [xr[0]!, xr[1]!] : undefined,
        colour: !flags.has("--no-colour"),
      }));
      break;
    }
    case "odds": {
      showOdds(loadBoard(flagValue("save")));
      break;
    }
    case "brief": {
      showBrief(loadBoard(flagValue("save")));
      break;
    }
    default:
      console.error(`unknown command "${command}". Try: state | map | odds | brief | saves`);
      process.exit(1);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
