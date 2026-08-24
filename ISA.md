---
name: wesnoth-advisor
principal_stated_goal: "I want you to be my adivsor so we do the game together ! We could even create a folder for flowing that with all the instruction, tools, hint, etc. you need to be a good advisor."
phase: complete
progress: 16/16
frozen: false
---

# Wesnoth Advisor

## Goal

A read-only toolkit that lets SoushAI advise Soushi turn by turn on Legend of the Invincibles (Battle for Wesnoth 1.18.8, Steam), grounded in the game's own files rather than in recall or a web guide.

## Vision

Soushi plays a turn and ends it. SoushAI runs one command, sees the exact board state, and answers "what should I do next turn" with real numbers: who can reach whom, what the odds are, what the time of day does to them. Over a campaign the kit accumulates scenario briefings and a decision log, so advice compounds instead of restarting each session.

## Out of Scope

- Playing the game. The tools never send input to Wesnoth; Soushi moves every unit himself.
- Modifying saves, add-ons, or any game state.
- Multiplayer, other campaigns (the kit should generalize, but only LotI is targeted).

## Claims

- [x] **C1 — Current state readable without arguments.** `bun run state` finds the newest save under the Wesnoth user dir and prints scenario id, turn N of M, current time of day, per-side gold and income, and every unit with side, level, type, name, HP, XP and hex.
  - *Evidence:* `bun src/cli.ts state` on Auto-Save1 printed `turn 1 / 15`, Efraim L1 28/28 at 30,3, matching the raw WML.
- [x] **C2 — The board renders.** `bun run state --map` prints an ASCII map of the live scenario with terrain classes and every unit at its true hex.
  - *Evidence:* `bun src/cli.ts map --no-colour` placed Redain at (27,1), Mario at (28,10), Efraim's keep glyph at (30,3), all matching the scenario source.
- [x] **C3 — Honest combat odds.** `bun run odds <attacker> <defender>` computes chance-to-hit, damage per strike and expected total damage both ways.
  - *Evidence:* hand-check on Delenia against Gromar, Auto-Save9. Save gives base damage 8 cold, 4 strikes; chaotic in Afternoon is 75, despair 40 subtracts to 35, backstab doubles to 70, orc cold resistance 100. Wesnoth `round_damage(8, 7000)` = 6, which is what the tool printed. Defence 40% on `Ke` and 30% on `Ce` match the orcishfoot and elusivefoot castle entries.
- [x] **C4 — Scenario intel from source.** `bun run brief <scenario-id>` reads the add-on's scenario `.cfg` and reports turn limit, starting gold, recruit lists, objectives, and drop settings for the difficulty in play.
  - *Evidence:* `bun src/cli.ts brief` printed 15 turns, 150 player gold, 200 enemy gold at NORMAL, matching `{TURNS 16 15 13}`, `{GOLD 150 150 120}` and `{GOLD 175 200 250}` in the source.
- [x] **C5 — Standing doctrine written down.** `DOCTRINE.md` holds the LotI-specific rules that outlive any single turn, each traced to the file it came from.
  - *Evidence:* `DOCTRINE.md`, every section citing a `CORE/` or `ADDON/` path or a named forum thread.
- [x] **C6 — Scenario 1 briefed.** `Briefings/01-an-orcish-assault.md` exists and every number in it is traceable.
  - *Evidence:* `Briefings/01-an-orcish-assault.md`, cross-checked against `bun run brief` output.

- [x] **C7 — A live dashboard runs with one command.** `bun run dash` serves a board companion on localhost that opens with no arguments and names the save it read.
  - *Evidence:* Chrome via Interceptor shows the header reading `LotI1-Shatter the Defilers-Auto-Save1 · 23:18:34 · NORMAL`, the same save and difficulty `bun run state` printed.
- [x] **C8 — The whole board is on screen.** The scenario map renders as hexes with terrain, villages, keeps and every unit at its true position, and clicking a hex reports its terrain classes and defence.
  - *Evidence:* 46x31 board drawn, 38 villages counted against the header's `25 / 38` held; clicking an empty hex reported `flat 40%, forest 30%` with the best-defence rule stated, matching `terrain.ts`.
- [x] **C9 — A unit's full sheet is one click away.** Selecting a unit shows HP, XP, moves, alignment, traits, items, abilities, every attack with damage and strikes, resistances, and its defence on the hex it stands on.
  - *Evidence:* Zurf's sheet in Chrome: L1 Troll Whelp, 44/48, chaotic at 75% damage in Morning, on `Gs^Fms` at 60% to be hit, traits strong and resilient, regenerates, fist 8x2 impact.
- [x] **C10 — Combat odds in the UI equal the CLI's.** Selecting an attacker then an enemy shows chance to hit, damage, kill probability and expected HP both ways, identical to `bun run odds`.
  - *Evidence:* Arcer against Zurf in the browser gave dagger 4x3 at 60%, fist 7x2 at 30%, expected 36.8 and 25.8; `bun run odds Arcer Zurf` printed the same four numbers.
