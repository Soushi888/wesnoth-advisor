# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A read-only advisory toolkit for a live Battle for Wesnoth 1.18.8 playthrough of the Legend of the Invincibles add-on. It reads the newest savegame plus the installed game and add-on `.cfg` files and answers questions about the board. Soushi plays every turn himself; the tools never write to the game, never send input to it, and never modify a save.

The repo is both a tool and a campaign record: `ISA.md` is what done means (claims plus falsifiers), `DOCTRINE.md` is standing campaign doctrine with every rule traced to a source file, `Briefings/` is one file per scenario, `CAMPAIGN.md` is the running log.

## Commands

```bash
bun run state                    # newest save: scenario, turn, time of day, sides, every unit
bun run state -- --map           # same, with the ASCII board underneath
bun run map -- --y=4-14 --x=0-30 # a window of the board; --no-colour for piped output
bun run odds Delenia Gromar      # full exchange: hit chance, damage, kill probability both ways
bun run odds Efraim Grunt -- --backstab --turn=11 --from=12,7 --attack=sword
bun run brief                    # current scenario decoded from add-on source at the save's difficulty
bun run saves                    # saves, newest first, replays flagged
bun run dash                     # live browser dashboard on 127.0.0.1:4180, follows the game turn by turn
bun run typecheck                # tsc --noEmit for src, then for web
```

Any command takes `--save=<name-or-path>` to pick a save other than the newest playable one. Unit arguments resolve by exact id, then exact name, then substring of name, id, or type. There is no test suite: verification is hand-checking tool output against the raw WML, which is how both real defects so far were found.

Game locations are auto-detected and overridable with `WESNOTH_USERDATA` and `WESNOTH_CORE` (see `src/paths.ts`).

## Architecture

One data flow, bottom up:

`wml.ts` is a hand-written character-scanning WML parser. It is deliberately not a line splitter (savegames carry multi-line quoted `map_data`), and it does not expand the preprocessor: `{MACRO}` calls and `#ifdef` lines are kept in `WNode.raw` so `brief.ts` can read them as text. Values handle `_"..."` translatables, `""` escapes, `+` continuations, `[+tag]` merges, `key1,key2=v1,v2` pairs, and inline `#` comments on unquoted values.

`paths.ts` locates the Steam core data, the versioned user data dir, and the newest **non-replay** save (Wesnoth writes a replay at scenario end that would otherwise shadow the live autosave).

`unittypes.ts` indexes every `[unit_type]` and `[movetype]` from core plus every add-on `units/` tree, and resolves a type by merging movetype tables under `[base_unit]` inheritance under the type's own overrides.

`save.ts` turns a save into a `Board`. The load-bearing fact: **a savegame stores each unit as a delta against its unit type**, so a freshly recruited unit has no `[attack]`, `[defense]` or `[resistance]` block at all. `readUnit` falls back to the type baseline and replays the unit's `[trait]`, `[object]` and `[advancement]` effects over it, the way the engine does. Also owns hex adjacency (odd-q offset), the time-of-day schedule, and alignment multipliers.

`terrain.ts` resolves a hex code (`Gg^Vh`, `Re^Gvs`) through `core/terrain.cfg` alias chains to base defence classes. Wesnoth's composite rule: **best defence, worst movement cost** among the resolved classes.

`odds.ts` resolves an exchange exactly, not by estimate. It enumerates the alternating strike sequence and walks the full memoised probability tree, so a defender that dies mid-combat stops retaliating. Damage uses Wesnoth's own `round_damage` rounding with alignment, backstab, charge, slow and adjacent auras folded into one multiplier. Leadership and LotI's despair are both `[leadership]` nodes and are resolved by the same code path.

`brief.ts` reads the scenario `.cfg` straight from the add-on, strips the `#ifdef EASY/NORMAL/HARD` branches that do not apply, and picks the right slot out of difficulty macros like `{TURNS 16 15 13}`. Difficulty comes from the save, not from a flag.

`items.ts` indexes LotI's `utils/item_list.cfg` by item number, which is the only way to name what sits in the bag: `item_storage` stores a sort and a number and nothing else. A worn item is different, because the save spells out its name in the unit's `[object]` block.

`gameconfig.ts` reads `data/game_config.cfg` for the engine's constants (base income, village support, poison amount, recall cost), so the upkeep and income arithmetic on screen is read rather than remembered.

`render.ts` draws the ASCII board. `cli.ts` is the only entry point and the only place that formats terminal output.

`dashboard.ts` and `server.ts` are the browser companion. `dashboard.ts` builds one JSON snapshot per save by arranging what the modules above resolve, and computes nothing of its own; `server.ts` serves that snapshot, an odds route that calls the same `computeExchange` the CLI calls, unit sprites and item icons read out of the game trees, and a server-sent event stream. It polls the saves directory every 1.5s because Wesnoth writes a save as a rename over the path, which `fs.watch` misses. The client is `web/app.ts`, plain TypeScript bundled on demand by `Bun.build`, with its own tsconfig so it typechecks against DOM types.

## Constraints that must hold

- **Read-only.** This includes the server: it binds to `127.0.0.1`, every route reads, and image paths are resolved under a game root or refused. No `writeFile`, `mkdir`, `unlink` or `Bun.write` anywhere under `src/`, and nothing under the Wesnoth user dir or the Steam install is touched. `ISA.md` anti-claim A1 is the falsifier.
- **No hardcoded unit or terrain statistics.** Every number comes from the save, the type definitions, `terrain.cfg` or the scenario source. The only numeric literals in lookup paths are absence fallbacks (resistance 100, defence 50%). If the add-on updates, the numbers follow.
- **Never state a board fact that did not come from a named save.** Print the save name in the header of anything that reports state.
- Strict TypeScript with `noUncheckedIndexedAccess`; index access needs `!` or a guard.

## Working in this repo

When a claim about the game turns out to be wrong, fix the rule where it lives and cite the file it came from: `DOCTRINE.md` for standing rules, the scenario's `Briefings/` file for scenario numbers, `CAMPAIGN.md` for what actually happened. Doctrine entries carry a `CORE/` or `ADDON/` path, not a memory.

`ISA.md` is the state of record. Its "Not yet specified" section is the real backlog: reachability flood fill over the movement tables is the open one.
