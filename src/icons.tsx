import spireIconUrl from "./assets/ancient-spire.png";
import flameMutedIconUrl from "./assets/flame-shrine-muted.png";
import flameIconUrl from "./assets/flame-shrine.png";
import type { LocationKind } from "./locations.ts";

// The game's map marker icons. A found flame uses the game's grey variant. A spire always keeps its colour,
// because it is a landmark that shows where the flames are, not something to find.
const iconUrl = (kind: LocationKind, muted: boolean) => (kind === "spire" ? spireIconUrl : muted ? flameMutedIconUrl : flameIconUrl);

// Whether a location's icon is shown greyed out.
export const isMuted = (kind: LocationKind, state: string) => kind !== "spire" && state === "found";

// The marker icon of a location kind, centred on (0, 0), for use inside an SVG.
export function KindShape({ kind, size, muted = false, class: className }: { kind: LocationKind; size: number; muted?: boolean; class?: string }) {
  return <image class={className} href={iconUrl(kind, muted)} x={-size / 2} y={-size / 2} width={size} height={size} />;
}

// The same icon as a small inline image, for lists.
export function KindIcon({ kind, muted = false, class: className }: { kind: LocationKind; muted?: boolean; class?: string }) {
  return <img class={className} src={iconUrl(kind, muted)} alt="" />;
}
