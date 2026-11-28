import spireMarkerUrl from "./assets/ancient-spire-marker.png";
import spireIconUrl from "./assets/ancient-spire.png";
import flameMarkerUrl from "./assets/flame-shrine-marker.png";
import flameMutedMarkerUrl from "./assets/flame-shrine-muted-marker.png";
import flameMutedIconUrl from "./assets/flame-shrine-muted.png";
import flameIconUrl from "./assets/flame-shrine.png";
import type { LocationKind } from "./locations.ts";

// The game's map marker icons. A found flame uses the game's grey variant. A spire always keeps its colour,
// because it is a landmark that shows where the flames are, not something to find.
const iconUrl = (kind: LocationKind, muted: boolean) => (kind === "spire" ? spireIconUrl : muted ? flameMutedIconUrl : flameIconUrl);

// The same icons with their drop shadow baked in, for the map. An SVG filter shadow on each marker
// made the map take seconds to draw in browsers without graphics acceleration.
const markerUrl = (kind: LocationKind, muted: boolean) => (kind === "spire" ? spireMarkerUrl : muted ? flameMutedMarkerUrl : flameMarkerUrl);

// The marker PNGs are 24 units of icon plus 3 units of shadow margin on each side.
const markerExtent = (24 + 2 * 3) / 24;

// Whether a location's icon is shown greyed out.
export const isMuted = (kind: LocationKind, state: string) => kind !== "spire" && state === "found";

// The marker icon of a location kind with its shadow, centred on (0, 0), for use inside an SVG.
export function KindShape({ kind, size, muted = false, class: className }: { kind: LocationKind; size: number; muted?: boolean; class?: string }) {
  const extent = size * markerExtent;
  return <image class={className} href={markerUrl(kind, muted)} x={-extent / 2} y={-extent / 2} width={extent} height={extent} />;
}

// The same icon as a small inline image, for lists.
export function KindIcon({ kind, muted = false, class: className }: { kind: LocationKind; muted?: boolean; class?: string }) {
  return <img class={className} src={iconUrl(kind, muted)} alt="" />;
}
