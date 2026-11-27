import { batch, computed, signal } from "@preact/signals";

import { flameLocations, locations, orderedLocations, type LocationKind, type MapLocation } from "./locations.ts";
import { readKnowledge } from "./save.ts";
import { flyTo, toMapX, toMapY, view } from "./viewport.ts";

export type LocationState = "unknown" | "found" | "missing";
export type ListMode = "missing" | "all";

const foundStorageKey = "found";

function readStoredSave() {
  try {
    const storedIds: unknown = JSON.parse(localStorage.getItem(foundStorageKey) ?? "null");
    if (Array.isArray(storedIds)) {
      return new Set(storedIds.filter((id) => typeof id === "number"));
    }
  } catch {
    // Private windows and blocked storage throw here. The page then starts with no save.
  }

  return null;
}

export const foundIds = signal<ReadonlySet<number> | null>(readStoredSave());
export const selectedLocation = signal<MapLocation | null>(null);
export const errorMessage = signal("");
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

export const isShown = (location: MapLocation) => visibleKinds.value[location.kind] && (listMode.value === "all" || stateOf(location) !== "found");

export const shownLocations = computed(() => orderedLocations.filter(isShown));

export const stepLocations = computed(() => shownLocations.value.filter((location) => stateOf(location) !== "found"));

export const foundFlameCount = computed(() => flameLocations.filter((location) => stateOf(location) === "found").length);

export const foundSpireCount = computed(() => locations.filter((location) => location.kind === "spire" && stateOf(location) === "found").length);

export function selectLocation(location: MapLocation | null, fly: boolean) {
  selectedLocation.value = location;

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

// Takes a reader, so a save that cannot be read shows its error the same way as a damaged save.
export async function loadSaveBytes(read: () => Promise<Uint8Array>) {
  errorMessage.value = "";

  try {
    const knowledgeIds = readKnowledge(await read());
    const ids = new Set(locations.map((location) => location.knowledgeId).filter((id) => knowledgeIds.has(id)));

    batch(() => {
      foundIds.value = ids;
      selectedLocation.value = null;
    });

    try {
      localStorage.setItem(foundStorageKey, JSON.stringify([...ids]));
    } catch {
      // Blocked storage only stops the save from loading again on the next visit.
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  }
}

export function forgetSave() {
  batch(() => {
    foundIds.value = null;
    detectedSavePath.value = null;
  });

  try {
    localStorage.removeItem(foundStorageKey);
  } catch {
    // Blocked storage holds no save to remove.
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
