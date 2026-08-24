import { expect, test } from "bun:test";
import { casualties, debuts, scenarioDelta, type Snapshot } from "./roster";

const save = (d: string) => ({ path: d, name: d, mtime: new Date(d), isReplay: false });

function snap(name: string, date: string, names: string[], extra: Partial<Snapshot> = {}): Snapshot {
  return {
    save: save(date),
    scenarioId: name,
    scenarioName: name,
    units: new Map(
      names.map((n) => [n, { name: n, type: "Thief", level: 1, xp: 0, maxXp: 29, items: [], loyal: false }]),
    ),
    gold: 0,
    storage: [],
    ...extra,
  };
}

test("a unit missing from the next scenario is attributed to the one it was last seen in", () => {
  const snaps = [snap("One", "2026-01-01", ["A", "B"]), snap("Two", "2026-01-02", ["A"])];
  expect(casualties(snaps).map((c) => [c.name, c.lostIn])).toEqual([["B", "One"]]);
});

test("a unit that joins later is not a casualty", () => {
  const snaps = [snap("One", "2026-01-01", ["A"]), snap("Two", "2026-01-02", ["A", "C"])];
  expect(casualties(snaps)).toEqual([]);
});

test("losses are attributed per scenario, not lumped together", () => {
  const snaps = [
    snap("One", "2026-01-01", ["A", "B", "C"]),
    snap("Two", "2026-01-02", ["A", "C"]),
    snap("Three", "2026-01-03", ["A"]),
  ];
  expect(casualties(snaps).map((c) => `${c.name}:${c.lostIn}`)).toEqual(["B:One", "C:Two"]);
});

test("debut is the first scenario a unit was seen at the start of", () => {
  const snaps = [snap("One", "2026-01-01", ["A"]), snap("Two", "2026-01-02", ["A", "C"])];
  expect(debuts(snaps).get("A")).toBe("One");
  expect(debuts(snaps).get("C")).toBe("Two");
});

test("the last surviving roster is never treated as casualties", () => {
  const snaps = [snap("One", "2026-01-01", ["A", "B"])];
  expect(casualties(snaps)).toEqual([]);
});

test("a scenario delta reports losses, arrivals and item movement", () => {
  const before = snap("One", "2026-01-01", ["A", "B"], { gold: 100, storage: ["mace #74", "sword #113"] });
  const after = snap("Two", "2026-01-02", ["A", "C"], { gold: 40, storage: ["mace #74", "helm #271"] });
  const d = scenarioDelta([before, after], 0)!;
  expect(d.lost.map((c) => c.name)).toEqual(["B"]);
  expect(d.joined.map((u) => u.name)).toEqual(["C"]);
  expect(d.itemsLost).toEqual(["sword #113"]);
  expect(d.itemsGained).toEqual(["helm #271"]);
  expect(d.goldStart).toBe(100);
  expect(d.goldNext).toBe(40);
});

test("a duplicated item is only reported lost when a copy actually goes", () => {
  const before = snap("One", "2026-01-01", ["A"], { storage: ["mace #74", "mace #74"] });
  const after = snap("Two", "2026-01-02", ["A"], { storage: ["mace #74"] });
  const d = scenarioDelta([before, after], 0)!;
  expect(d.itemsLost).toEqual(["mace #74"]);
  expect(d.itemsGained).toEqual([]);
});

test("a level up is reported and does not count as experience gained", () => {
  const before = snap("One", "2026-01-01", ["A"]);
  const after = snap("Two", "2026-01-02", ["A"]);
  after.units.set("A", { name: "A", type: "Rogue", level: 2, xp: 0, maxXp: 80, items: [], loyal: false });
  const d = scenarioDelta([before, after], 0)!;
  expect(d.levelled).toEqual([{ name: "A", from: 1, to: 2, type: "Rogue" }]);
  expect(d.xpGained).toEqual([]);
});

test("there is no delta for the final snapshot", () => {
  expect(scenarioDelta([snap("One", "2026-01-01", ["A"])], 0)).toBeUndefined();
});
