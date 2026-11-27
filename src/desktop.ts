import { effect, signal } from "@preact/signals";

import { readCharacter, type CharacterInfo } from "./save.ts";
import { detectedSavePath, loadSaveBytes } from "./state.ts";

export type DetectedSave = {
  path: string;
  name: string;
  source: "steam" | "local";
  steamAccount: string | null;
  modified: number;
};

type TauriGlobal = {
  core: {
    invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
  };
  opener: {
    openUrl: (url: string) => Promise<void>;
  };
};

const tauri = (window as { __TAURI__?: TauriGlobal }).__TAURI__;

// True in the Windows app. The website has no access to the save folders.
export const isDesktop = tauri !== undefined;

export const detectedSaves = signal<readonly DetectedSave[]>([]);
// The name and level of each detected save, by path. A save that cannot be read has no entry.
export const characters = signal<ReadonlyMap<string, CharacterInfo>>(new Map());
// The character list opens on the first start and from the character button in the top bar.
export const characterListOpen = signal(false);

const savePathStorageKey = "savePath";
const refreshInterval = 5000;
// The modified time of the loaded save, so a new save by the game loads again.
let loadedModified = 0;
// The modified time each character entry was read at, so a save is read again only after the game writes it.
const characterModified = new Map<string, number>();

const readSaveFile = async (path: string) => new Uint8Array(await tauri!.core.invoke<ArrayBuffer>("read_save", { path }));

export async function loadDetectedSave(save: DetectedSave) {
  detectedSavePath.value = save.path;
  loadedModified = save.modified;
  characterListOpen.value = false;
  await loadSaveBytes(() => readSaveFile(save.path));
}

async function readCharacters(saves: readonly DetectedSave[]) {
  const stale = saves.filter((save) => characterModified.get(save.path) !== save.modified);
  const removed = [...characterModified.keys()].filter((path) => !saves.some((save) => save.path === path));
  if (stale.length === 0 && removed.length === 0) {
    return;
  }
  for (const path of removed) {
    characterModified.delete(path);
  }

  const read = await Promise.all(
    stale.map(async (save): Promise<[DetectedSave, CharacterInfo | null]> => {
      try {
        return [save, readCharacter(await readSaveFile(save.path))];
      } catch {
        return [save, null];
      }
    }),
  );

  const next = new Map([...characters.peek()].filter(([path]) => saves.some((save) => save.path === path)));
  for (const [save, info] of read) {
    characterModified.set(save.path, save.modified);
    if (info) {
      next.set(save.path, info);
    } else {
      next.delete(save.path);
    }
  }
  characters.value = next;
}

async function refreshSaves() {
  const saves = await tauri!.core.invoke<DetectedSave[]>("list_saves");
  detectedSaves.value = saves;
  await readCharacters(saves);

  const loaded = saves.find((save) => save.path === detectedSavePath.peek());
  if (loaded && loaded.modified > loadedModified) {
    await loadDetectedSave(loaded);
  }
}

function readStoredPath() {
  try {
    return localStorage.getItem(savePathStorageKey);
  } catch {
    return null;
  }
}

// Loads the character picked last time. Without one, the app starts with the character list.
export async function watchSaves() {
  if (!isDesktop) {
    return;
  }

  const saves = await tauri!.core.invoke<DetectedSave[]>("list_saves").catch((): DetectedSave[] => []);
  detectedSaves.value = saves;

  const storedPath = readStoredPath();
  const startSave = saves.find((save) => save.path === storedPath);
  if (startSave) {
    await loadDetectedSave(startSave);
  } else if (saves.length > 0) {
    characterListOpen.value = true;
  }
  await readCharacters(saves).catch(() => {});

  effect(() => {
    const path = detectedSavePath.value;

    try {
      if (path) {
        localStorage.setItem(savePathStorageKey, path);
      } else {
        localStorage.removeItem(savePathStorageKey);
      }
    } catch {
      // Blocked storage only means the app picks the newest save on the next start.
    }
  });

  const refresh = () => void refreshSaves().catch(() => {});
  setInterval(refresh, refreshInterval);
  window.addEventListener("focus", refresh);
}

// The slot name from the file name, for saves whose character name cannot be read.
export const slotName = (save: DetectedSave) => `Character ${save.name.replace(/\D/g, "")}`;

export const characterName = (save: DetectedSave) => characters.value.get(save.path)?.name ?? slotName(save);

// Where the save lives. The Steam account shows only when saves from more than one account are found.
export const sourceLabel = (save: DetectedSave, saves: readonly DetectedSave[]) => {
  if (save.source === "local") {
    return "Local";
  }

  const steamAccounts = new Set(saves.map((other) => other.steamAccount).filter(Boolean));
  return steamAccounts.size > 1 ? `Steam ${save.steamAccount}` : "Steam";
};

// The Windows app runs the page in a webview, which ignores links that open a new tab.
// There, such links open in the system browser. In a normal browser this does nothing.
export function routeExternalLinks() {
  if (!tauri) {
    return;
  }

  document.addEventListener("click", (event) => {
    const link = (event.target as Element | null)?.closest?.<HTMLAnchorElement>("a[target=_blank]");
    if (link) {
      event.preventDefault();
      void tauri.opener.openUrl(link.href);
    }
  });
}
