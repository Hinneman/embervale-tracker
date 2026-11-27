import { effect, signal } from "@preact/signals";

import { detectedSavePath, foundIds, loadSaveBytes } from "./state.ts";

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

const savePathStorageKey = "savePath";
const refreshInterval = 5000;
// The modified time of the loaded save, so a new save by the game loads again.
let loadedModified = 0;

export async function loadDetectedSave(save: DetectedSave) {
  detectedSavePath.value = save.path;
  loadedModified = save.modified;
  await loadSaveBytes(async () => new Uint8Array(await tauri!.core.invoke<ArrayBuffer>("read_save", { path: save.path })));
}

async function refreshSaves() {
  const saves = await tauri!.core.invoke<DetectedSave[]>("list_saves");
  detectedSaves.value = saves;

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

// Loads the save picked last time, or the newest save when the app starts with none loaded.
export async function watchSaves() {
  if (!isDesktop) {
    return;
  }

  const saves = await tauri!.core.invoke<DetectedSave[]>("list_saves").catch((): DetectedSave[] => []);
  detectedSaves.value = saves;

  const storedPath = readStoredPath();
  const startSave = saves.find((save) => save.path === storedPath) ?? (foundIds.peek() === null ? saves[0] : undefined);
  if (startSave) {
    await loadDetectedSave(startSave);
  }

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

export const saveLabel = (save: DetectedSave, saves: readonly DetectedSave[]) => {
  const character = `Character ${save.name.replace(/\D/g, "")}`;
  if (save.source === "local") {
    return `${character} · Local`;
  }

  const steamAccounts = new Set(saves.map((other) => other.steamAccount).filter(Boolean));
  return steamAccounts.size > 1 ? `${character} · Steam ${save.steamAccount}` : `${character} · Steam`;
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
