/**
 * The dashboard server: a read-only companion for a live game.
 *
 * It watches the saves directory, rebuilds the snapshot whenever Wesnoth writes a
 * new one, and pushes that to any open page over server-sent events, so ending a
 * turn in the game turns the dashboard over on its own. It binds to loopback and
 * has no write path of any kind: every route reads.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { join, normalize, resolve } from "node:path";
import { addonsDir, coreDataDir, newestPlayableSave, resolveSave, savesDir, type SaveFile } from "./paths";
import { loadBoard } from "./save";
import { buildSnapshot, type Snapshot } from "./dashboard";
import { computeExchange, type ExchangeOptions } from "./odds";
import { lookupType } from "./unittypes";
import { lookupItem, lookupItemByName } from "./items";
import { fallenLedger, type Ledger } from "./fallen";

const WEB_DIR = join(import.meta.dir, "..", "web");
const POLL_MS = 1500;

export interface ServerOptions {
  port?: number;
  /** Pin the dashboard to one save instead of following the newest. */
  save?: string;
  pollMs?: number;
}

interface Live {
  snapshot: Snapshot;
  /** What identifies the save we are showing: a new path or a newer write means reload. */
  stamp: string;
}

function stampOf(save: SaveFile): string {
  return `${save.path}@${save.mtime.getTime()}`;
}

/** Strips Wesnoth's image path functions: `units/x.png~TC(1,magenta)` is a file plus instructions. */
function imageFile(image: string): string {
  return image.split("~")[0]!.trim();
}

/**
 * Resolves a unit type's sprite inside the game trees. Only paths that stay under
 * the add-on root or the core data dir are served, so a crafted request cannot
 * walk out into the filesystem.
 */
function spriteFor(typeId: string): { path: string; type: string } | undefined {
  const type = lookupType(typeId);
  if (!type?.image) return undefined;
  const rel = imageFile(type.image);
  if (!rel || rel.includes("..")) return undefined;
  const roots = [join(type.sourceRoot, "images"), join(coreDataDir(), "core/images")];
  for (const root of roots) {
    const candidate = normalize(join(root, rel));
    if (!candidate.startsWith(resolve(root))) continue;
    if (existsSync(candidate)) return { path: candidate, type: rel.endsWith(".jpg") ? "image/jpeg" : "image/png" };
  }
  return undefined;
}

