# Standing doctrine

Rules that outlive any single turn. Every one names where it came from, so a wrong rule can be traced and killed rather than argued about.

Paths below are relative to two roots: `CORE` = `~/.steam/debian-installation/steamapps/common/wesnoth/data`, `ADDON` = `~/.local/share/wesnoth/1.18/data/add-ons/Legend_of_the_Invincibles`.

## The campaign is about veterans, not armies

**Recall before you recruit.** In Legend of the Invincibles, equipment and AMLA advancements ride on the unit. A fresh level 1 recruit arrives naked; a recalled veteran arrives carrying its sword, its armour and every advancement it bought. Recruiting a new army each scenario throws away the only thing that compounds.

Source: the item system in `ADDON/utils/items.cfg`, and the measured shape of the April 2025 playthrough: 216 recruit commands against 21 recall commands across four scenarios, counted from the `[replay]` blocks of the saved replays.

**Protect anything that joins you and cannot be recruited.** Delenia, Mario, and every later story unit are irreplaceable in a way a Spearman is not.

Source: community guidance on r/wesnoth for this campaign, corroborated by `ADDON/scenarios1/01_An_Orcish_Assault.cfg`, where Mario transfers to side 1 on Gromar's death and cannot be recruited afterwards.

**Level the leaders, but do not let them eat every kill.** The author explicitly wants Efraim levelling early: the comment on his `experience=20` line reads "I need him to level-up right at the first scenario to show that he is an interesting unit."

Source: `ADDON/units/09_Fencer.cfg`.

## Resistances are the stat that scales

Damage output stops being the bottleneck early. What kills a LotI run is taking full damage from a type you never covered. The community optimisation thread targets roughly 70% on fire, cold and arcane and 60% on the physical types by midgame on medium difficulty.

Source: `forums.wesnoth.org/viewtopic.php?t=51238`. Treat the exact numbers as a target to verify against our own runs, not as gospel.

Resistances in a savegame read as damage-taken percentages, not resistance percentages: `blade=130` means the unit takes 130% of blade damage, which the game displays as -30%.

Source: the `[resistance]` blocks in `CORE/core/units.cfg` movetype definitions.

## Kills are the item economy

Each scenario declares its own drop rate with `{DROPS chance gem_chance weapons bosses enemies}`. Scenario 1 uses `{DROPS 20 20 (sword,sword,dagger,knife,mace,bow,spear) no 4}`: a 20% item drop and a 20% gem drop on every side 4 death, plus a guaranteed drop from the boss.

So the pace of a scenario is a real decision. Rushing the enemy leader ends it early and banks 80% carryover plus a finish bonus; grinding the horde first buys items and experience that carry for the whole campaign. In an item-driven campaign the grind usually wins, and it is the exact opposite of the right instinct in vanilla Wesnoth.

Source: `ADDON/utils/global_events.cfg` (`DROPS` and `DROPS_EXT` macros), and the `[gold_carryover]` block of each scenario.

## Free multipliers, in order of size

**Time of day is worth 50 percentage points of damage.** A lawful unit swings at 125% in Morning and Afternoon and 75% in First and Second Watch; a chaotic unit is the mirror; neutral units never care. That is a bigger swing than most items.

Source: the `[time]` blocks written into every savegame, carrying `lawful_bonus` of +25, 0 or -25.

**Terrain defence beats hit points.** An elusivefoot unit is hit 30% of the time in forest, hills, village or castle and 40% on flat. Standing one hex differently is worth more than ten hit points.

Source: the `elusivefoot` movetype in `CORE/core/units.cfg`.

**Backstab needs a partner directly opposite the target.** Delenia's sword doubles when an enemy of the target stands on the opposite hex. Plan the pair, do not hope for it.

Source: `WEAPON_SPECIAL_BACKSTAB` in `ADDON/units/Delly_start.cfg`.

