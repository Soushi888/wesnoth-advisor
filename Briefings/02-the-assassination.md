# 02 The Assassination

Legend of the Invincibles, Part I, at NORMAL. Numbers from `ADDON/scenarios1/02_The_Assassination.cfg` unless stated.

## The numbers

| | |
|---|---|
| Turn limit | 17 (20 easy, 13 hard), and running out is a **defeat**, not a draw |
| Scenario gold | 50 at NORMAL, but 208 carried over from scenario 1, and carryover is the larger of the two |
| Income | 0 |
| Your recruits | **Fencer and Thief only** |
| Lord Redain | General, 100 gold, +20 income, but `canrecruit=no`, so that gold buys him nothing |
| Drops | 30% item and 20% gem per side 2 kill, up from 20% in scenario 1 |
| Win | Kill Lord Redain, and only that: `victory_when_enemies_defeated=no` |
| Lose | Death of Efraim, death of Delenia, or turns running out |

## The one fact that shapes every decision

**It is night for the entire scenario, and it never changes.** The scenario declares a single `{SECOND_WATCH}` block rather than a cycling schedule, so `lawful_bonus` is fixed at -25 everywhere. The western area, x 1 to 21 and y 1 to 10, is a `{UNDERGROUND}` time area, which is also -25.

So for all 17 turns:

- Chaotic units swing at 125%: Delenia, every Thief, Huwyn the Rogue.
- Lawful units swing at 75%: every Fencer, Bowman, Spearman and Heavy Infantryman on the recall list.
- Efraim is neutral and unaffected.

Recruiting Fencers here is paying 16 gold for a unit that fights at three quarters strength for the whole scenario. Recruit Thieves at 13, recall the chaotic veterans, and leave the lawful half of the roster on the bench unless a specific job needs their hit points.

## Fog and shroud

Side 1 has `shroud=yes` and `fog=yes`. You cannot see the castle until you walk it, and the tools cannot either: a savegame only stores what your side has uncovered. Expect `bun run state` to show fewer enemies than exist.

## Approach

A `moveto` event fires when a side 1 unit reaches any of (2,5), (3,6), (3,7), (2,7), (1,7) or (1,6). That is Redain's chamber in the far west, and reaching it starts the confrontation. Everything before that is getting there through his castle.

Redain cannot recruit, so his garrison is whatever the scenario placed. Killing it is worth doing at a 30% drop rate, but the clock is a defeat condition, so do not let the grind cost the scenario.
