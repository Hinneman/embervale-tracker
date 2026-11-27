import type { MapLocation } from "./locations.ts";
import type { FogMap } from "./save.ts";
import { mapSize } from "./viewport.ts";

// A cell at or above this value counts as explored. The fog fades from 0 to 255 at its edges.
const exploredFrom = 128;

// How dark the unexplored map is: the alpha of the darkest fog, from 0 to 255.
const fogAlpha = 170;

const cellAt = (fog: FogMap, east: number, north: number) => {
  const cellSize = mapSize / fog.size;
  const column = Math.min(fog.size - 1, Math.max(0, Math.floor(east / cellSize)));
  // Row 0 is the north edge.
  const row = Math.min(fog.size - 1, Math.max(0, fog.size - 1 - Math.floor(north / cellSize)));
  return fog.cells[row * fog.size + column]!;
};

// The knowledge ids of the locations whose spot on the map is explored.
export function exploredIds(fog: FogMap, locations: readonly MapLocation[]): Set<number> {
  return new Set(locations.filter((location) => cellAt(fog, location.east, location.north) >= exploredFrom).map((location) => location.knowledgeId));
}

// Draws the fog as a dark, see-through PNG the size of the grid, with north at the top. Returns null outside a browser.
export function fogImage(fog: FogMap): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = fog.size;
  canvas.height = fog.size;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  // The grid and the image both start at the north edge, so cell and pixel order match.
  const image = context.createImageData(fog.size, fog.size);
  for (let cell = 0; cell < fog.cells.length; cell++) {
    const pixel = cell * 4;
    image.data[pixel] = 11;
    image.data[pixel + 1] = 11;
    image.data[pixel + 2] = 13;
    image.data[pixel + 3] = Math.round(((255 - fog.cells[cell]!) / 255) * fogAlpha);
  }

  context.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}
