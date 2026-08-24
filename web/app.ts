/**
 * The dashboard client. Everything it shows comes from `/api/snapshot`, which is the
 * save decoded by the same modules the CLI uses; nothing is computed here except
 * layout. The page follows the game on its own: the server pushes an event whenever
 * Wesnoth writes a save, and the board turns over without a reload.
 */

import type { ItemView, Snapshot, UnitView, TerrainView } from "../src/dashboard";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

interface State {
  snapshot: Snapshot | null;
  previous: Snapshot | null;
  selected: string | null;
  target: string | null;
  hex: { x: number; y: number } | null;
  hexSize: number;
  showNames: boolean;
  backstab: boolean;
  attackName: string | null;
}

const state: State = {
  snapshot: null,
  previous: null,
  selected: null,
  target: null,
  hex: null,
  hexSize: 15,
  showNames: false,
  backstab: false,
  attackName: null,
};

/* ── terrain colours ─────────────────────────────────────────────── */

const TERRAIN_COLOUR: Record<string, string> = {
  deep_water: "#16305c",
  shallow_water: "#2f6ea6",
  swamp_water: "#4c5a3f",
  reef: "#2f7f92",
  flat: "#6f8f47",
  sand: "#c6ad74",
  forest: "#33562f",
  hills: "#7d7038",
  mountains: "#6a5f52",
  village: "#8a8f52",
  castle: "#8d8577",
  cave: "#2e2823",
  frozen: "#cfe0e8",
  fungus: "#6a4a6d",
  rails: "#6d6d70",
  impassable: "#171310",
  unwalkable: "#1d1a15",
};

/** Which class decides the colour when a hex resolves to several. */
const COLOUR_ORDER = [
  "deep_water", "shallow_water", "swamp_water", "reef", "frozen", "mountains",
  "forest", "fungus", "hills", "cave", "sand", "castle", "rails", "impassable",
  "unwalkable", "village", "flat",
];

function terrainColour(t: TerrainView): string {
  // A village hex keeps its ground colour and gets a marker on top, so the eye reads
  // both what is there and what it costs to stand on.
  const pool = [...t.classes, ...t.base].filter((c) => c !== "village");
  for (const c of COLOUR_ORDER) if (pool.includes(c)) return TERRAIN_COLOUR[c] ?? "#555";
  return "#4a4a44";
}

const SIDE_COLOUR: Record<string, string> = {
  red: "#d94b3f",
  blue: "#4f74d6",
  green: "#4fa64f",
  purple: "#9b5fc0",
  orange: "#e08a2e",
  black: "#3a3a3a",
  white: "#dcdcdc",
  brown: "#8a6a3a",
  teal: "#3aa79b",
  gold: "#c9a227",
};

function sideColour(side: number): string {
  const s = state.snapshot?.sides.find((x) => x.side === side);
  const named = s?.colour ? SIDE_COLOUR[s.colour.toLowerCase()] : undefined;
  if (named) return named;
  return ["#4f74d6", "#d94b3f", "#4fa64f", "#e08a2e", "#9b5fc0", "#3aa79b"][(side - 1) % 6]!;
}

/* ── small helpers ───────────────────────────────────────────────── */

const el = (tag: string, cls?: string, text?: string) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

const svgEl = <K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] =>
  document.createElementNS("http://www.w3.org/2000/svg", tag);

const pct = (v: number) => `${Math.round(v * 100)}%`;
const signed = (v: number) => (v > 0 ? `+${v}` : String(v));
const unitById = (id: string | null) => (id ? (state.snapshot?.units.find((u) => u.id === id) ?? null) : null);

/* ── header ──────────────────────────────────────────────────────── */

function renderHeader(s: Snapshot) {
  $("scenario-name").textContent = s.scenario.name;
  $("save-name").textContent = `${s.save.name}  ·  ${new Date(s.save.mtime).toLocaleTimeString()}  ·  ${s.scenario.difficulty}`;
  $("turn").textContent = s.scenario.turns ? `${s.scenario.turn} / ${s.scenario.turns}` : String(s.scenario.turn);
  const time = s.scenario.time;
  $("tod").textContent = time ? time.name : "-";
  $("tod-effect").textContent = time
    ? time.lawfulBonus === 0
      ? "no alignment bonus"
      : `lawful ${signed(time.lawfulBonus)}%, chaotic ${signed(-time.lawfulBonus)}%`
    : "time of day";
  const mine = s.sides.find((x) => x.isPlayer);
  $("gold").textContent = mine ? String(mine.gold) : "-";
  const villagesOnMap = countVillages(s);
  $("villages").textContent = mine ? `${mine.villageCount} / ${villagesOnMap}` : "-";

  if (time) {
    tip($("tod").parentElement as HTMLElement, {
      title: `${time.name}, turn ${s.scenario.turn}`,
      body: s.scenario.upcoming.map((t) => `T${t.turn} ${t.name}${t.lawfulBonus ? ` (lawful ${signed(t.lawfulBonus)}%)` : ""}`).join("\n"),
    });
  }
  if (mine) {
    tip($("gold").parentElement as HTMLElement, {
      title: `${mine.gold} gold`,
      body: `${signed(mine.netIncome)} a turn: ${s.rules.baseIncome} base, ${signed(mine.income)} bonus, ${mine.villageCount} villages, less ${mine.upkeep} upkeep.`,
    });
    tip($("villages").parentElement as HTMLElement, {
      title: `${mine.villageCount} villages held`,
      body: `${villagesOnMap} villages sit on this map, and ${villagesOnMap - mine.villageCount} are not yours. Each pays ${mine.villageGold} gold a turn and supports ${s.rules.villageSupport} level of upkeep. A unit resting in one heals as well.`,
    });
  }
  tip($("turn").parentElement as HTMLElement, {
    title: s.scenario.turns ? `Turn ${s.scenario.turn} of ${s.scenario.turns}` : `Turn ${s.scenario.turn}`,
    body: s.scenario.turns
      ? `${Math.max(0, s.scenario.turns - s.scenario.turn)} turns left. Experience is scaled to ${s.scenario.experienceModifier}% here, so levelling is ${s.scenario.experienceModifier > 100 ? "slower" : "faster"} than usual.`
      : "This scenario has no turn limit.",
  });
}

