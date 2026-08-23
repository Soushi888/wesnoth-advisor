/** Locating the installed game, the user data dir, and the newest save. */

import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HOME = homedir();

const CORE_CANDIDATES = [
  join(HOME, ".steam/debian-installation/steamapps/common/wesnoth/data"),
  join(HOME, ".steam/steam/steamapps/common/wesnoth/data"),
  join(HOME, ".local/share/Steam/steamapps/common/wesnoth/data"),
  "/usr/share/games/wesnoth/1.18/data",
];

const USER_ROOT_CANDIDATES = [
  join(HOME, ".local/share/wesnoth"),
  join(HOME, ".wesnoth"),
];

function firstExisting(paths: string[], label: string): string {
  const hit = paths.find((p) => existsSync(p));
  if (!hit) throw new Error(`Could not locate ${label}. Tried:\n  ${paths.join("\n  ")}`);
  return hit;
}

/** `.../wesnoth/data` in the game installation (read-only, core units and terrain). */
export function coreDataDir(): string {
  return process.env.WESNOTH_CORE ?? firstExisting(CORE_CANDIDATES, "the Wesnoth core data directory");
}

/** `~/.local/share/wesnoth/<version>` — saves, add-ons, logs. */
export function userDataDir(): string {
  if (process.env.WESNOTH_USERDATA) return process.env.WESNOTH_USERDATA;
  const root = firstExisting(USER_ROOT_CANDIDATES, "the Wesnoth user data directory");
  const versions = readdirSync(root)
    .filter((d) => /^\d+\.\d+$/.test(d) && statSync(join(root, d)).isDirectory())
    .sort((a, b) => Number(b.split(".")[1]) - Number(a.split(".")[1]));
  if (versions.length === 0) throw new Error(`No versioned data dir under ${root}`);
  return join(root, versions[0]!);
}

export function savesDir(): string {
  return join(userDataDir(), "saves");
}

export function addonsDir(): string {
  return join(userDataDir(), "data/add-ons");
}

export interface SaveFile {
  path: string;
  name: string;
  mtime: Date;
  isReplay: boolean;
}

export function listSaves(): SaveFile[] {
  const dir = savesDir();
  return readdirSync(dir)
    .filter((f) => f.endsWith(".gz"))
    .map((f) => {
      const path = join(dir, f);
      return {
        path,
        name: f.replace(/\.gz$/, ""),
        mtime: statSync(path).mtime,
        isReplay: / replay /.test(f),
      };
    })
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
}

/**
 * The save to advise on: the most recently written non-replay save.
 * Replays are excluded because Wesnoth writes one at scenario end, which would
 * otherwise shadow the live autosave.
 */
export function newestPlayableSave(): SaveFile {
  const saves = listSaves().filter((s) => !s.isReplay);
  if (saves.length === 0) throw new Error(`No savegames found in ${savesDir()}`);
  return saves[0]!;
}

export function resolveSave(nameOrPath?: string): SaveFile {
  if (!nameOrPath) return newestPlayableSave();
  if (existsSync(nameOrPath)) {
    const st = statSync(nameOrPath);
    return { path: nameOrPath, name: nameOrPath, mtime: st.mtime, isReplay: / replay /.test(nameOrPath) };
  }
  const hit = listSaves().find((s) => s.name === nameOrPath || s.name.includes(nameOrPath));
  if (!hit) throw new Error(`No save matching "${nameOrPath}" in ${savesDir()}`);
  return hit;
}
