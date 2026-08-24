import { expect, test } from "bun:test";
import { adjacentHexes } from "./save";

const key = (h: [number, number]) => `${h[0]},${h[1]}`;
const set = (x: number, y: number) => new Set(adjacentHexes(x, y).map(key));

/**
 * Scenario 02's moveto trigger fires on the six hexes around Lord Redain at
 * (2,6). The scenario file lists them explicitly, so it is ground truth for
 * the column parity.
 */
test("even column: the six hexes around Redain match the scenario's trigger list", () => {
  const trigger = new Set(["2,5", "3,6", "3,7", "2,7", "1,7", "1,6"]);
  expect(set(2, 6)).toEqual(trigger);
});

test("odd column: neighbours mirror the even case", () => {
  expect(set(3, 6)).toEqual(new Set(["3,5", "4,5", "4,6", "3,7", "2,6", "2,5"]));
});

test("adjacency is symmetric across the parity boundary", () => {
  for (const [x, y] of [[2, 6], [3, 6], [14, 10], [21, 1], [9, 9]] as const) {
    for (const n of adjacentHexes(x, y)) {
      expect(set(n[0], n[1]).has(`${x},${y}`)).toBe(true);
    }
  }
});