/** How many villages the map holds at all, which is what the header count is measured against. */
function countVillages(s: Snapshot): number {
  let n = 0;
  for (const row of s.map.rows) for (const code of row) if (s.map.legend[code]?.village) n++;
  return n;
}

/* ── sides ───────────────────────────────────────────────────────── */

function renderSides(s: Snapshot) {
  const host = $("sides");
  host.textContent = "";
  for (const side of s.sides) {
    const row = el("div", `side${side.hostile ? " hostile" : ""}`);
    const flag = el("div", "flag");
    flag.style.background = sideColour(side.side);
    const who = el("div", "who");
    who.append(
      el("span", "name", `${side.side}. ${side.name || side.teamName || "side " + side.side}`),
      el(
        "span",
        "meta",
        `${side.onMap} on the map${side.recallList ? `, ${side.recallList} recallable` : ""} · ${side.villageCount} villages · ${side.controller}`,
      ),
    );
    const purse = el("div", "purse");
    purse.append(el("b", undefined, String(side.gold)), el("div", "meta", `${signed(side.netIncome)} a turn`));
    row.append(flag, who, purse);
    tip(row, {
      title: side.name || side.teamName || `Side ${side.side}`,
      body: [
        `${side.gold} gold in hand, ${signed(side.netIncome)} a turn.`,
        `That is ${s.rules.baseIncome} base, ${signed(side.income)} bonus, ${side.villageCount} villages at ${side.villageGold} each, less ${side.upkeep} upkeep.`,
        `Upkeep is a gold per level held beyond what the villages support (${s.rules.villageSupport} level each). Loyal units are free.`,
      ].join("\n"),
      props: side.recruits.length ? [`recruits: ${side.recruits.join(", ")}`] : undefined,
    });
    host.append(row);
  }
}

/* ── roster ──────────────────────────────────────────────────────── */

function unitCard(u: UnitView): HTMLElement {
  // A card is a real button: it is a control, and that keeps it reachable from the keyboard.
  const card = el("button", "unit-card") as HTMLButtonElement;
  card.type = "button";
  card.dataset["id"] = u.id;
  if (u.id === state.selected) card.classList.add("selected");
  if (u.id === state.target) card.classList.add("target");

  const portrait = el("div", "portrait");
  portrait.style.borderColor = sideColour(u.side);
  if (u.sprite) {
    const img = document.createElement("img");
    img.src = u.sprite;
    img.alt = u.type;
    img.loading = "lazy";
    portrait.append(img);
  } else {
    portrait.append(el("span", "lvl", String(u.level)));
  }

  const main = el("div", "unit-main");
  const name = el("div", "unit-name");
  if (u.canRecruit) name.append(el("span", "leader", "✦"));
  name.append(el("b", undefined, u.name));
  const bars = el("div", "bars");
  const hp = el("div", "bar bar-hp");
  const hpFill = el("span");
  hpFill.style.width = `${Math.max(0, Math.min(100, (u.hp / Math.max(1, u.maxHp)) * 100))}%`;
  if (u.hp / Math.max(1, u.maxHp) < 0.5) hpFill.style.background = "var(--bad)";
  hp.append(hpFill);
  const xp = el("div", "bar bar-xp");
  const xpFill = el("span");
  xpFill.style.width = `${Math.max(0, Math.min(100, (u.xp / Math.max(1, u.maxXp)) * 100))}%`;
  xp.append(xpFill);
  bars.append(hp, xp);
  main.append(name, el("div", "unit-type", `L${u.level} ${u.type}`), bars);

  const right = el("div", "unit-right");
  right.append(
    el("div", undefined, `${u.hp}/${u.maxHp}`),
    el("div", undefined, u.onRecallList ? "recall" : `${u.x},${u.y}`),
  );

  card.append(portrait, main, right);
  tip(card, {
    title: `${u.name} — L${u.level} ${u.type}`,
    body: [
      `${u.hp} of ${u.maxHp} hitpoints, ${u.xp} of ${u.maxXp} experience.`,
      u.onRecallList ? "On the recall list." : `Standing on ${u.terrain} at ${u.x},${u.y}, ${u.hexDefence}% to be hit.`,
      u.items.length ? `Carrying ${u.items.join(", ")}.` : "Carrying nothing.",
    ].join("\n"),
    props: [u.alignment, ...u.traits, ...u.abilities],
  });
  card.addEventListener("click", () => selectUnit(u.id));
  return card;
}

function renderRoster(s: Snapshot) {
  const host = $("roster");
  host.textContent = "";
  const mine = s.units.filter((u) => !u.hostile).sort(byRank);
  const theirs = s.units.filter((u) => u.hostile).sort(byRank);
  $("roster-count").textContent = `${mine.length} yours, ${theirs.length} against you`;

  const section = (title: string, list: UnitView[]) => {
    if (!list.length) return;
    const head = el("div", "unit-type", title);
    head.style.padding = "6px 4px 2px";
    head.style.letterSpacing = "1px";
    head.style.textTransform = "uppercase";
    host.append(head);
    for (const u of list) host.append(unitCard(u));
  };
  section("your side", mine.filter((u) => !u.onRecallList));
  section("recall list", mine.filter((u) => u.onRecallList));
  section("hostile", theirs.filter((u) => !u.onRecallList));
}

function byRank(a: UnitView, b: UnitView): number {
  if (a.canRecruit !== b.canRecruit) return a.canRecruit ? -1 : 1;
  if (a.level !== b.level) return b.level - a.level;
  return b.xp - a.xp;
}

/* ── the map ─────────────────────────────────────────────────────── */

function hexPoints(cx: number, cy: number, size: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i);
    pts.push(`${(cx + size * Math.cos(angle)).toFixed(2)},${(cy + size * Math.sin(angle)).toFixed(2)}`);
  }
  return pts.join(" ");
}

/** Flat-top hexes in columns; odd columns sit half a hex higher, as Wesnoth lays them out. */
function hexCentre(x: number, y: number, size: number): [number, number] {
  const h = Math.sqrt(3) * size;
  const cx = size + x * 1.5 * size;
  const cy = h * (y + 0.5 + (x % 2 === 0 ? 0.5 : 0));
  return [cx, cy];
}

