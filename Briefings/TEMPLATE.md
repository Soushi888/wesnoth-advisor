# Briefing template

The shape every scenario briefing in this folder follows, settled after 03 Banished. Copy it, fill it, delete the guidance in italics.

Two standing rules for the whole document. **Player voice, not source voice**: no file paths, no WML tag names, no macro names, no lua line numbers. Say what the game does, not where the game says it. **Every number read, never inferred**: numbers come off the live turn 1 board, the scenario file or the map, and anything not yet knowable goes in the last section rather than into a hedge in the middle of a table.

---

# NN Scenario Name

*One line: campaign, part, difficulty, and exactly where the numbers came from, naming the save.*

## The shape of it

*Three or four sentences. What kind of scenario is this really, underneath the objective text. A brawl, a build-up, a race, a rescue. If there is one structural fact that makes it not what it looks like, it goes here and nowhere else.*

## The one number that drives every decision

*Optional, but include it whenever there is one. A single quantity the whole plan turns on: enemy gold per turn after a trigger, turns of travel against turns remaining, a hit chance that is secretly forced. If no such number exists, cut the section rather than padding it.*

## Numbers

*A table, one row per hard fact. Turn limit, your gold, your recruit list with costs, each enemy leader with hit points and position, drop rates, carryover percentage, win condition, loss conditions. Bold anything that differs sharply from the previous scenario.*

## Who is on the map

*Order of battle. A table of every enemy: name, type, hit points, hex, and one column of whatever matters most on this map (exits from their hex, movement, whether they can recruit). Then a line on resistances and a line on alignment. Say explicitly whether the list is complete or whether shroud is hiding something.*

## Time of day

*The schedule, which turns are daylight, and which half of your army each turn favours. Always state the enemy's alignment here, because that is what decides whether daylight helps you.*

## The ground

*Map size, dominant terrain, and your core units' chance to be hit on it. Then the features that decide the plan: chokepoints, keeps, villages, dead ends usable as shelters, terrain to avoid. Every hex reference computed, never eyeballed.*

## Your gear

*What each unit carries now, what is unequipped, and where each loose item should go with the resulting number, not the item's advertised rating. Call out any item that is actively harmful on this map.*

## What there is to loot

*Drop rates, guaranteed boss drops, fixed treasure on the map, and an honest estimate of the total haul. Say plainly when a scenario is not worth farming.*

## Who to bring

*Field and bench, with the reason. Upkeep arithmetic: how much income the fielded army costs against how many villages.*

## Opening budget

*Gold in hand, what it buys, and the order to spend it. Recall against recruit, with the reason for this scenario specifically.*

## The plan

*Numbered phases against turn ranges. Each phase says what moves where and what condition ends it. Name the turn the assault should land on and why.*

## What will actually hurt you

*Ranked. Each threat gets a measured number: a kill chance, a damage figure, a distance in turns. No threat without a number.*

## If it goes wrong

*The cheapest acceptable outcome and the trigger for taking it.*

## Still unverified

*Everything assumed rather than read, each with the probe that would settle it. Never leave an assumption anywhere else in the document.*
