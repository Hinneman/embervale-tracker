import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

import flameIconUrl from "./assets/flame-shrine.png";
import githubDarkUrl from "./assets/github-dark.svg";
import githubWhiteUrl from "./assets/github-white.svg";
import { CharacterButton, CharacterList } from "./characters.tsx";
import { Gauge } from "./gauge.tsx";
import { isMuted, KindIcon } from "./icons.tsx";
import { flameLocations, locations, shortName, type LocationKind, type MapLocation } from "./locations.ts";
import { MapView } from "./map.tsx";
import {
  announcement,
  completeRegionCount,
  errorMessage,
  flameRegions,
  foundFlameCount,
  foundIds,
  foundSpireCount,
  listMode,
  loadSave,
  pickSaveFile,
  regionPanelMinimized,
  regionProgress,
  selectedLocation,
  selectLocation,
  setRegionPanelMinimized,
  shownLocations,
  showUnexplored,
  stateOf,
  unexploredFlameCount,
  visibleKinds,
  type ListMode,
} from "./state.ts";
import { fit, flyTo } from "./viewport.ts";

const listModes: { value: ListMode; label: string }[] = [
  {
    value: "missing",
    label: "Missing",
  },
  {
    value: "all",
    label: "All",
  },
];

const kindToggles: { kind: LocationKind; label: string }[] = [
  {
    kind: "shrine",
    label: "Shrines",
  },
  {
    kind: "sanctum",
    label: "Sanctums",
  },
  {
    kind: "spire",
    label: "Spires",
  },
];

const spireCount = locations.length - flameLocations.length;

// "5 / 14" on screen. Screen readers say "5 of 14" instead of "5 slash 14".
function Fraction({ part, total, spoken = `${part} of ${total}` }: { part: number; total: number; spoken?: string }) {
  return (
    <>
      <span aria-hidden="true">
        {part} / {total}
      </span>
      <span class="sr-only">{spoken}</span>
    </>
  );
}

// A count with a progress bar. Without a save there is nothing found yet, so it shows only the total.
function MeterContent({ label, found, total }: { label: string; found: number | null; total: number }) {
  return (
    <>
      <div class="flex items-baseline justify-between gap-3">
        <span class="eyebrow">{label}</span>
        <span class="meter-value">{found === null ? total : <Fraction part={found} total={total} />}</span>
      </div>
      <div class="bar" style={{ "--progress": found === null ? 0 : found / total }} />
    </>
  );
}

function Meter(props: { label: string; found: number | null; total: number }) {
  return (
    <div class="meter">
      <MeterContent {...props} />
    </div>
  );
}

const regionPanelId = "region-panel";

const showRegion = (region: string) =>
  flyTo(
    fit(
      flameLocations.filter((location) => location.region === region),
      250,
    ),
  );

// Opens the region panel from the top bar's meter and puts focus on its heading.
function openRegionPanel() {
  setRegionPanelMinimized(false);
  document.getElementById("region-panel-toggle")?.focus();
}