function renderMap(s: Snapshot) {
  const svg = $<SVGSVGElement & HTMLElement>("map") as unknown as SVGSVGElement;
  const size = state.hexSize;
  const h = Math.sqrt(3) * size;
  const width = size * 2 + (s.map.width - 1) * 1.5 * size + 2;
  const height = h * (s.map.height + 1) + 2;
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const byHex = new Map<string, UnitView[]>();
  for (const u of s.units) {
    if (u.onRecallList) continue;
    const key = `${u.x},${u.y}`;
    const list = byHex.get(key) ?? [];
    list.push(u);
    byHex.set(key, list);
  }

  const terrainLayer = svgEl("g");
  const markLayer = svgEl("g");
  const unitLayer = svgEl("g");

  for (let y = 0; y < s.map.height; y++) {
    const row = s.map.rows[y];
    if (!row) continue;
    for (let x = 0; x < row.length; x++) {
      const code = row[x]!;
      const terrain = s.map.legend[code];
      if (!terrain) continue;
      const [cx, cy] = hexCentre(x, y, size);

      const poly = svgEl("polygon");
      poly.setAttribute("points", hexPoints(cx, cy, size));
      poly.setAttribute("fill", terrainColour(terrain));
      poly.setAttribute("class", `hex${state.hex && state.hex.x === x && state.hex.y === y ? " selected-hex" : ""}`);
      terrainLayer.append(poly);

      if (terrain.village) {
        const owner = s.map.villageOwner[`${x},${y}`];
        const mark = svgEl("circle");
        mark.setAttribute("cx", cx.toFixed(2));
        mark.setAttribute("cy", cy.toFixed(2));
        mark.setAttribute("r", (size * 0.4).toFixed(2));
        mark.setAttribute("class", "hex-village");
        if (owner) mark.setAttribute("fill", sideColour(owner));
        markLayer.append(mark);
      }
      if (terrain.keep) {
        const keep = svgEl("polygon");
        keep.setAttribute("points", hexPoints(cx, cy, size * 0.62));
        keep.setAttribute("class", "hex-keep");
        markLayer.append(keep);
      }

      const units = byHex.get(`${x},${y}`);
      if (units && units.length) {
        const u = units[0]!;
        const g = svgEl("g");
        const ring = svgEl("circle");
        ring.setAttribute("cx", cx.toFixed(2));
        ring.setAttribute("cy", cy.toFixed(2));
        ring.setAttribute("r", (size * 0.72).toFixed(2));
        ring.setAttribute("class", "unit-ring");
        ring.setAttribute("stroke", sideColour(u.side));
        if (u.id === state.selected) ring.setAttribute("stroke-width", "3.5");
        g.append(ring);

        if (u.sprite && size >= 9) {
          const img = svgEl("image");
          img.setAttribute("href", u.sprite);
          img.setAttribute("x", (cx - size * 0.8).toFixed(2));
          img.setAttribute("y", (cy - size * 0.8).toFixed(2));
          img.setAttribute("width", (size * 1.6).toFixed(2));
          img.setAttribute("height", (size * 1.6).toFixed(2));
          img.setAttribute("preserveAspectRatio", "xMidYMid meet");
          g.append(img);
        } else {
          const t = svgEl("text");
          t.setAttribute("x", cx.toFixed(2));
          t.setAttribute("y", (cy + 3).toFixed(2));
          t.setAttribute("class", "unit-label");
          t.textContent = u.canRecruit ? "✦" : String(u.level);
          g.append(t);
        }

        if (u.hp < u.maxHp) {
          const bar = svgEl("rect");
          const w = size * 1.1;
          bar.setAttribute("x", (cx - w / 2).toFixed(2));
          bar.setAttribute("y", (cy + size * 0.62).toFixed(2));
          bar.setAttribute("width", (w * (u.hp / Math.max(1, u.maxHp))).toFixed(2));
          bar.setAttribute("height", "2.5");
          bar.setAttribute("fill", u.hp / u.maxHp < 0.5 ? "#c4553d" : "#6fa84f");
          g.append(bar);
        }

        if (state.showNames && size >= 12) {
          const label = svgEl("text");
          label.setAttribute("x", cx.toFixed(2));
          label.setAttribute("y", (cy - size * 0.85).toFixed(2));
          label.setAttribute("class", "unit-label");
          label.textContent = u.name;
          g.append(label);
        }
        unitLayer.append(g);
      }

      const hit = svgEl("polygon");
      hit.setAttribute("points", hexPoints(cx, cy, size));
      hit.setAttribute("class", "hex-hit");
      hit.addEventListener("click", () => clickHex(x, y));
      const here = units?.[0];
      hit.append(titleFor(x, y, terrain, here));
      unitLayer.append(hit);
    }
  }

  svg.append(terrainLayer, markLayer, unitLayer);
}

function titleFor(x: number, y: number, terrain: TerrainView, unit?: UnitView): SVGTitleElement {
  const t = svgEl("title");
  const bits = [`${x},${y}  ${terrain.code}`, terrain.classes.join(", ") || "no class"];
  if (terrain.heals) bits.push(`heals ${terrain.heals}`);
  if (unit) bits.push(`${unit.name} (L${unit.level} ${unit.type}) ${unit.hp}/${unit.maxHp} hp, ${unit.hexDefence}% to be hit`);
  t.textContent = bits.join("\n");
  return t;
}

function renderLegend() {
  const host = $("legend");
  host.textContent = "";
  const shown = ["flat", "forest", "hills", "mountains", "sand", "shallow_water", "deep_water", "swamp_water", "castle", "cave", "frozen", "impassable"];
  for (const c of shown) {
    const item = el("span");
    const swatch = el("i");
    swatch.style.background = TERRAIN_COLOUR[c] ?? "#555";
    item.append(swatch, document.createTextNode(c.replace("_", " ")));
    host.append(item);
  }
  const village = el("span");
  const vs = el("i");
  vs.style.background = "#f2e2b0";
  vs.style.borderRadius = "50%";
  village.append(vs, document.createTextNode("village, filled in its owner's colour"));
  host.append(village);
}