/** Item icons live in the add-on's own `images/` tree, under the same guard as sprites. */
function itemImage(image: string): string | undefined {
  const rel = imageFile(image);
  if (!rel || rel.includes("..")) return undefined;
  const roots = [join(addonsDir(), "Legend_of_the_Invincibles", "images"), join(coreDataDir(), "core/images")];
  for (const root of roots) {
    const candidate = normalize(join(root, rel));
    if (!candidate.startsWith(resolve(root))) continue;
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** Units resolve the way the CLI resolves them: id, then name, then a substring of either. */
function findUnit(snapshot: Snapshot, key: string) {
  const k = key.toLowerCase();
  return (
    snapshot.units.find((u) => u.id.toLowerCase() === k) ??
    snapshot.units.find((u) => u.name.toLowerCase() === k) ??
    snapshot.units.find((u) => u.name.toLowerCase().includes(k) || u.id.toLowerCase().includes(k) || u.type.toLowerCase().includes(k))
  );
}

export function startServer(opts: ServerOptions = {}) {
  const pollMs = opts.pollMs ?? POLL_MS;
  const clients = new Set<(event: string) => void>();

  const read = (): Live => {
    const board = loadBoard(opts.save);
    return { snapshot: buildSnapshot(board), stamp: stampOf(board.save) };
  };

  let live = read();

  // Polling beats fs.watch here: Wesnoth writes a save as a rename over the old
  // path, and watchers miss that on some filesystems. A stat every second and a
  // half costs nothing and never lies.
  const timer = setInterval(() => {
    try {
      const current = opts.save ? resolveSave(opts.save) : newestPlayableSave();
      if (stampOf(current) === live.stamp) return;
      const next = read();
      const before = live.snapshot;
      live = next;
      const turned = before.scenario.turn !== next.snapshot.scenario.turn || before.scenario.id !== next.snapshot.scenario.id;
      for (const send of clients) send(turned ? "turn" : "save");
      console.log(
        `  ${new Date().toLocaleTimeString()}  ${next.snapshot.save.name}  turn ${next.snapshot.scenario.turn}/${next.snapshot.scenario.turns}  -> ${clients.size} listener(s)`,
      );
    } catch (err) {
      console.error(`  save poll failed: ${(err as Error).message}`);
    }
  }, pollMs);

  const server = Bun.serve({
    port: opts.port ?? 4180,
    hostname: "127.0.0.1",
    idleTimeout: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      if (path === "/" || path === "/index.html") {
        return new Response(readFileSync(join(WEB_DIR, "index.html")), {
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
        });
      }

      if (path === "/style.css") {
        return new Response(readFileSync(join(WEB_DIR, "style.css")), {
          headers: { "content-type": "text/css; charset=utf-8", "cache-control": "no-store" },
        });
      }

      if (path === "/app.js") {
        return buildClient();
      }


      if (path === "/api/snapshot") {
        return json(live.snapshot);
      }

      if (path === "/api/saves") {
        return json({ current: live.snapshot.save.name, dir: savesDir(), addons: addonsDir() });
      }

      if (path === "/api/fallen") {
        return json(fallen());
      }

      if (path === "/api/odds") {
        const a = url.searchParams.get("attacker");
        const d = url.searchParams.get("defender");
        if (!a || !d) return json({ error: "attacker and defender are required" }, 400);
        const attacker = findUnit(live.snapshot, a);
        const defender = findUnit(live.snapshot, d);
        if (!attacker || !defender) return json({ error: "no such unit" }, 404);
        const board = loadBoard(live.snapshot.save.path);
        const attackerUnit = board.units.find((u) => u.id === attacker.id);
        const defenderUnit = board.units.find((u) => u.id === defender.id);
        if (!attackerUnit || !defenderUnit) return json({ error: "unit left the board" }, 404);

        const options: ExchangeOptions = {};
        if (url.searchParams.get("backstab") === "1") options.backstab = true;
        const attackName = url.searchParams.get("attack");
        if (attackName) options.attackName = attackName;
        const turn = url.searchParams.get("turn");
        if (turn) options.turn = Number(turn);
        const from = url.searchParams.get("from");
        if (from) {
          const [fx, fy] = from.split(",").map(Number);
          if (Number.isFinite(fx) && Number.isFinite(fy)) options.from = [fx!, fy!];
        }

        try {
          const ex = computeExchange(board, attackerUnit, defenderUnit, options);
          return json({
            attacker: { id: ex.attacker.id, name: ex.attacker.name, hp: ex.attacker.hp, maxHp: ex.attacker.maxHp, hex: ex.attackerHex },
            defender: { id: ex.defender.id, name: ex.defender.name, hp: ex.defender.hp, maxHp: ex.defender.maxHp, hex: ex.defenderHex },
            time: ex.time,
            offence: ex.offence,
            riposte: ex.riposte,
            chanceDefenderDies: ex.chanceDefenderDies,
            chanceAttackerDies: ex.chanceAttackerDies,
            expectedDefenderHp: ex.expectedDefenderHp,
            expectedAttackerHp: ex.expectedAttackerHp,
          });
        } catch (err) {
          return json({ error: (err as Error).message }, 400);
        }
      }

      if (path.startsWith("/img/unit/")) {
        const typeId = decodeURIComponent(path.slice("/img/unit/".length));
        const sprite = spriteFor(typeId);
        if (!sprite) return new Response("no sprite", { status: 404 });
        return new Response(readFileSync(sprite.path), {
          headers: { "content-type": sprite.type, "cache-control": "public, max-age=86400" },
        });
      }

      if (path.startsWith("/img/item/")) {
        const number = Number(path.slice("/img/item/".length));
        const item = Number.isFinite(number) ? lookupItem(number) : undefined;
        const file = item ? itemImage(item.image) : undefined;
        if (!file) return new Response("no icon", { status: 404 });
        return new Response(readFileSync(file), {
          headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" },
        });
      }

      if (path === "/events") {
        let push: (event: string) => void;
        const stream = new ReadableStream({
          start(controller) {
            const enc = new TextEncoder();
            controller.enqueue(enc.encode(`retry: 2000\n\n`));
            push = (event: string) => {
              try {
                controller.enqueue(enc.encode(`event: ${event}\ndata: ${live.snapshot.scenario.turn}\n\n`));
              } catch {
                clients.delete(push);
              }
            };
            clients.add(push);
          },
          cancel() {
            clients.delete(push);
          },
        });
        return new Response(stream, {
          headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" },
        });
      }

      return new Response("not found", { status: 404 });
    },
  });

  return {
    server,
    url: `http://127.0.0.1:${server.port}`,
    stop() {
      clearInterval(timer);
      server.stop(true);
    },
  };
}

/**
 * The ledger reads every scenario-start save plus every autosave of the scenario
 * in progress, so it is rebuilt only when the newest save changes, not per request.
 */
let ledgerCache: { stamp: string; ledger: LedgerView } | null = null;

interface LedgerView extends Omit<Ledger, "past" | "current"> {
  past: FallenView[];
  current: FallenView[];
}

interface FallenView {
  id: string;
  name: string;
  type: string;
  level: number;
  scenario: string;
  lastSeenTurn: number | null;
  lastSeenSave: string;
  /** What went down with them, resolved against the add-on catalogue where it names the item. */
  items: { name: string; icon: string; description: string; flavour: string; properties: { key: string; value: string }[] }[];
}

function fallen(): LedgerView {
  const newest = newestPlayableSave();
  const stamp = stampOf(newest);
  if (ledgerCache?.stamp === stamp) return ledgerCache.ledger;
  const raw = fallenLedger();
  const dress = (f: Ledger["past"][number]): FallenView => ({
    ...f,
    items: f.items.map((name) => {
      const def = lookupItemByName(name);
      return {
        name,
        icon: def?.image ? `/img/item/${def.number}` : "",
        description: def?.description ?? "",
        flavour: def?.flavour ?? "",
        properties: def?.properties ?? [],
      };
    }),
  });
  const ledger: LedgerView = { ...raw, past: raw.past.map(dress), current: raw.current.map(dress) };
  ledgerCache = { stamp, ledger };
  return ledger;
}

let clientBuild: { js: string; stamp: number } | null = null;

/** The client is TypeScript too, bundled on demand so there is no build step to forget. */
async function buildClient(): Promise<Response> {
  const entry = join(WEB_DIR, "app.ts");
  const stamp = statSync(entry).mtimeMs;
  if (!clientBuild || clientBuild.stamp !== stamp) {
    const out = await Bun.build({ entrypoints: [entry], target: "browser", minify: false });
    if (!out.success) {
      const message = out.logs.map((l) => String(l)).join("\n");
      return new Response(`console.error(${JSON.stringify(message)})`, {
        status: 500,
        headers: { "content-type": "text/javascript; charset=utf-8" },
      });
    }
    clientBuild = { js: await out.outputs[0]!.text(), stamp };
  }
  return new Response(clientBuild.js, {
    headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" },
  });
}
