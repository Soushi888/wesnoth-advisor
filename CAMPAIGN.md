# Campaign log

Legend of the Invincibles, Part I: Embracing the Darkness. NORMAL. Add-on 3.2.8b, Wesnoth 1.18.8.

Entries are appended as scenarios are played. Keep them short: what happened, what it cost, what to do differently.

## Runs

**April 2025.** Reached scenario 05 Shatter the Defilers with 31 units and 216 gold, then stopped. That save chain is still intact and loadable. Recruit to recall ratio across four scenarios was 216 to 21, which is the main thing to change this time.

**23 August 2026.** Restarted from scenario 01.

## 01 An Orcish Assault

Briefing: `Briefings/01-an-orcish-assault.md`. Won on turn 13 of 15.

- Carried out: 208 gold, 15 units on the recall list. Mario joined as a loyal level 0 on Gromar's death, as the scenario scripts.
- Delenia did the work in the south while the main line held the centre with Mario and Redain's guards. Gromar died to her Twinkling Sword at his own keep.
- Efraim finished on 23 of 25 experience, two short of his first level. He was 17 hexes north of the last living enemy when the scenario ended, so there was no way to close it. Worth planning for next time: the author intends him to level in scenario 1.
- Items banked: armour #41, two mace #74, sword #113, helm #271, plus what Delenia and Efraim are carrying.

## 02 The Assassination

Briefing: `Briefings/02-the-assassination.md`.

Briefing: `Briefings/02-the-assassination.md`. Won, with one unit list intact and the rare item recovered.

- The scenario is a free deployment phase with a fight stapled on: side 2 shares your team name until someone steps into Redain's chamber. Nine units walked the whole castle at full health before a blow was struck.
- The recruit list in the scenario header is a lie. A start event bans Fencer, Spearman, Bowman and Heavy Infantryman and allows Footpad and Thug, so everything buyable is chaotic. Recruiting Fencers here was never an option.
- Redain's chance to hit Efraim and Delenia is invisibly forced to 20% for the whole scenario, which makes Delenia the safe trigger and Efraim safe to bring to the kill.
- Item work decided it. Virtual Void moved from Efraim to Delenia took her backstab from 20 to 30 per strike; Poison on Huwyn made the grind free. Efraim levelled to 2 and both Rogues gained.
- The Exterminator's Dagger at (21,1) was taken by killing Vinogyc with Delenia and Ynoc on one turn. It cannot be backstabbed in that corner and only two units fit beside him, so it needed Delenia specifically.
- Mario survived in the one-entrance hex at (9,9), corked from (8,8).
- **Hex adjacency was computed with the column parity inverted**, in the tool and by hand, which produced several confident and wrong claims about chokepoints and shelters. Fixed in `src/save.ts` with a regression test, and the rule is now in `DOCTRINE.md`.

## 03 Banished

Briefing: `Briefings/03-banished.md`. Planned before opening the scenario.

Won. Expensive: **nine units lost** across the scenario.

- The free phase worked exactly as planned. Twenty of thirty-two villages taken with nothing on the map able to interfere, and the trigger held off until turn 18.
- What the plan got wrong was the second half. Eight of the twelve remaining villages sat behind the trigger box, so the build-up had nothing left to give well before turn 18, and the extra turns bought about six gold each while the army sat still.
- Dead: Ynoc, Addreorer, Leoraeran, Evan, Meotharryn, Yrreddyn, Aeraent, Aran, Syry. Aeraent took Rherraent's Sword down with him and Aran took a Heathenbasher; neither came back to the bag, which is now a doctrine rule.
- Efraim reached level 3 and Delenia is at 80 of 113. Replacements were recruited, so the roster is nineteen, but it is much greener than it was.
- Read: a nine-unit loss for one boss is a bad trade in a campaign where equipment and advancements ride on the unit. The next scenario should be fought more defensively.

## 04 Paradise Lost

Briefing: `Briefings/04-paradise-lost.md`. Planned from the turn 1 board.

- Key call: three orc camps, thirty-three and thirty-four apart, cannot be done in sequence in twenty-five turns. Kill Grub Drung first because he has one movement point and sits thirteen away, take his keep as a central recruiting base, then split into two columns.
- Lethalia is a loss condition but the orcs are forced to 10% against her and two reinforcement events back her up before turn 8. Do not panic-march to save her.