/* ── tooltips ────────────────────────────────────────────────────── */

/**
 * Everything the game explains in its own words is explained here too: traits,
 * abilities, items and statuses all carry the description the save or the add-on
 * catalogue gives them, so nothing on screen is a bare word you have to look up.
 */
interface Tip {
  title: string;
  body?: string;
  props?: string[];
  flavour?: string;
}

const TIP_KEY = "__tip";

function tip(node: HTMLElement | SVGElement, content: Tip): void {
  (node as unknown as Record<string, Tip>)[TIP_KEY] = content;
  node.setAttribute("data-tip", "");
}

function showTip(content: Tip, x: number, y: number) {
  const box = $("tip");
  box.textContent = "";
  box.append(el("b", undefined, content.title));
  if (content.body) box.append(document.createTextNode(content.body));
  if (content.props?.length) box.append(el("div", "tip-props", content.props.join(" · ")));
  if (content.flavour) box.append(el("div", "tip-flavour", content.flavour));
  box.hidden = false;
  const rect = box.getBoundingClientRect();
  const left = Math.min(window.innerWidth - rect.width - 8, x + 14);
  const top = y + rect.height + 20 > window.innerHeight ? y - rect.height - 12 : y + 18;
  box.style.left = `${Math.max(8, left)}px`;
  box.style.top = `${Math.max(8, top)}px`;
}

function wireTooltips() {
  const box = $("tip");
  const follow = (e: MouseEvent) => {
    const target = (e.target as Element | null)?.closest?.("[data-tip]") as HTMLElement | null;
    const content = target ? ((target as unknown as Record<string, Tip>)[TIP_KEY] ?? null) : null;
    if (!content) {
      box.hidden = true;
      return;
    }
    showTip(content, e.clientX, e.clientY);
  };
  // Both events, because a real pointer moves and a scripted hover does not.
  document.addEventListener("mousemove", follow);
  document.addEventListener("mouseover", follow);
  document.addEventListener("mouseleave", () => (box.hidden = true));
}

/**
 * What a status actually does, in the game's own words. The numbers come from the
 * snapshot's `rules`, which is `game_config.cfg`, so nothing here is a remembered figure.
 */
function statusTip(status: string): Tip {
  const rules = state.snapshot?.rules;
  const text: Record<string, string> = {
    poisoned: `Loses ${rules?.poisonAmount ?? "some"} hitpoints a turn until cured or down to 1. Poison alone cannot kill. A village, a cure, or regeneration clears it.`,
    slowed: "Deals half damage and has half its movement until its next turn ends.",
    petrified: "Turned to stone: cannot move, attack, or be attacked until it is cured.",
    invulnerable: "Takes no damage.",
    guardian: "Will not move from its post until an enemy comes within reach.",
    unhealable: "Cannot be healed by villages, healers or rest.",
    uncovered: "Was hiding and has been spotted; it can be attacked this turn.",
    hidden: "Cannot be seen or attacked while it stays hidden.",
    not_living: "Not a living creature: poison, plague and drain do nothing to it.",
  };
  return { title: status.replace(/_/g, " "), body: text[status] ?? "A status the save has set on this unit." };
}

function itemTip(item: ItemView): Tip {
  return {
    title: item.name,
    body: [item.description, ...item.grants].filter(Boolean).join("\n") || undefined,
    props: [item.sort ? `slot: ${item.sort}` : "", ...item.properties.map((p) => `${p.key} ${p.value}`), item.wornBy ? `worn by ${item.wornBy}` : ""].filter(Boolean),
    flavour: item.flavour || undefined,
  };
}

/* ── the bag ─────────────────────────────────────────────────────── */

function itemTile(item: ItemView): HTMLElement {
  const tile = el("div", "item");
  const icon = el("div");
  if (item.icon) {
    const img = document.createElement("img");
    img.src = item.icon;
    img.alt = "";
    img.loading = "lazy";
    icon.append(img);
  }
  const text = el("div");
  text.append(el("div", "name", item.name), el("div", "meta", item.wornBy ? `${item.sort} · ${item.wornBy}` : item.sort || `#${item.number}`));
  tile.append(icon, text);
  tip(tile, itemTip(item));
  return tile;
}

type Tab = "bag" | "worn" | "fallen";
let bagTab: Tab = "bag";

/** The ledger is its own fetch: it reads far more saves than one snapshot does. */
interface FallenItem {
  name: string;
  icon: string;
  description: string;
  flavour: string;
  properties: { key: string; value: string }[];
}
interface FallenView {
  id: string;
  name: string;
  type: string;
  level: number;
  scenario: string;
  lastSeenTurn: number | null;
  lastSeenSave: string;
  items: FallenItem[];
}
interface LedgerView {
  past: FallenView[];
  current: FallenView[];
  currentScenario: string;
  perScenario: { scenario: string; lost: number }[];
  readSaves: number;
}

let ledger: LedgerView | null = null;

async function loadLedger(): Promise<LedgerView | null> {
  try {
    const res = await fetch("/api/fallen");
    ledger = (await res.json()) as LedgerView;
  } catch {
    ledger = null;
  }
  const total = ledger ? ledger.past.length + ledger.current.length : 0;
  $("fallen-button").textContent = total ? `The fallen (${total})` : "The fallen";
  return ledger;
}

