import { useEffect } from "preact/hooks";

import { characterListOpen, characterName, characters, detectedSaves, isDesktop, loadDetectedSave, sourceLabel, type DetectedSave } from "./desktop.ts";
import { detectedSavePath, foundIds, pickSaveFile } from "./state.ts";

// The save holds no portrait, so each character gets its initial on a colour derived from its name.
function nameHue(name: string) {
  let hash = 0;
  for (const character of name) {
    hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  }
  return hash % 360;
}

export function CharacterBadge({ name, class: className = "" }: { name: string; class?: string }) {
  const initial = [...name.trim()][0]?.toLocaleUpperCase() ?? "?";

  return (
    <span class={`character-badge ${className}`} style={{ "--hue": nameHue(name) }} aria-hidden="true">
      {initial}
    </span>
  );
}

const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const timeUnits: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

function lastSaved(modified: number) {
  const seconds = (modified - Date.now()) / 1000;
  for (const [unit, length] of timeUnits) {
    if (Math.abs(seconds) >= length) {
      return relativeTime.format(Math.round(seconds / length), unit);
    }
  }
  return "just now";
}

function CharacterRow({ save, saves }: { save: DetectedSave; saves: readonly DetectedSave[] }) {
  const name = characterName(save);
  const level = characters.value.get(save.path)?.level ?? null;
  const details = [level === null ? null : `Level ${level}`, sourceLabel(save, saves)].filter(Boolean).join(" · ");

  return (
    <li>
      <button class="character-row" aria-current={detectedSavePath.value === save.path} title={save.path} onClick={() => void loadDetectedSave(save)}>
        <CharacterBadge name={name} class="size-10 text-base" />
        <span class="grid min-w-0">
          <span class="truncate text-[15px] leading-5 font-semibold text-primary">{name}</span>
          <span class="truncate text-[13px] leading-4.5 text-muted">{details}</span>
        </span>
        <span class="mono-caption text-right whitespace-nowrap" title={new Date(save.modified).toLocaleString()}>
          Saved {lastSaved(save.modified)}
        </span>
      </button>
    </li>
  );
}

// Lists the character saves the Windows app finds. Picking one loads it and closes the list.
export function CharacterList() {
  const saves = detectedSaves.value;
  // Without a loaded save there is nothing behind the list to go back to.
  const canClose = foundIds.value !== null;
  const close = () => (characterListOpen.value = false);

  useEffect(() => {
    if (!characterListOpen.value || !canClose) {
      return;
    }

    const onKey = (event: KeyboardEvent) => event.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [characterListOpen.value, canClose]);

  if (!isDesktop || !characterListOpen.value) {
    return null;
  }

  return (
    <div
      class="fixed inset-0 z-90 grid place-items-center bg-overlay p-4 backdrop-blur-sm"
      onClick={(event) => canClose && event.target === event.currentTarget && close()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="character-list-title"
        class="floating menu-in grid max-h-full w-full max-w-120 grid-rows-[auto_minmax(0,1fr)_auto] rounded-[20px]"
      >
        <header class="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
          <h2 id="character-list-title" class="title text-primary">
            Choose a character
          </h2>
          {canClose && (
            <button class="btn btn-ghost btn-sm btn-icon" aria-label="Close" onClick={close}>
              ✕
            </button>
          )}
        </header>
        {saves.length === 0 ? (
          <p class="px-5 py-2 text-[13px] leading-4.5 text-muted">No character saves were found in the Steam or local save folders.</p>
        ) : (
          <ul class="grid content-start gap-1 overflow-y-auto px-2.5">
            {saves.map((save) => (
              <CharacterRow key={save.path} save={save} saves={saves} />
            ))}
          </ul>
        )}
        <footer class="flex justify-end px-5 pt-3 pb-5">
          <button
            class="btn btn-ghost btn-sm"
            onClick={() => {
              close();
              pickSaveFile();
            }}
          >
            Open a save file…
          </button>
        </footer>
      </section>
    </div>
  );
}

// Shows the loaded character in the top bar and opens the character list.
export function CharacterButton() {
  const saves = detectedSaves.value;
  if (!isDesktop || saves.length === 0) {
    return null;
  }

  const loaded = saves.find((save) => save.path === detectedSavePath.value);
  const name = loaded ? characterName(loaded) : null;

  return (
    <button
      class={`btn btn-glass btn-sm gap-2 ${name ? "pl-1.5" : ""}`}
      aria-haspopup="dialog"
      title="Switch character"
      onClick={() => (characterListOpen.value = true)}
    >
      {name ? <CharacterBadge name={name} class="size-6 text-xs" /> : null}
      {name ?? "Choose character"}
    </button>
  );
}
