import { beforeEach, describe, expect, test } from "vitest";

import { exploredIds as findExploredIds } from "./fog.ts";
import { locations } from "./locations.ts";
import type { FogMap } from "./save.ts";
import { completeRegionCount, exploredIds, foundIds, isShown, regionProgress, showUnexplored, unexploredFlameCount } from "./state.ts";

const find = (region: string, kind: string, number = 1) =>
  locations.find((location) => location.region === region && location.kind === kind && location.number === number)!;

const springlandsShrine = find("Springlands", "shrine", 1);
const kindlewastesSpire = find("Kindlewastes", "spire");
const kindlewastesLitShrine = find("Kindlewastes", "shrine", 1);
const kindlewastesMissingShrine = find("Kindlewastes", "shrine", 2);

// A fog grid of 1280 by 1280 cells (8 m each, row 0 in the north) where only the cells under the given locations are explored.
const fogWithExplored = (...explored: (typeof locations)[number][]): FogMap => {
  const size = 1280;
  const cells = new Uint8Array(size * size);
  for (const location of explored) {
    cells[(size - 1 - Math.floor(location.north / 8)) * size + Math.floor(location.east / 8)] = 255;
  }
  return { size, cells };
};

describe("fog of war", () => {
  test("row 0 of the grid is the north edge", () => {
    const size = 1280;
    const cells = new Uint8Array(size * size);
    cells.fill(255, 0, size);
    const north = { ...springlandsShrine, knowledgeId: 1, east: 100, north: 10236 };
    const south = { ...springlandsShrine, knowledgeId: 2, east: 100, north: 4 };

    expect(findExploredIds({ size, cells }, [north, south])).toEqual(new Set([1]));
  });

  test("finds the locations on explored cells", () => {
    const fog = fogWithExplored(springlandsShrine);

    expect(findExploredIds(fog, locations)).toEqual(new Set([springlandsShrine.knowledgeId]));
  });

  describe("hiding", () => {
    beforeEach(() => {
      showUnexplored.value = false;
      foundIds.value = new Set([kindlewastesLitShrine.knowledgeId]);
      exploredIds.value = findExploredIds(fogWithExplored(springlandsShrine), locations);
    });

    test("a missing flame on explored ground shows", () => {
      expect(isShown(springlandsShrine)).toBe(true);
    });

    test("a missing flame under fog is hidden, but spires and lit flames show", () => {
      expect(isShown(kindlewastesMissingShrine)).toBe(false);
      expect(isShown(kindlewastesSpire)).toBe(true);
      expect(isShown(kindlewastesLitShrine)).toBe(true);
    });

    test("the switch shows the flames under fog", () => {
      expect(unexploredFlameCount.value).toBeGreaterThan(0);

      showUnexplored.value = true;

      expect(isShown(kindlewastesMissingShrine)).toBe(true);
    });

    test("a save without fog counts everything as explored", () => {
      exploredIds.value = null;

      expect(isShown(kindlewastesMissingShrine)).toBe(true);
      expect(unexploredFlameCount.value).toBe(0);
    });
  });
});

describe("region progress", () => {
  const kindlewastesFlames = locations.filter((location) => location.region === "Kindlewastes" && location.kind !== "spire");
  const progressOf = (region: string) => regionProgress.value.find((entry) => entry.region === region);

  beforeEach(() => {
    exploredIds.value = null;
  });

  test("counts flames only, not the spire", () => {
    foundIds.value = new Set([kindlewastesLitShrine.knowledgeId, kindlewastesSpire.knowledgeId]);

    expect(progressOf("Kindlewastes")).toEqual({ region: "Kindlewastes", found: 1, total: kindlewastesFlames.length });
  });

  test("leaves out the regions that have only a spire", () => {
    expect(regionProgress.value.map((entry) => entry.region)).not.toContain("Low Meadows");
    expect(regionProgress.value.map((entry) => entry.region)).not.toContain("Blackmire");
  });

  test("a region is done when all its flames are lit, even with its spire inactive", () => {
    foundIds.value = new Set(kindlewastesFlames.map((location) => location.knowledgeId));

    expect(completeRegionCount.value).toBe(1);
  });

  test("flames under fog still count toward the total", () => {
    foundIds.value = new Set([kindlewastesLitShrine.knowledgeId]);
    exploredIds.value = findExploredIds(fogWithExplored(kindlewastesLitShrine), locations);

    expect(progressOf("Kindlewastes")?.total).toBe(kindlewastesFlames.length);
  });
});