function fallenRow(f: FallenView): HTMLElement {
  const row = el("div", "fallen-row");
  const who = el("div");
  who.append(el("div", "name", `${f.name}`), el("div", "meta", `L${f.level} ${f.type}`));
  const where = el("div", "meta");
  where.textContent = f.lastSeenTurn === null ? f.scenario : `${f.scenario}, last alive on turn ${f.lastSeenTurn}`;
  tip(row, {
    title: `${f.name}, L${f.level} ${f.type}`,
    body:
      (f.lastSeenTurn === null
        ? `Lost during ${f.scenario}. Reconstructed by diffing the roster against the next scenario's start.`
        : `Lost during ${f.scenario}, alive at turn ${f.lastSeenTurn}.`) +
      `\nLast save holding them alive: ${f.lastSeenSave}.` +
      (f.items.length ? `\nEverything below went down with them.` : `\nCarrying nothing.`),
  });

  const carried = el("div", "chips");
  if (!f.items.length) carried.append(el("span", "meta", "carrying nothing"));
  for (const item of f.items) {
    const chip = el("span", "chip item");
    if (item.icon) {
      const img = document.createElement("img");
      img.src = item.icon;
      img.alt = "";
      chip.append(img);
    }
    chip.append(document.createTextNode(item.name));
    tip(chip, {
      title: item.name,
      body: [item.description, "Lost with the unit that carried it."].filter(Boolean).join("\n"),
      props: item.properties.map((p) => `${p.key} ${p.value}`),
      flavour: item.flavour || undefined,
    });
    carried.append(chip);
  }

  row.append(who, where, carried);
  return row;
}

function renderFallen(host: HTMLElement) {
  if (!ledger) {
    host.append(el("p", "empty", "The ledger has not been read yet."));
    return;
  }
  const total = ledger.past.length + ledger.current.length;
  $("overlay-title").textContent = `The fallen: ${total} lost across the campaign`;

  if (ledger.current.length) {
    host.append(el("div", "bag-group", `${ledger.currentScenario}, in progress (${ledger.current.length})`));
    for (const f of ledger.current) host.append(fallenRow(f));
  }

  const byScenario = new Map<string, FallenView[]>();
  for (const f of ledger.past) {
    const list = byScenario.get(f.scenario) ?? [];
    list.push(f);
    byScenario.set(f.scenario, list);
  }
  // Oldest scenario first, in the order the campaign was played.
  for (const { scenario, lost } of ledger.perScenario) {
    const list = byScenario.get(scenario);
    if (!list?.length) continue;
    host.append(el("div", "bag-group", `${scenario} (${lost})`));
    for (const f of list) host.append(fallenRow(f));
  }

  if (!total) host.append(el("p", "empty", "Nobody has been lost yet."));

  host.append(
    el(
      "p",
      "note",
      `Read from ${ledger.readSaves} saves. Finished scenarios are measured between scenario-start saves, so a unit recruited and killed inside one of them never appears. The scenario in progress is measured across its own autosaves, which does catch them.`,
    ),
  );
}

function renderBag() {
  const s = state.snapshot;
  if (!s) return;
  const host = $("bag-content");
  host.textContent = "";
  $("overlay-title").textContent = bagTab === "bag" ? `The bag: ${s.bag.length} items` : `Worn: ${s.worn.length} items on ${new Set(s.worn.map((i) => i.wornBy)).size} units`;
  document.querySelectorAll<HTMLButtonElement>("[data-bag-tab]").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset["bagTab"] === bagTab));
  });

  if (bagTab === "fallen") {
    renderFallen(host);
    return;
  }

  if (bagTab === "bag") {
    if (!s.bag.length) {
      host.append(el("p", "empty", "The bag is empty. Items picked up during a scenario land here."));
      return;
    }
    const bySort = new Map<string, ItemView[]>();
    for (const item of s.bag) {
      const list = bySort.get(item.sort) ?? [];
      list.push(item);
      bySort.set(item.sort, list);
    }
    for (const [sort, list] of [...bySort].sort((a, b) => a[0].localeCompare(b[0]))) {
      host.append(el("div", "bag-group", `${sort} (${list.length})`));
      const grid = el("div", "item-grid");
      for (const item of list) grid.append(itemTile(item));
      host.append(grid);
    }
    return;
  }

  const byUnit = new Map<string, ItemView[]>();
  for (const item of s.worn) {
    const list = byUnit.get(item.wornBy) ?? [];
    list.push(item);
    byUnit.set(item.wornBy, list);
  }
  if (!byUnit.size) {
    host.append(el("p", "empty", "Nobody is carrying anything."));
    return;
  }
  const order = s.units.filter((u) => !u.hostile).sort(byRank).map((u) => u.name);
  const names = [...byUnit.keys()].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  for (const name of names) {
    const list = byUnit.get(name)!;
    host.append(el("div", "bag-group", `${name} (${list.length})`));
    const grid = el("div", "item-grid");
    for (const item of list) grid.append(itemTile(item));
    host.append(grid);
  }
}

function toggleBag(open?: boolean, tab?: Tab) {
  const overlay = $("overlay");
  const next = open ?? overlay.hidden;
  if (tab) bagTab = tab;
  overlay.hidden = !next;
  if (next) renderBag();
}

/* ── selection and sheets ────────────────────────────────────────── */

function clickHex(x: number, y: number) {
  const unit = state.snapshot?.units.find((u) => !u.onRecallList && u.x === x && u.y === y);
  state.hex = { x, y };
  if (unit) {
    selectUnit(unit.id);
    return;
  }
  state.target = null;
  renderAll();
  showHexSheet(x, y);
}

function selectUnit(id: string) {
  const unit = unitById(id);
  if (!unit) return;
  const current = unitById(state.selected);
  if (unit.hostile && current && !current.hostile) {
    state.target = id;
    state.attackName = null;
  } else {
    state.selected = id;
    state.target = null;
    state.attackName = null;
  }
  if (!unit.onRecallList) state.hex = { x: unit.x, y: unit.y };
  renderAll();
}

