/**
 * LotI's item catalogue.
 *
 * A save stores an item two ways: worn, as an `[object]` inside the unit's
 * modifications, which carries its own name; and in the bag, as `[item_storage]`
 * entries that give only a sort and a number. The numbers mean nothing without
 * `utils/item_list.cfg`, which is the add-on's own list of every item in the game.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { addonsDir } from "./paths";
import { parseWml, children, clean, type WNode } from "./wml";

export interface ItemDef {
  number: number;
  name: string;
  sort: string;
  image: string;
  /** The add-on's own one-line explanation, when it overrides the generated one. */
  description: string;
  flavour: string;
  /** Everything the item actually does, as `key value` pairs read from its block. */
  properties: { key: string; value: string }[];
  /** Abilities or advancements the item grants, as the source writes them. */
  grants: string[];
}

/** Bookkeeping that describes how an item drops, not what it does. */
const NOT_A_PROPERTY = new Set([
  "name", "number", "sort", "image", "flavour", "description_override", "description",
  "drop", "expanded_drop", "gladiators_drop", "inferno_drop", "legacy_drop", "no_drop",
]);

let cache: Map<number, ItemDef> | null = null;

function stripMarkup(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .trim();
}

function readItem(o: WNode): ItemDef | undefined {
  const number = Number(clean(o.attrs["number"]));
  if (!Number.isFinite(number)) return undefined;
  const properties = Object.entries(o.attrs)
    .filter(([k]) => !NOT_A_PROPERTY.has(k))
    .map(([key, value]) => ({ key: key.replace(/_/g, " "), value: clean(value) }));

  const grants: string[] = [];
  for (const eff of children(o, "effect")) {
    const applyTo = clean(eff.attrs["apply_to"]);
    const desc = clean(eff.attrs["description"]) || clean(eff.attrs["id"]);
    // Ability grants arrive as an unexpanded macro call, which names the ability plainly enough.
    const macro = eff.raw.join(" ").match(/\{([A-Z_]+[^}]*)\}/)?.[1] ??
      eff.children.flatMap((c) => c.raw).join(" ").match(/\{([A-Z_]+[^}]*)\}/)?.[1];
    grants.push([applyTo, desc, macro].filter(Boolean).join(": "));
  }
  for (const latent of children(o, "latent")) {
    const desc = stripMarkup(clean(latent.attrs["desc"]));
    if (desc) grants.push(`set bonus: ${desc}`);
  }

  return {
    number,
    name: clean(o.attrs["name"]),
    sort: clean(o.attrs["sort"]),
    image: clean(o.attrs["image"]),
    description: stripMarkup(clean(o.attrs["description_override"]) || clean(o.attrs["description"])),
    flavour: clean(o.attrs["flavour"]),
    properties,
    grants,
  };
}

/** Every item the add-on defines, by its number. Empty when the add-on is absent. */
export function itemIndex(addon = "Legend_of_the_Invincibles"): Map<number, ItemDef> {
  if (cache) return cache;
  cache = new Map();
  const path = join(addonsDir(), addon, "utils/item_list.cfg");
  if (!existsSync(path)) return cache;
  const root = parseWml(readFileSync(path, "utf8"));
  // The list lives inside `#define ITEM_LIST`, which the parser keeps as raw text
  // around the blocks, so the `[object]` nodes sit wherever the defines put them.
  const collect = (n: WNode) => {
    for (const c of n.children) {
      if (c.tag === "object") {
        const item = readItem(c);
        if (item && !cache!.has(item.number)) cache!.set(item.number, item);
        continue;
      }
      collect(c);
    }
  };
  collect(root);
  return cache;
}

export function lookupItem(number: number): ItemDef | undefined {
  return itemIndex().get(number);
}

export function itemCount(): number {
  return itemIndex().size;
}
