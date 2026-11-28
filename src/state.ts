import { batch, computed, signal } from "@preact/signals";

import { fogImage as drawFogImage, exploredIds as findExploredIds } from "./fog.ts";
import { flameLocations, locations, orderedLocations, shortName, type LocationKind, type MapLocation } from "./locations.ts";
import { readFog, readKnowledge } from "./save.ts";
import { flyTo, toMapX, toMapY, view } from "./viewport.ts";

export type LocationState = "unknown" | "found" | "missing";
export type ListMode = "missing" | "all";

// The loaded save stays in the browser, so it is there again on the next visit.
const storageKeys = {
  found: "found",
  explored: "explored",
  fogImage: "fogImage",
};

function readStored(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    // Private windows and blocked storage throw here. The page then starts with no save.
    return null;
  }
}

function writeStored(key: string, value: unknown) {
  try {
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // Blocked or full storage only stops the save from loading again on the next visit.
  }
}

const readStoredIds = (key: string) => {
  const ids = readStored(key);
  return Array.isArray(ids) ? new Set(ids.filter((id) => typeof id === "number")) : null;
};

const readStoredImage = () => {
  const image = readStored(storageKeys.fogImage);
  return typeof image === "string" && image.startsWith("data:image/png;") ? image : null;
};

export const foundIds = signal<ReadonlySet<number> | null>(readStoredIds(storageKeys.found));
// The locations on explored ground, or null when the save holds no fog and everything counts as explored.
export const exploredIds = signal<ReadonlySet<number> | null>(readStoredIds(storageKeys.explored));
// The fog drawn as a PNG data URL, laid over the map. Null without fog.
export const fogImage = signal<string | null>(readStoredImage());
export const selectedLocation = signal<MapLocation | null>(null);
export const errorMessage = signal("");
// Read out by screen readers through a polite live region: the selected location and the result of loading a save.
export const announcement = signal("");
// The path of a save the desktop app found on its own. A save the player picks or drops has none.
export const detectedSavePath = signal<string | null>(null);
export const listMode = signal<ListMode>("all");
export const visibleKinds = signal<Record<LocationKind, boolean>>({
  shrine: true,
  sanctum: true,
  spire: true,
});

export function stateOf(location: MapLocation): LocationState {
  const ids = foundIds.value;
  if (!ids) {
    return "unknown";
  }

  return ids.has(location.knowledgeId) ? "found" : "missing";
}

// On by default, so a region never looks complete while one of its flames is still under fog.
// Turned off, missing flames on unexplored ground stay hidden, like in the game's fog.
export const showUnexplored = signal(true);

const isExplored = (location: MapLocation) => exploredIds.value === null || exploredIds.value.has(location.knowledgeId);

// Spires always show, so the player knows where to head, and so do the flames already lit.
const isRevealed = (location: MapLocation) => showUnexplored.value || location.kind === "spire" || stateOf(location) === "found" || isExplored(location);

// The missing flames on unexplored ground, which stay hidden while showUnexplored is off.
export const unexploredFlameCount = computed(() => flameLocations.filter((location) => stateOf(location) === "missing" && !isExplored(location)).length);

export const isShown = (location: MapLocation) =>
  visibleKinds.value[location.kind] && (listMode.value === "all" || stateOf(location) !== "found") && isRevealed(location);

export const shownLocations = computed(() => orderedLocations.filter(isShown));

export const stepLocations = computed(() => shownLocations.value.filter((location) => stateOf(location) !== "found"));

export const foundFlameCount = computed(() => flameLocations.filter((location) => stateOf(location) === "found").length);

export const foundSpireCount = computed(() => locations.filter((location) => location.kind === "spire" && stateOf(location) === "found").length);

const stateWords: Record<LocationState, string> = {
  missing: "missing",
  found: "found",
  unknown: "not checked",
};

export function selectLocation(location: MapLocation | null, fly: boolean) {
  selectedLocation.value = location;

  if (location) {
    announcement.value = `${shortName(location)}, ${location.region}, ${stateWords[stateOf(location)]}`;
  }

  if (fly && location) {
    flyTo({
      centerX: toMapX(location.east),
      centerY: toMapY(location.north),
      width: Math.min(view.peek().width, 2200),
    });
  }
}

export function stepBy(direction: 1 | -1) {
  const steps = stepLocations.value;
  if (!steps.length) {
    return;
  }

  const selected = selectedLocation.value;
  const position = selected ? steps.indexOf(selected) : -1;
  const nextIndex = position < 0 ? (direction > 0 ? 0 : steps.length - 1) : (position + direction + steps.length) % steps.length;

  selectLocation(steps[nextIndex]!, true);
}

export async function loadSave(file: File) {
  detectedSavePath.value = null;
  await loadSaveBytes(async () => new Uint8Array(await file.arrayBuffer()));
}

// The last load's counts, so a reload the player did not start is announced only when something changed.
let loadedSummary = "";

// Takes a reader, so a save that cannot be read shows its error the same way as a damaged save.
// A quiet load is a reload after the game saved: it is announced only when the counts changed.
export async function loadSaveBytes(read: () => Promise<Uint8Array>, quiet = false) {
  errorMessage.value = "";

  try {
    const save = await read();
    const knowledgeIds = readKnowledge(save);
    const ids = new Set(locations.map((location) => location.knowledgeId).filter((id) => knowledgeIds.has(id)));
    const fog = readFog(save);
    const explored = fog ? findExploredIds(fog, locations) : null;
    const image = fog ? drawFogImage(fog) : null;

    batch(() => {
      foundIds.value = ids;
      exploredIds.value = explored;
      fogImage.value = image;
      selectedLocation.value = null;
    });

    const spireTotal = locations.length - flameLocations.length;
    const summary = `${foundFlameCount.peek()} of ${flameLocations.length} flames lit, ${foundSpireCount.peek()} of ${spireTotal} spires active`;
    if (!quiet || summary !== loadedSummary) {
      announcement.value = `Save loaded: ${summary}.`;
    }
    loadedSummary = summary;

    writeStored(storageKeys.found, [...ids]);
    writeStored(storageKeys.explored, explored && [...explored]);
    writeStored(storageKeys.fogImage, image);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  }
}

export function pickSaveFile() {
  const input = document.createElement("input");

  input.type = "file";
  input.accept = ".ksd";
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) {
      void loadSave(file);
    }
  });
  input.click();
}