function sheetFor(u: UnitView): HTMLElement {
  const sheet = el("div", "sheet");

  const head = el("div", "sheet-head");
  const portrait = el("div", "portrait");
  portrait.style.borderColor = sideColour(u.side);
  if (u.sprite) {
    const img = document.createElement("img");
    img.src = u.sprite;
    portrait.append(img);
  } else portrait.append(el("span", "lvl", String(u.level)));
  const titles = el("div");
  titles.append(el("h3", undefined, u.name), el("div", "sub", `L${u.level} ${u.type}${u.advancesTo ? ` → ${u.advancesTo}` : ""}`));
  head.append(portrait, titles);
  sheet.append(head);

  const rows = el("dl", "rows");
  const add = (k: string, v: string) => rows.append(el("dt", undefined, k), el("dd", undefined, v));
  add("hitpoints", `${u.hp} / ${u.maxHp}`);
  add("experience", `${u.xp} / ${u.maxXp}${u.maxXp > u.xp ? `  (${u.maxXp - u.xp} to go)` : ""}`);
  add("moves", `${u.moves} / ${u.maxMoves}`);
  add("alignment", `${u.alignment}, ${u.alignmentPercent}% damage now`);
  if (!u.onRecallList) {
    add("standing on", `${u.x},${u.y}  ${u.terrain}`);
    add("defence there", `${u.hexDefence}% chance to be hit`);
  } else add("standing on", "recall list");
  if (u.auraPercent !== 0) add("aura", `${signed(u.auraPercent)}% damage from ${u.auraSources.join(", ")}`);
  sheet.append(rows);

  if (u.attacks.length) {
    sheet.append(el("h4", undefined, "attacks"));
    const table = el("table", "attacks");
    for (const a of u.attacks) {
      const tr = el("tr");
      tr.append(
        el("td", undefined, a.name),
        el("td", "n", `${a.damage} × ${a.number}`),
        el("td", undefined, `${a.type}, ${a.range}`),
        el("td", undefined, a.specials.join(", ")),
      );
      tip(tr, {
        title: a.name,
        body: [
          `${a.damage} damage a strike, ${a.number} strikes, so ${a.damage * a.number} at most before resistances.`,
          `${a.type} damage at ${a.range} range. The defender's resistance to ${a.type} and the time of day both move this number.`,
          u.alignmentPercent !== 100 ? `Right now ${u.name} deals ${u.alignmentPercent}% damage for being ${u.alignment}.` : "",
        ].filter(Boolean).join("\n"),
        props: a.specials.length ? a.specials : undefined,
      });
      table.append(tr);
    }
    sheet.append(table);
  }

  const chipRow = (title: string, values: { label: string; tip: Tip; icon?: string }[], cls = "chip") => {
    if (!values.length) return;
    sheet.append(el("h4", undefined, title));
    const chips = el("div", "chips");
    for (const v of values) {
      const chip = el("span", cls);
      if (v.icon) {
        const img = document.createElement("img");
        img.src = v.icon;
        img.alt = "";
        chip.append(img);
      }
      chip.append(document.createTextNode(v.label));
      tip(chip, v.tip);
      chips.append(chip);
    }
    sheet.append(chips);
  };

  const detailTips = (list: { id: string; name: string; description: string }[], fallback: string[]) =>
    list.length
      ? list.map((d) => ({ label: d.name || d.id, tip: { title: d.name || d.id, body: d.description || "The save gives no explanation for this one." } }))
      : fallback.map((f) => ({ label: f, tip: { title: f, body: "The save gives no explanation for this one." } }));

  chipRow("traits", detailTips(u.traitDetails, u.traits));
  chipRow("abilities", detailTips(u.abilityDetails, u.abilities));

  const carried = (state.snapshot?.worn ?? []).filter((i) => i.wornBy === u.name);
  chipRow(
    "carrying",
    u.equipment.map((e) => {
      const full = carried.find((i) => i.number === e.number);
      return {
        label: e.name,
        icon: full?.icon,
        tip: full ? itemTip(full) : { title: e.name, body: `slot: ${e.sort}` },
      };
    }),
    "chip item",
  );
  chipRow(
    "status",
    u.statuses.map((st) => ({ label: st, tip: statusTip(st) })),
    "chip status",
  );

  if (!u.hostile && u.adjacentEnemies.length) {
    sheet.append(el("h4", undefined, "in reach right now"));
    const row = el("div", "chips");
    for (const id of u.adjacentEnemies) {
      const foe = unitById(id);
      if (!foe) continue;
      const b = el("button", "act", `${foe.name} (${foe.hp}/${foe.maxHp})`) as HTMLButtonElement;
      tip(b, {
        title: `Attack ${foe.name}`,
        body: `L${foe.level} ${foe.type} on ${foe.terrain}, ${foe.hexDefence}% to be hit there. Click to resolve the exchange.`,
      });
      b.addEventListener("click", () => {
        state.target = id;
        state.attackName = null;
        renderAll();
      });
      row.append(b);
    }
    sheet.append(row);
  }

  const resistEntries = Object.entries(u.resistance).sort(([a], [b]) => a.localeCompare(b));
  if (resistEntries.length) {
    sheet.append(el("h4", undefined, "resistances, as damage taken"));
    const box = el("div", "resist");
    for (const [k, v] of resistEntries) {
      const cls = v > 100 ? "weak" : v < 100 ? "strong" : "";
      const chip = el("span", cls, `${k} ${v}%`);
      tip(chip, {
        title: `${k} damage`,
        body:
          v === 100
            ? "Takes normal damage from this."
            : v > 100
              ? `Takes ${v - 100}% more damage from this. Avoid the matchup.`
              : `Takes ${100 - v}% less damage from this.`,
      });
      box.append(chip);
    }
    sheet.append(box);
  }

  return sheet;
}

function showHexSheet(x: number, y: number) {
  const s = state.snapshot;
  if (!s) return;
  const code = s.map.rows[y]?.[x];
  const terrain = code ? s.map.legend[code] : undefined;
  $("detail-title").textContent = `Hex ${x},${y}`;
  const host = $("detail");
  host.textContent = "";
  if (!terrain) {
    host.append(el("p", "empty", "Off the map."));
    return;
  }
  const sheet = el("div", "sheet");
  sheet.append(el("h3", undefined, terrain.code));
  const rows = el("dl", "rows");
  const add = (k: string, v: string) => rows.append(el("dt", undefined, k), el("dd", undefined, v));
  add("classes", terrain.classes.join(", ") || "none");
  add("village", terrain.village ? `yes, held by side ${s.map.villageOwner[`${x},${y}`] ?? "nobody"}` : "no");
  add("keep", terrain.keep ? "yes, you can recruit from here" : "no");
  if (terrain.heals) add("heals", `${terrain.heals} hp a turn`);
  sheet.append(rows);

  const selected = unitById(state.selected);
  if (selected) {
    sheet.append(el("h4", undefined, `for ${selected.name}`));
    const defs = terrain.classes
      .map((c) => (typeof selected.defence[c] === "number" ? `${c} ${selected.defence[c]}%` : null))
      .filter(Boolean) as string[];
    const costs = terrain.classes
      .map((c) => (typeof selected.movement[c] === "number" ? `${c} costs ${selected.movement[c]}` : null))
      .filter(Boolean) as string[];
    sheet.append(el("p", "note", `${defs.join(", ") || "no defence entry"}. Wesnoth takes the best defence and the worst movement cost among a hex's classes.`));
    if (costs.length) sheet.append(el("p", "note", costs.join(", ")));
  }
  host.append(sheet);
}

