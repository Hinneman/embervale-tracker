// Generates src/regions.ts from the game's biome map.
//
// The biome map is a BiomeMapResource that kfc-parser unpacks from the game files
// (https://github.com/Brabb3l/kfc-parser): `kfc-parser unpack -g <game folder> -o <output folder>`,
// then BiomeMapResource/509feadb-4c60-425f-9c7c-deeefd9b6920_*.json, the one with a full biomeMap.
//
// Usage: bun scripts/generate-regions.ts <path to the BiomeMapResource json>
import { readFileSync, writeFileSync } from "node:fs";

type BiomeMap = {
  worldOrigin: { x: number; y: number };
  worldSize: { x: number; y: number };
  mapScale: number;
  biomeMap: string[];
};

type Point = [number, number];

// Cells keep their staircase shape within this distance, in metres. Larger values give smoother, less exact lines.
const tolerance = 10;
// Closed outlines shorter than this, in metres, are small patches of one biome inside another and are left out.
const minimumLoopLength = 400;

const [, , inputPath] = process.argv;
if (!inputPath) {
  throw new Error("Usage: bun scripts/generate-regions.ts <BiomeMapResource json>");
}

const { worldOrigin, worldSize, mapScale, biomeMap } = JSON.parse(readFileSync(inputPath, "utf8")) as BiomeMap;
const columns = worldSize.x;
const rows = worldSize.y;
// Row 0 is the south edge, so a row index grows to the north like the "north" coordinate.
const biomeAt = (column: number, row: number) => biomeMap[row * columns + column];

// The borders run along cell edges. Grid vertex (x, y) is the corner at east = x * mapScale, north = y * mapScale.
const vertexColumns = columns + 1;
const vertexId = (x: number, y: number) => y * vertexColumns + x;
const neighbours = new Map<number, number[]>();
const link = (from: number, to: number) => {
  neighbours.set(from, [...(neighbours.get(from) ?? []), to]);
  neighbours.set(to, [...(neighbours.get(to) ?? []), from]);
};

for (let row = 0; row < rows; row++) {
  for (let column = 0; column < columns; column++) {
    if (column > 0 && biomeAt(column - 1, row) !== biomeAt(column, row)) {
      link(vertexId(column, row), vertexId(column, row + 1));
    }
    if (row > 0 && biomeAt(column, row - 1) !== biomeAt(column, row)) {
      link(vertexId(column, row), vertexId(column + 1, row));
    }
  }
}

// Joins the edges into lines that run from one junction (or loose end) to the next.
const edgeKey = (from: number, to: number) => (from < to ? `${from}:${to}` : `${to}:${from}`);
const usedEdges = new Set<string>();
const chains: number[][] = [];

const walk = (start: number, next: number) => {
  const chain = [start];
  let previous = start;
  let current = next;
  usedEdges.add(edgeKey(start, next));

  while (true) {
    chain.push(current);
    const onward = (neighbours.get(current) ?? []).filter((candidate) => !usedEdges.has(edgeKey(current, candidate)));
    if (current === start || neighbours.get(current)!.length !== 2 || onward.length === 0) {
      break;
    }
    previous = current;
    current = onward[0]!;
    usedEdges.add(edgeKey(previous, current));
  }

  chains.push(chain);
};

for (const [vertex, linked] of neighbours) {
  if (linked.length !== 2) {
    for (const next of linked) {
      if (!usedEdges.has(edgeKey(vertex, next))) {
        walk(vertex, next);
      }
    }
  }
}
// What is left are closed loops without junctions.
for (const [vertex, linked] of neighbours) {
  for (const next of linked) {
    if (!usedEdges.has(edgeKey(vertex, next))) {
      walk(vertex, next);
    }
  }
}

const toPoint = (vertex: number): Point => [worldOrigin.x + (vertex % vertexColumns) * mapScale, worldOrigin.y + Math.floor(vertex / vertexColumns) * mapScale];

const distanceToSegment = ([x, y]: Point, [ax, ay]: Point, [bx, by]: Point) => {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSquared)) : 0;
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
};

// Douglas-Peucker: keeps the points that move the line more than the tolerance.
const simplify = (points: Point[]): Point[] => {
  if (points.length < 3) {
    return points;
  }

  let farthest = 0;
  let farthestIndex = 0;
  for (let index = 1; index < points.length - 1; index++) {
    const distance = distanceToSegment(points[index]!, points[0]!, points.at(-1)!);
    if (distance > farthest) {
      farthest = distance;
      farthestIndex = index;
    }
  }

  if (farthest <= tolerance) {
    return [points[0]!, points.at(-1)!];
  }

  return [...simplify(points.slice(0, farthestIndex + 1)).slice(0, -1), ...simplify(points.slice(farthestIndex))];
};

const lineLength = (points: Point[]) =>
  points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point[0] - points[index]![0], point[1] - points[index]![1]), 0);

const borders: Point[][] = [];
for (const chain of chains) {
  const points = chain.map(toPoint);
  const isLoop = chain[0] === chain.at(-1);

  if (isLoop && lineLength(points) < minimumLoopLength) {
    continue;
  }

  if (isLoop) {
    // A loop starts and ends on the same point, so it is split at its farthest point and simplified in two halves.
    const start = points[0]!;
    const splitIndex = points.reduce(
      (best, point, index) =>
        Math.hypot(point[0] - start[0], point[1] - start[1]) > Math.hypot(points[best]![0] - start[0], points[best]![1] - start[1]) ? index : best,
      0,
    );
    borders.push([...simplify(points.slice(0, splitIndex + 1)).slice(0, -1), ...simplify(points.slice(splitIndex))]);
  } else {
    borders.push(simplify(points));
  }
}

const lines = borders.map((points) => `  [${points.flat().join(", ")}],`);
const output = `// Generated by scripts/generate-regions.ts from the game's biome map. Do not edit by hand.
// Each line is a border between two regions, as flat [east, north, east, north, ...] pairs in metres.
export const regionBorders: readonly (readonly number[])[] = [
${lines.join("\n")}
];
`;

writeFileSync(new URL("../src/regions.ts", import.meta.url), output);
console.log(`${borders.length} borders, ${borders.reduce((sum, points) => sum + points.length, 0)} points`);
