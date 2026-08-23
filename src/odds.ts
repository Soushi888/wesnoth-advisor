/**
 * Combat resolution.
 *
 * Every number here comes from the savegame: the attack lists, the defence and
 * resistance tables Wesnoth already resolved for each unit including traits and
 * equipped items, and the scenario's own time-of-day schedule. Nothing is hardcoded.
 *
 * The engine resolves the exchange exactly rather than estimating: it enumerates the
 * strike sequence and walks the full probability tree, so "chance to kill" accounts
 * for a defender dying mid-combat and never landing its remaining strikes.
 */

import { alignmentModifier, hexCode, neighbours, type Attack, type Board, type TimeOfDay, type Unit } from "./save";
import { defenceOn } from "./terrain";

/**
 * Damage modifier projected onto a unit by adjacent units' aura abilities:
 * vanilla leadership (a bonus from allies) and LotI's despair (a penalty from
 * enemies) are both `[leadership]` nodes and are resolved the same way.
 */
export function auraModifier(board: Board, unit: Unit): { percent: number; sources: string[] } {
  const playerTeamOf = (side: number) => board.sides.find((s) => s.side === side)?.teamName ?? String(side);
  const myTeam = playerTeamOf(unit.side);
  let cumulative = 0;
  let best = 0;
  const sources: string[] = [];
  for (const other of neighbours(board, unit.x, unit.y)) {
    if (other.id === unit.id) continue;
    const sameTeam = playerTeamOf(other.side) === myTeam;
    for (const aura of other.auras) {
      if (aura.tag !== "leadership") continue;
      const applies = sameTeam ? aura.affectAllies : aura.affectEnemies;
      if (!applies) continue;
      // Vanilla leadership only lifts units of a lower level than the leader.
      if (sameTeam && aura.id === "leadership" && unit.level >= other.level) continue;
      sources.push(`${other.name}: ${aura.id} ${aura.value > 0 ? "+" : ""}${aura.value}%`);
      if (aura.cumulative) cumulative += aura.value;
      else best = aura.value < 0 ? Math.min(best, aura.value) : Math.max(best, aura.value);
    }
  }
  return { percent: cumulative + best, sources };
}

export interface StrikeProfile {
  attack: Attack;
  /** Percent chance each strike lands. */
  chanceToHit: number;
  /** Damage a landed strike deals. */
  damage: number;
  strikes: number;
  notes: string[];
}

export interface Exchange {
  attacker: Unit;
  defender: Unit;
  attackerHex: string;
  defenderHex: string;
  time: TimeOfDay | undefined;
  offence: StrikeProfile;
  riposte: StrikeProfile | undefined;
  /** Probability the defender ends the exchange dead. */
  chanceDefenderDies: number;
  /** Probability the attacker ends the exchange dead. */
  chanceAttackerDies: number;
  expectedDefenderHp: number;
  expectedAttackerHp: number;
}

/** Wesnoth's damage rounding: `round_damage` in attack_type. */
function roundDamage(base: number, bonus: number, divisor = 10000): number {
  if (base === 0) return 0;
  const rounding = divisor / 2 - ((base * bonus) % divisor >= divisor / 2 ? 0 : 1);
  return Math.max(1, Math.floor((base * bonus + rounding) / divisor));
}

function has(list: string[], special: string): boolean {
  return list.some((s) => s.toLowerCase().includes(special));
}