function renderDetail() {
  const selected = unitById(state.selected);
  const target = unitById(state.target);
  const host = $("detail");
  if (!selected && !target) {
    if (state.hex) return;
    $("detail-title").textContent = "Selection";
    host.textContent = "";
    host.append(el("p", "empty", "Click a unit or a hex. Select one of yours, then an enemy, to see the fight resolved."));
    return;
  }
  const shown = target ?? selected!;
  $("detail-title").textContent = shown.hostile ? "Enemy" : "Your unit";
  host.textContent = "";
  host.append(sheetFor(shown));
}

/* ── odds ────────────────────────────────────────────────────────── */

async function renderOdds() {
  const panel = $("odds-panel");
  const attacker = unitById(state.selected);
  const defender = unitById(state.target);
  if (!attacker || !defender || attacker.hostile === defender.hostile) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  const host = $("odds");
  host.textContent = "";
  host.append(el("p", "note", `resolving ${attacker.name} against ${defender.name}`));

  const params = new URLSearchParams({ attacker: attacker.id, defender: defender.id });
  if (state.backstab) params.set("backstab", "1");
  if (state.attackName) params.set("attack", state.attackName);

  const res = await fetch(`/api/odds?${params}`);
  const data = await res.json();
  host.textContent = "";
  if (data.error) {
    host.append(el("p", "empty", data.error));
    return;
  }

  const head = el("div", "odds-head");
  head.append(el("div", undefined, `${attacker.name} → ${defender.name}`), el("div", "odds-big", pct(data.chanceDefenderDies)));
  host.append(head);
  host.append(el("p", "note", `chance the exchange kills ${defender.name}`));

  const line = (label: string, value: number, mine: boolean) => {
    const row = el("div", "odds-line");
    const meter = el("div", `meter${mine ? " mine" : ""}`);
    const fill = el("span");
    fill.style.width = `${Math.min(100, value * 100)}%`;
    meter.append(fill);
    row.append(el("span", "note", label), meter, el("span", undefined, pct(value)));
    host.append(row);
  };
  line("they die", data.chanceDefenderDies, false);
  line("you die", data.chanceAttackerDies, true);

  const rows = el("dl", "rows");
  const add = (k: string, v: string) => rows.append(el("dt", undefined, k), el("dd", undefined, v));
  const o = data.offence;
  add("your attack", `${o.attack.name}: ${o.damage} damage × ${o.strikes} at ${o.chanceToHit}%`);
  if (data.riposte) {
    const r = data.riposte;
    add("they answer", `${r.attack.name}: ${r.damage} damage × ${r.strikes} at ${r.chanceToHit}%`);
  } else add("they answer", "nothing at that range");
  add("expected hp left", `${defender.name} ${data.expectedDefenderHp.toFixed(1)}, ${attacker.name} ${data.expectedAttackerHp.toFixed(1)}`);
  if (data.time) add("time of day", `${data.time.name} (lawful ${signed(data.time.lawfulBonus)}%)`);
  host.append(rows);

  const notes = [...(o.notes ?? []), ...(data.riposte?.notes ?? [])];
  if (notes.length) host.append(el("p", "note", notes.join(" · ")));

  const controls = el("div", "chips");
  controls.style.marginTop = "8px";
  const backstab = el("button", "act", "backstab") as HTMLButtonElement;
  backstab.setAttribute("aria-pressed", String(state.backstab));
  backstab.title = "assume a friendly unit stands opposite the defender";
  backstab.addEventListener("click", () => {
    state.backstab = !state.backstab;
    void renderOdds();
  });
  controls.append(backstab);
  for (const a of attacker.attacks) {
    const b = el("button", "act", a.name) as HTMLButtonElement;
    b.setAttribute("aria-pressed", String(state.attackName === a.name));
    b.addEventListener("click", () => {
      state.attackName = state.attackName === a.name ? null : a.name;
      void renderOdds();
    });
    controls.append(b);
  }
  host.append(controls);
}

/* ── objectives ──────────────────────────────────────────────────── */

function renderObjectives(s: Snapshot) {
  const host = $("objectives");
  host.textContent = "";
  const parts: string[] = [];
  if (s.liveObjectives) parts.push(s.liveObjectives);
  if (s.objectives.length) {
    parts.push(s.objectives.map((o) => `${o.condition === "win" ? "Victory" : "Defeat"}: ${o.text}`).join("\n"));
  }
  if (s.brief?.notableEvents?.length) parts.push(`Scenario events\n${s.brief.notableEvents.join("\n")}`);
  if (s.brief?.drops) parts.push(`Drops: ${s.brief.drops}`);
  if (s.brief?.carryover) parts.push(`Carryover: ${s.brief.carryover}`);
  if (s.scenario.next) parts.push(`Next scenario: ${s.scenario.next}`);
  host.textContent = parts.join("\n\n") || "No objectives block in this save.";
}

/* ── what changed since the last save ────────────────────────────── */