- [x] **C11 — It follows the game turn by turn without being asked.** When Wesnoth writes a new save, the open page shows the new turn within a few seconds and keeps the current selection.
  - *Evidence:* server run against a scratch saves dir under `WESNOTH_USERDATA`; dropping Auto-Save18 next to Auto-Save13 moved the open page from turn 13 to turn 18 with no reload, ribbon reading `turn 13 → 18`. The real saves directory was never written to.
- [x] **C12 — Scenario intel is on the page.** Objectives, turn limit and turns remaining, per-side gold, income and village count, and the time-of-day track with what it does to each alignment.
  - *Evidence:* header `18 / 25`, `Morning, lawful +25% chaotic -25%`; side 1 reads 54 gold and +20 a turn, which is base 2 plus 25 villages less 7 upkeep, every constant read from `game_config.cfg`.
- [x] **C13 — It looks like the game.** The interface uses Wesnoth's own unit sprites read from the installed game and add-on, on a parchment-and-wood theme rather than default browser chrome.
  - *Evidence:* Interceptor pixel screenshots viewed: unit sprites in the roster, on the board and in the sheets, item icons on the carried chips, parchment sheets on dark wood.

## Anti-claims

- [x] **A1 — Nothing under `~/.local/share/wesnoth` or the Steam install is ever written.**
  - *Evidence:* `grep -rnE "writeFile|appendFile|rmSync|unlink|mkdir|createWriteStream|Bun\.write" src/` returns nothing.
- [x] **A2 — No hardcoded unit or terrain statistics.**
  - *Evidence:* `grep -rnE "(blade|pierce|impact|arcane)\s*[:=]\s*[0-9]+" src/` returns nothing. The only numeric literals in lookup paths are neutral fallbacks used when a table has no entry for a key: resistance defaults to 100 (no resistance) and defence to 50. Those are absence handling, not statistics.
- [x] **A3 — The advisor never claims a board fact it did not read from a save.**
  - *Evidence:* every board claim made to Soushi this session came from a named save file printed in the tool's own header line.

- [x] **A4 — The dashboard writes nothing and is reachable only from this machine.** It reads saves and game data, serves images from the two game roots only, binds to localhost, and holds no write path.
  - *Evidence:* the write grep over `src/` still returns nothing; `Bun.serve` is given `hostname: "127.0.0.1"` and every image path is resolved under a game root and rejected otherwise.

## Not yet specified

- Reachability: "which enemies can reach this hex next turn" would prevent most positioning mistakes, and needs a movement-cost flood fill over the map, which the movement tables already support.
- Whether a per-scenario plan file is worth keeping, or whether `CAMPAIGN.md` is enough.

## Decisions

- **The dashboard reuses the CLI's modules rather than reimplementing anything.** `src/dashboard.ts` only arranges what `save.ts`, `terrain.ts`, `odds.ts`, `items.ts` and `brief.ts` resolve, so a number on the page and the same number in the terminal cannot drift apart. The odds route reloads the board and calls `computeExchange`, the same call the CLI makes.
- **The server polls the saves directory rather than watching it.** Wesnoth writes a save by renaming over the path, which `fs.watch` misses on some filesystems. A stat every second and a half is cheap and never lies.
- **Item names come from `ADDON/utils/item_list.cfg`, worn items from the save itself.** The save spells out a worn item's name, a trait's description and an ability's description, so most of the interface's explanations are the game's own words. Only the bag needs the catalogue, because it stores nothing but a sort and a number.
- **Team-colour recolouring was skipped.** Wesnoth's sprites carry a magenta ramp the engine swaps per side, and reproducing that faithfully means reading its palette algorithm out of the C++ source. The dashboard draws the sprite as it ships and puts the side's colour in a ring around it instead.

- **Read the save first, fall back to the unit type.** Saves store units as deltas against their type, so a freshly recruited orc carries no attack, defence or resistance block at all. Discovered when three orcs read as level 0 with 0 maximum hit points. The reader now loads the installed type definitions and replays the unit's own traits and items over them.
- **Scenario `experience_modifier` scales the type's experience requirement before traits.** Verified against a unit whose save carried the resolved value: base 42, times 125% is 53, minus 20% for intelligent is 42, which is what the save says.
- **Standalone project, not a PAI skill.** Soushi chose this; it keeps game data out of the brain repo.
- **TypeScript on bun**, per the standing rule that anything persisting is typed.
- **Built inline rather than dispatched.** The modules are tightly coupled and each bug found in one changed the design of another; handing a slice to a subagent would have cost more in context transfer than it saved.

## Log

- External prerequisites probed: bun 1.3.14; Wesnoth 1.18.8 Steam install; user data at `~/.local/share/wesnoth/1.18`; LotI add-on 3.2.8b.
- Two real defects found and fixed during the build, both by comparing tool output against raw WML rather than by reasoning: sparse unit serialization (above), and unquoted WML values keeping their inline `#` comments, which silently broke every terrain alias declared as `string=Gt       # wmllint: ignore` and made the tool report 50% defence everywhere except castles.
- Second look: not elected. Read-only local tool, no auth surface, no publish path, and the falsifiers are direct hand-checks against the game's own files.
- Not committed. Changes are staged in git and left for Soushi to review, per the standing rule against unprompted commits outside a worktree.
