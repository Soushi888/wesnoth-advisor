# 01 An Orcish Assault

Legend of the Invincibles, Part I, at NORMAL. Every number below comes from `ADDON/scenarios1/01_An_Orcish_Assault.cfg` or from a savegame, and `bun run brief 01_An_Orcish_Assault` reprints the machine-readable half.

## The numbers

| | |
|---|---|
| Turn limit | 15 (16 easy, 13 hard) |
| Your gold | 150 (120 on hard) |
| Village gold | 1 each |
| Experience modifier | 125%, so every unit needs a quarter more experience than usual |
| Gromar's gold | 200, plus 2 per turn (175/+1 easy, 250/+3 hard) |
| Gromar's recruits | Orcish Grunt, Wolf Rider, Orcish Archer, Troll Whelp |
| Your recruits | Fencer, Thief, Spearman, Bowman, Heavy Infantryman, Rogue (no Rogue on hard) |
| Drops | 20% item and 20% gem per orc killed, plus a guaranteed drop from Gromar |
| Carryover | 80% of unspent gold, with an early-finish bonus |
| Win | Defeat Gromar |
| Lose | Death of Efraim, **or** Delenia, **or** Lord Redain |

## The map

Ogira, 38 by 27 playable hexes. Four keeps: yours at (30,3), Lord Redain's at (27,1), Mario's at (28,10), Gromar's at (27,25). The northern half is open grass, dirt and road with a castle belt around the keeps; everything south of about y=20 is dense forest. The orcs come north up the middle, roughly the x=24 to x=30 corridor.

## Three things the interface does not tell you

**Mario cannot be hit by orcs.** The scenario declares `{FORCE_CHANCE_TO_HIT side=4 id=Mario 0 ()}`, which forces any side 4 unit attacking Mario to a 0% chance to hit. He is a permanently safe blocker on the castle at (28,10). The protection covers orcs attacking him; it does not cover retaliation when Mario attacks first, and he is AI-controlled with `aggression=0.3` and `passive_leader=yes`, so he mostly stays put. When Gromar dies, Mario transfers to side 1 as a loyal unit.

**Lord Redain's side is asleep until the orcs come to him.** Side 3 starts `controller=null`. A `moveto` event flips it to AI the moment any side 4 unit moves within 6 hexes of (27,1). His three Royal Guards are guardians: 81, 81 and 74 hit points at level 3, and they will not advance until then. Waking them up gains you three strong allies, but it also puts a 55 hit point General whose death loses the scenario into the fighting.

**Efraim is meant to level here.** He needs 25 experience with the scenario modifier applied. The author's comment on his unit file says so outright. Give him the finishing blows he can take safely.

## Time of day

Default schedule, starting at Dawn on turn 1. Every orc in the scenario is chaotic, and so are Delenia, Thief and Rogue. Fencer, Spearman, Bowman and Heavy Infantryman are lawful. Efraim is neutral and never cares.

| Turn | Time | Lawful |
|---|---|---|
| 1 | Dawn | 0 |
| 2, 3 | Morning, Afternoon | +25 |
| 4 | Dusk | 0 |
| 5, 6 | First Watch, Second Watch | -25 |
| 7 | Dawn | 0 |
| 8, 9 | Morning, Afternoon | +25 |
| 10 | Dusk | 0 |
| 11, 12 | First Watch, Second Watch | -25 |
| 13 | Dawn | 0 |
| 14, 15 | Morning, Afternoon | +25 |

Push with the human line on turns 2, 3, 8, 9, 14 and 15. Hold ground on 5, 6, 11 and 12, and let Delenia and the outlaws do the night work.

## Gromar

Level 2 Orcish Warrior, 58 hit points, greatsword 10 by 3 blade, and a despair aura of 40 that cuts the damage of every adjacent enemy by 40 percentage points. That aura lands in the same multiplier as time of day, so a chaotic unit hitting him in the Afternoon swings at 35% of base. Bring lawful units and daylight, or ranged attacks from a hex that is not adjacent.