/** Picks the attack that maximises expected damage against this defender. */
export function bestAttack(attacker: Unit, defender: Unit, defenderDefence: number, lawfulBonus: number, range?: string): Attack | undefined {
  const usable = attacker.attacks.filter((a) => (range ? a.range === range : true));
  let best: Attack | undefined;
  let bestScore = -1;
  for (const a of usable) {
    const dmg = strikeDamage(a, attacker, defender, lawfulBonus, false);
    const score = (dmg * a.number * Math.min(100, Math.max(0, defenderDefence + a.accuracy))) / 100;
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}

function strikeDamage(attack: Attack, attacker: Unit, defender: Unit, lawfulBonus: number, backstab: boolean, auraPercent = 0): number {
  const align = alignmentModifier(attacker.alignment, lawfulBonus) + auraPercent;
  const resist = defender.resistance[attack.type] ?? 100;
  let multiplier = align;
  if (backstab && has(attack.specials, "backstab")) multiplier *= 2;
  if (has(attack.specials, "charge")) multiplier *= 2;
  if (attacker.statuses.includes("slowed")) multiplier = Math.floor(multiplier / 2);
  return roundDamage(attack.damage, multiplier * resist);
}

function chanceToHit(attack: Attack, defenderDefence: number, defender: Unit): number {
  let cth = defenderDefence;
  if (has(attack.specials, "magical")) cth = 70;
  if (has(attack.specials, "marksman")) cth = Math.max(cth, 60);
  cth += attack.accuracy;
  const parry = Math.max(0, ...defender.attacks.map((a) => a.parry), 0);
  cth -= parry;
  return Math.min(100, Math.max(0, cth));
}

function profile(
  attack: Attack | undefined,
  attacker: Unit,
  defender: Unit,
  defenderDefence: number,
  lawfulBonus: number,
  backstab: boolean,
  auraPercent: number,
  auraSources: string[],
): StrikeProfile | undefined {
  if (!attack) return undefined;
  const notes: string[] = [];
  if (attack.specials.length) notes.push(...attack.specials);
  if (auraPercent !== 0) notes.push(`aura ${auraPercent > 0 ? "+" : ""}${auraPercent}% from ${auraSources.join(", ")}`);
  if (attacker.statuses.includes("slowed")) notes.push("attacker is slowed (half damage, one fewer strike)");
  const strikes = Math.max(1, attacker.statuses.includes("slowed") ? attack.number - 1 : attack.number);
  return {
    attack,
    chanceToHit: chanceToHit(attack, defenderDefence, defender),
    damage: strikeDamage(attack, attacker, defender, lawfulBonus, backstab, auraPercent),
    strikes,
    notes,
  };
}

/** The alternating strike sequence: true = attacker's strike. */
function strikeOrder(aStrikes: number, dStrikes: number, defenderFirst: boolean): boolean[] {
  const seq: boolean[] = [];
  let a = aStrikes;
  let d = dStrikes;
  let attackerTurn = !defenderFirst;
  while (a > 0 || d > 0) {
    if (attackerTurn && a > 0) {
      seq.push(true);
      a--;
    } else if (!attackerTurn && d > 0) {
      seq.push(false);
      d--;
    } else if (a > 0) {
      seq.push(true);
      a--;
    } else {
      seq.push(false);
      d--;
    }
    attackerTurn = !attackerTurn;
  }
  return seq;
}

interface Outcome {
  pDefenderDead: number;
  pAttackerDead: number;
  expDefenderHp: number;
  expAttackerHp: number;
}

/** Walks the full probability tree over the strike sequence. */
function resolve(seq: boolean[], hpA: number, hpD: number, off: StrikeProfile, rip: StrikeProfile | undefined): Outcome {
  const memo = new Map<string, Outcome>();

  const walk = (i: number, a: number, d: number): Outcome => {
    if (a <= 0 || d <= 0 || i >= seq.length) {
      return {
        pDefenderDead: d <= 0 ? 1 : 0,
        pAttackerDead: a <= 0 ? 1 : 0,
        expDefenderHp: Math.max(0, d),
        expAttackerHp: Math.max(0, a),
      };
    }
    const key = `${i}:${a}:${d}`;
    const cached = memo.get(key);
    if (cached) return cached;

    const attackerStrikes = seq[i]!;
    const p = attackerStrikes ? off.chanceToHit / 100 : (rip?.chanceToHit ?? 0) / 100;
    const dmg = attackerStrikes ? off.damage : (rip?.damage ?? 0);

    const hit = attackerStrikes ? walk(i + 1, a, d - dmg) : walk(i + 1, a - dmg, d);
    const miss = walk(i + 1, a, d);

    const out: Outcome = {
      pDefenderDead: p * hit.pDefenderDead + (1 - p) * miss.pDefenderDead,
      pAttackerDead: p * hit.pAttackerDead + (1 - p) * miss.pAttackerDead,
      expDefenderHp: p * hit.expDefenderHp + (1 - p) * miss.expDefenderHp,
      expAttackerHp: p * hit.expAttackerHp + (1 - p) * miss.expAttackerHp,
    };
    memo.set(key, out);
    return out;
  };

  return walk(0, hpA, hpD);
}

export interface ExchangeOptions {
  /** Assume a friendly unit stands opposite the defender, enabling backstab. */
  backstab?: boolean;
  /** Force a specific attack by name instead of the best one. */
  attackName?: string;
  /** Evaluate as if it were this turn rather than the save's current turn. */
  turn?: number;
  /** Evaluate as if the attacker had already moved to this hex. */
  from?: [number, number];
}

export function computeExchange(board: Board, defenderAttacker: Unit, defender: Unit, opts: ExchangeOptions = {}): Exchange {
  // Planning a move: evaluate the fight from the hex the attacker would stand on.
  const attacker = opts.from ? { ...defenderAttacker, x: opts.from[0], y: opts.from[1] } : defenderAttacker;
  const board2 = opts.from
    ? { ...board, units: board.units.map((u) => (u.id === attacker.id ? attacker : u)) }
    : board;
  board = board2;
  const time = timeFor(board, opts.turn ?? board.turn);
  const lawfulBonus = time?.lawfulBonus ?? 0;

  const attackerHex = hexAt(board, attacker.x, attacker.y);
  const defenderHex = hexAt(board, defender.x, defender.y);
  const defenderDefence = defenceOn(defenderHex, defender.defence);
  const attackerDefence = defenceOn(attackerHex, attacker.defence);

  let chosen = opts.attackName
    ? attacker.attacks.find((a) => a.name.toLowerCase().includes(opts.attackName!.toLowerCase()))
    : undefined;
  chosen ??= bestAttack(attacker, defender, defenderDefence, lawfulBonus);

  const attackerAura = auraModifier(board, attacker);
  const defenderAura = auraModifier(board, defender);

  const off = profile(chosen, attacker, defender, defenderDefence, lawfulBonus, opts.backstab ?? false, attackerAura.percent, attackerAura.sources);
  const counter = chosen ? bestAttack(defender, attacker, attackerDefence, lawfulBonus, chosen.range) : undefined;
  const rip = profile(counter, defender, attacker, attackerDefence, lawfulBonus, false, defenderAura.percent, defenderAura.sources);

  const defenderFirst = !!(counter && has(counter.specials, "firststrike") && !(chosen && has(chosen.specials, "firststrike")));
  const seq = strikeOrder(off?.strikes ?? 0, rip?.strikes ?? 0, defenderFirst);
  const outcome = off
    ? resolve(seq, attacker.hp, defender.hp, off, rip)
    : { pDefenderDead: 0, pAttackerDead: 0, expDefenderHp: defender.hp, expAttackerHp: attacker.hp };

  return {
    attacker,
    defender,
    attackerHex,
    defenderHex,
    time,
    offence: off!,
    riposte: rip,
    chanceDefenderDies: outcome.pDefenderDead,
    chanceAttackerDies: outcome.pAttackerDead,
    expectedDefenderHp: outcome.expDefenderHp,
    expectedAttackerHp: outcome.expAttackerHp,
  };
}

export function hexAt(board: Board, x: number, y: number): string {
  const cell = board.map[y]?.[x];
  return cell ? hexCode(cell) : "Gg";
}

function timeFor(board: Board, turn: number): TimeOfDay | undefined {
  if (board.schedule.length === 0) return undefined;
  const len = board.schedule.length;
  const idx = (((board.currentTimeIndex + (turn - board.turn)) % len) + len) % len;
  return board.schedule[idx];
}