**Auras stack into the damage multiplier additively.** Leadership adds, LotI's despair subtracts, and both land in the same multiplier as time of day. Gromar's despair at 40 means a chaotic unit attacking him in the Afternoon swings at 75 minus 40, which is 35% of base.

Source: `ABILITY_DESPAIR` in `ADDON/utils/abilities.cfg`, applied by `odds` in this repo.

## Items are a system, not a pile of loot

**The bag is always open.** Shift+I on any of your units, any turn, anywhere on the map. No keep, no village, no start-of-scenario window. There is no reason to ever be carrying unused items, so equip on turn 1 and again after every drop.

Source: the item menu's only condition in `ADDON/utils/global_events.cfg` is that one of your units is standing there.

**Armour makes you take less damage, it does not make you harder to hit.** An item's defence rating cuts blade and pierce damage by that percentage, and impact damage by about half that much, because hammers were always better at getting through plate. Fire, cold and arcane go straight through it untouched. Two pieces rated 10 stack to roughly a fifth off blade and pierce.

So armour is worthless against a mage. Before deciding who wears the plate, ask what is actually going to kill that unit. If the answer is a fireball, give the plate to someone else.

Source: `ADDON/lua/stats.lua`, lines 134 and 308 to 310. Note that a separate dodge rating, which some items carry, is the one that changes your chance to be hit.

**Some weapons replace your damage, others add to it.** A weapon rated 20 overwrites what you had: on a four-strike attack it comes out as 8 per strike, whatever you were swinging before. A weapon that says plus 3 adds to your existing base instead. A helm or a ring that adds damage puts it on your melee weapon, not on everything you own.

That is why Delenia's Twinkling Sword reads 8x4 and Efraim's Sword of Krux reads 7x4 on a saber that started at 4x4.

Source: `ADDON/utils/item_list.cfg` compared against the resolved attacks in the savegame.

**A weapon can have its own alignment, and it beats the unit's.** Efraim is neutral, but his sword fights as a lawful unit and his shadow wave fights as a chaotic one. At night that is a fifty point spread between his two attacks. Check the specials on an attack before assuming time of day does not apply to a neutral unit.

Source: the specials on each item in `ADDON/utils/item_list.cfg`, shown by `bun run odds` in the square brackets after the weapon.

**A glowing item is a curse at night.** Anything granting illuminates pushes every neighbouring hex twenty five points toward daylight. In a scenario locked at night that erases the entire bonus your chaotic army is fighting on and hands the lawful enemy its own back. The item is not bad, it is in the wrong scenario. Leave it in the bag until the map has a daylight schedule.

Source: `ABILITY_ILLUMINATES_LOTI` in `ADDON/utils/abilities.cfg`, which is core illuminates at value 25.

## Check whether the enemy is actually your enemy

Several LotI scenarios open with the garrison on your own team and only turn hostile when a scripted event fires, usually when you walk somewhere specific. While that lasts you cannot be attacked, you can walk straight through their units, and you get to pick the turn the war starts. That is a free deployment phase and it is worth more than anything you can buy with the scenario's gold.

Check it before planning: `bun run map` prints `hostile sides` on its last line, and it will say `none` when the truce is on.

Source: `ADDON/scenarios1/02_The_Assassination.cfg`, where side 2 shares your team name until you step into Redain's chamber.

## Losing conditions are geography

Several scenarios make an ally's death a defeat. That turns a friendly leader standing in the open into a liability you have to defend, not an asset. Read the `[event] name=last breath` blocks before planning a defensive line, which is what `bun run brief` prints under "scripted events".

Source: `ADDON/scenarios1/*.cfg`.

## How to use the tools

- `bun run state` after ending a turn. It reads the newest non-replay save on its own.
- `bun run map -- --y=4-14` to see the front without scrolling the whole board.
- `bun run odds <attacker> <defender> [--backstab] [--turn=N]` before committing to a fight. The `--turn` flag answers "is this better tomorrow", because it recomputes the time of day.
- `bun run brief` before starting any scenario, and again if something surprising happens.