// Every region's lit flames as a ring, over the map's top left corner. It stays open while the player uses the map,
// and folds down to its heading. Picking a region shows it on the map. Without a save there is no progress to show.
function RegionPanel() {
  if (foundIds.value === null) {
    return null;
  }

  const minimized = regionPanelMinimized.value;

  return (
    <section class="region-panel card card-accent" aria-labelledby="region-panel-heading">
      <h2 id="region-panel-heading">
        <button
          id="region-panel-toggle"
          class="region-panel-toggle"
          aria-expanded={!minimized}
          aria-controls={regionPanelId}
          onClick={() => setRegionPanelMinimized(!minimized)}
        >
          <span class="display text-[14px]">Regions</span>
          <span class="eyebrow tabular-nums">
            <Fraction part={completeRegionCount.value} total={flameRegions.length} spoken={`${completeRegionCount.value} of ${flameRegions.length} done`} />
          </span>
          <svg
            class={`size-4 transition-transform ${minimized ? "rotate-180" : ""}`}
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M4 10l4-4 4 4" />
          </svg>
          <span class="sr-only">{minimized ? ", minimized" : ""}</span>
        </button>
      </h2>
      <ul id={regionPanelId} class="grid border-t border-line p-1.5" hidden={minimized}>
        {regionProgress.value.map(({ region, found, total }) => (
          <li key={region}>
            <button class="region-row" onClick={() => showRegion(region)}>
              <Gauge found={found} total={total} size={24} />
              <span class="region-name">{region}</span>
              <span class="eyebrow tabular-nums">
                <Fraction part={found} total={total} spoken={`${found} of ${total} lit`} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TopBar() {
  const hasSave = foundIds.value !== null;

  return (
    <header class="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-(--line-strong) bg-sheet px-4 py-2.5">
      <div class="flex min-w-0 items-center gap-3">
        <img class="size-9 shrink-0 drop-shadow-[0_0_10px_var(--ember)]" src={flameIconUrl} alt="" />
        <h1 class="grid">
          <span class="display text-[19px] leading-6">Embervale</span>
          <span class="eyebrow">Tracker</span>
        </h1>
      </div>
      <div class="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div class="flex flex-wrap gap-x-6 gap-y-3">
          <Meter label={hasSave ? "Flames lit" : "Flames"} found={hasSave ? foundFlameCount.value : null} total={flameLocations.length} />
          <Meter label={hasSave ? "Spires active" : "Spires"} found={hasSave ? foundSpireCount.value : null} total={spireCount} />
          {hasSave ? (
            <button class="meter meter-button" aria-controls={regionPanelId} aria-expanded={!regionPanelMinimized.value} onClick={openRegionPanel}>
              <MeterContent label="Regions done" found={completeRegionCount.value} total={flameRegions.length} />
            </button>
          ) : (
            <Meter label="Regions" found={null} total={flameRegions.length} />
          )}
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <CharacterButton />
          <button class={`btn ${hasSave ? "btn-outline" : "btn-primary"}`} onClick={pickSaveFile}>
            Load save
          </button>
          <button class="btn btn-outline btn-icon" popovertarget="save-help" aria-label="Where to find the save file">
            ?
          </button>
          <SaveHelp />
          <a
            class="btn btn-quiet btn-icon"
            href="https://github.com/Hinneman/embervale-tracker"
            target="_blank"
            rel="noreferrer"
            aria-label="Source code on GitHub"
            title="Source code on GitHub"
          >
            <picture>
              <source srcset={githubDarkUrl} media="(prefers-color-scheme: light)" />
              <img class="size-4" src={githubWhiteUrl} alt="" />
            </picture>
          </a>
        </div>
      </div>
    </header>
  );
}

function SaveHelp() {
  return (
    <div id="save-help" popover class="save-help card card-accent menu-in">
      <h2 class="display mb-2 text-[15px]">Where to find your save</h2>
      <p class="mb-2">
        Load a <code>characterN.ksd</code> file. A <code>worldN.ksd</code> file does not hold character data.
      </p>
      <ul class="grid list-disc gap-1.5 pl-4">
        <li>
          <strong class="text-primary">Steam Cloud on (default):</strong> <code>&lt;Steam folder&gt;\userdata\&lt;YOUR_STEAM_ID&gt;\1203620\remote</code>, or
          download it from your{" "}
          <a href="https://store.steampowered.com/account/remotestorageapp/?appid=1203620" target="_blank" rel="noreferrer">
            Steam Cloud storage
          </a>
          .
        </li>
        <li>
          <strong class="text-primary">Steam Cloud off:</strong> <code>%userprofile%\Saved Games\keen games\Enshrouded</code>
        </li>
      </ul>
    </div>
  );
}

function LocationRow({ location }: { location: MapLocation }) {
  const state = stateOf(location);
  const found = isMuted(location.kind, state);

  return (
    <li>
      <button
        class={`location-row ${found ? "is-found" : ""}`}
        aria-current={selectedLocation.value === location}
        onClick={() => selectLocation(location, true)}
      >
        <KindIcon kind={location.kind} muted={found} class={`size-4.5 ${found ? "opacity-70" : ""}`} />
        <span>{shortName(location)}</span>
        {state !== "unknown" && <span class={`mark mark-${state}`} role="img" aria-label={state} />}
      </button>
    </li>
  );
}

function Filters() {
  return (
    <div class="grid gap-2.5 border-b border-line p-3.5">
      <div class="segmented" role="group" aria-label="Show">
        {listModes.map(({ value, label }) => (
          <button key={value} aria-pressed={listMode.value === value} onClick={() => (listMode.value = value)}>
            {label}
          </button>
        ))}
      </div>
      <div class="grid grid-cols-3 gap-1.5" role="group" aria-label="Types">
        {kindToggles.map(({ kind, label }) => (
          <button
            key={kind}
            class="toggle"
            aria-pressed={visibleKinds.value[kind]}
            onClick={() =>
              (visibleKinds.value = {
                ...visibleKinds.value,
                [kind]: !visibleKinds.value[kind],
              })
            }
          >
            <KindIcon kind={kind} class="size-4" />
            {label}
          </button>
        ))}
      </div>
      {unexploredFlameCount.value > 0 && (
        <button class="switch-row" aria-pressed={showUnexplored.value} onClick={() => (showUnexplored.value = !showUnexplored.value)}>
          {unexploredFlameCount.value === 1 ? "Show 1 flame" : `Show ${unexploredFlameCount.value} flames`} in unexplored areas
          <span class="switch" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

// The region's name with how many of its flames are lit: the same count as its ring on the map and in the region panel,
// whatever the filters show. Without a save it shows how many rows it lists. A region with only a spire has no flames to count.
function RegionHeading({ region, rowCount }: { region: string; rowCount: number }) {
  if (foundIds.value === null) {
    return (
      <h2 class="region-heading">
        <span class="flex items-baseline justify-between gap-3">
          <span class="region-name">{region}</span>
          <span class="eyebrow tabular-nums">{rowCount}</span>
        </span>
      </h2>
    );
  }

  const progress = regionProgress.value.find((entry) => entry.region === region);

  return (
    <h2 class="region-heading">
      <span class="flex items-baseline justify-between gap-3">
        <span class="region-name">{region}</span>
        {progress && (
          <span class="eyebrow tabular-nums">
            <Fraction part={progress.found} total={progress.total} spoken={`${progress.found} of ${progress.total} flames lit`} />
          </span>
        )}
      </span>
      {progress && <span class="bar" style={{ "--progress": progress.found / progress.total }} />}
    </h2>
  );
}

function Sidebar() {
  const rows = shownLocations.value;
  const showsMissing = listMode.value === "missing" && foundIds.value !== null;

  return (
    <aside class="flex min-h-0 flex-col border-line bg-sheet max-md:max-h-130 max-md:border-t md:order-first md:border-r" aria-label="Locations">
      <Filters />
      {/* Relative, so the absolutely placed sr-only text in the rows stays inside the scroller instead of stretching the page. */}
      <div class="relative min-h-0 flex-1 overflow-y-auto pb-2">
        {errorMessage.value && (
          <p role="alert" class="m-3 border-l-2 border-danger bg-(--danger-soft) px-3 py-2.5 text-sm leading-5 font-medium text-danger">
            {errorMessage}
          </p>
        )}
        {rows.length === 0 ? (
          <p class="px-4 py-6 text-sm leading-5 text-muted">
            {showsMissing ? "Nothing missing here. Every flame is lit and every spire is active." : "Turn on Shrines, Sanctums or Spires to see locations."}
          </p>
        ) : (
          <div>
            {[...Map.groupBy(rows, (location) => location.region)].map(([region, regionRows]) => (
              <section key={region} aria-label={region}>
                <RegionHeading region={region} rowCount={regionRows.length} />
                <ul class="grid">
                  {regionRows.map((location) => (
                    <LocationRow key={location.knowledgeId} location={location} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files") ?? false;

function Dropzone() {
  const visible = useSignal(false);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    // dragenter and dragleave fire for each child element, so a counter tracks when the drag leaves the window.
    let dragDepth = 0;

    window.addEventListener(
      "dragenter",
      (event) => {
        if (hasFiles(event)) {
          event.preventDefault();
          dragDepth++;
          visible.value = true;
        }
      },
      { signal },
    );
    window.addEventListener(
      "dragover",
      (event) => {
        if (hasFiles(event)) {
          event.preventDefault();
        }
      },
      { signal },
    );
    window.addEventListener(
      "dragleave",
      (event) => {
        if (hasFiles(event) && --dragDepth <= 0) {
          dragDepth = 0;
          visible.value = false;
        }
      },
      { signal },
    );
    window.addEventListener(
      "drop",
      (event) => {
        if (!hasFiles(event)) {
          return;
        }

        event.preventDefault();
        dragDepth = 0;
        visible.value = false;

        const file = event.dataTransfer?.files[0];
        if (file) {
          void loadSave(file);
        }
      },
      { signal },
    );

    return () => controller.abort();
  }, []);

  if (!visible.value) {
    return null;
  }

  return (
    <div class="fixed inset-0 z-100 grid place-items-center bg-overlay p-6">
      <div class="menu-in grid gap-2 rounded-[4px] border-[1.5px] border-dashed border-ember bg-sheet px-14 py-12 text-center shadow-[0_0_40px_-12px_var(--ember)]">
        <p class="display text-2xl">Drop your save to load it</p>
        <p class="eyebrow">characterN.ksd</p>
      </div>
    </div>
  );
}

export function App() {
  return (
    <div class="grid h-full grid-rows-[auto_minmax(0,1fr)] max-md:h-auto">
      <TopBar />
      <main class="grid min-h-0 md:grid-cols-[340px_minmax(0,1fr)]">
        <div class="relative max-md:h-[64vh] max-md:min-h-90">
          <MapView />
          <RegionPanel />
        </div>
        <Sidebar />
      </main>
      <CharacterList />
      <Dropzone />
      {/* Always in the page, so screen readers pick up each new message. */}
      <p class="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