function renderChanges() {
  const host = $("changes");
  const now = state.snapshot;
  const before = state.previous;
  if (!now || !before || before.save.name === now.save.name) {
    host.hidden = true;
    return;
  }
  const wasById = new Map(before.units.map((u) => [u.id, u]));
  const nowIds = new Set(now.units.map((u) => u.id));
  const lost = before.units.filter((u) => !u.hostile && !nowIds.has(u.id));
  const killed = before.units.filter((u) => u.hostile && !nowIds.has(u.id));
  const joined = now.units.filter((u) => !u.hostile && !wasById.has(u.id));
  const hurt = now.units.filter((u) => {
    const was = wasById.get(u.id);
    return was && !u.hostile && u.hp < was.hp;
  });

  host.textContent = "";
  host.append(el("b", undefined, `turn ${before.scenario.turn} → ${now.scenario.turn}`));
  if (killed.length) host.append(el("span", "gained", `${killed.length} enemy down: ${killed.map((u) => u.name).join(", ")}`));
  if (lost.length) host.append(el("span", "lost", `lost ${lost.map((u) => `${u.name} (L${u.level} ${u.type})`).join(", ")}`));
  if (joined.length) host.append(el("span", "gained", `joined: ${joined.map((u) => u.name).join(", ")}`));
  if (hurt.length) {
    const worst = hurt
      .map((u) => ({ u, delta: (wasById.get(u.id)?.hp ?? u.hp) - u.hp }))
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 4);
    host.append(el("span", undefined, `hurt: ${worst.map(({ u, delta }) => `${u.name} -${delta}`).join(", ")}`));
  }
  if (!killed.length && !lost.length && !joined.length && !hurt.length) {
    host.append(el("span", undefined, "nothing changed on the board"));
  }
  const close = el("button", undefined, "dismiss");
  close.addEventListener("click", () => (host.hidden = true));
  host.append(close);
  host.hidden = false;
}

/* ── driving it all ──────────────────────────────────────────────── */

function renderAll() {
  const s = state.snapshot;
  if (!s) return;
  renderHeader(s);
  renderSides(s);
  renderRoster(s);
  renderMap(s);
  renderDetail();
  renderObjectives(s);
  void renderOdds();
  if (!$("overlay").hidden) renderBag();
}

async function load(initial = false) {
  const res = await fetch("/api/snapshot");
  const next: Snapshot = await res.json();
  if (state.snapshot) state.previous = state.snapshot;
  state.snapshot = next;
  if (initial) {
    const leader = next.units.find((u) => !u.hostile && u.canRecruit);
    if (leader) {
      state.selected = leader.id;
      if (!leader.onRecallList) state.hex = { x: leader.x, y: leader.y };
    }
    fitMap();
  }
  // A unit that died between saves must not stay selected.
  if (state.selected && !next.units.some((u) => u.id === state.selected)) state.selected = null;
  if (state.target && !next.units.some((u) => u.id === state.target)) state.target = null;
  renderAll();
  renderLegend();
  void loadLedger().then(() => {
    if (!$("overlay").hidden && bagTab === "fallen") renderBag();
  });
  if (!initial) renderChanges();
}

function fitMap() {
  const s = state.snapshot;
  const holder = $("map-holder");
  if (!s || !s.map.width) return;
  const available = holder.clientWidth - 12;
  state.hexSize = Math.max(6, Math.min(28, available / (1.5 * s.map.width + 0.5)));
}

function connect() {
  const dot = $("live-dot");
  const text = $("live-text");
  const source = new EventSource("/events");
  const onUpdate = () => {
    void load();
  };
  source.addEventListener("open", () => {
    dot.className = "dot live";
    text.textContent = "following the game";
  });
  source.addEventListener("turn", onUpdate);
  source.addEventListener("save", onUpdate);
  source.addEventListener("error", () => {
    dot.className = "dot stale";
    text.textContent = "server not answering";
  });
}

function wireControls() {
  document.querySelectorAll<HTMLButtonElement>("[data-zoom]").forEach((b) => {
    b.addEventListener("click", () => {
      const mode = b.dataset["zoom"];
      if (mode === "in") state.hexSize = Math.min(40, state.hexSize * 1.25);
      else if (mode === "out") state.hexSize = Math.max(4, state.hexSize / 1.25);
      else fitMap();
      if (state.snapshot) renderMap(state.snapshot);
    });
  });

  $<HTMLInputElement>("show-names").addEventListener("change", (e) => {
    state.showNames = (e.target as HTMLInputElement).checked;
    if (state.snapshot) renderMap(state.snapshot);
  });

  const bagButton = $("bag-button");
  tip(bagButton, {
    title: "The bag",
    body: "Everything the party is carrying: the shared bag first, then every item currently worn, grouped by who wears it. Press b to open it.",
  });
  bagButton.addEventListener("click", () => toggleBag());
  $("overlay-close").addEventListener("click", () => toggleBag(false));
  $("overlay").addEventListener("click", (e) => {
    if (e.target === $("overlay")) toggleBag(false);
  });
  const fallenButton = $("fallen-button");
  tip(fallenButton, {
    title: "The fallen",
    body: "Everyone lost across the campaign, in which scenario, and what they were carrying when they went down. Press f to open it.",
  });
  fallenButton.addEventListener("click", () => toggleBag(true, "fallen"));

  document.querySelectorAll<HTMLButtonElement>("[data-bag-tab]").forEach((b) => {
    b.addEventListener("click", () => {
      const wanted = b.dataset["bagTab"];
      bagTab = wanted === "worn" ? "worn" : wanted === "fallen" ? "fallen" : "bag";
      renderBag();
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "b") toggleBag(undefined, "bag");
    if (e.key === "f") toggleBag(true, "fallen");
    if (e.key === "Escape") {
      if (!$("overlay").hidden) {
        toggleBag(false);
        return;
      }
      state.selected = null;
      state.target = null;
      state.hex = null;
      renderAll();
    }
  });

  // Drag to pan, which is how anyone reads a map bigger than the panel.
  const holder = $("map-holder");
  let dragging = false;
  let origin = { x: 0, y: 0, left: 0, top: 0 };
  holder.addEventListener("mousedown", (e) => {
    dragging = true;
    holder.classList.add("dragging");
    origin = { x: e.clientX, y: e.clientY, left: holder.scrollLeft, top: holder.scrollTop };
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    holder.scrollLeft = origin.left - (e.clientX - origin.x);
    holder.scrollTop = origin.top - (e.clientY - origin.y);
  });
  window.addEventListener("mouseup", () => {
    dragging = false;
    holder.classList.remove("dragging");
  });
  window.addEventListener("resize", () => {
    fitMap();
    if (state.snapshot) renderMap(state.snapshot);
  });
}

wireControls();
wireTooltips();
connect();
void load(true);
