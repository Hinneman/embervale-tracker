import flameIconUrl from "./assets/flame-shrine.png";
import type { LocationKind } from "./locations.ts";

// An obelisk with a glowing tip, drawn around (0, 0) in a 24 by 24 box. The game has no spire icon to use.
const spireOutline = "M0 -11.5 L4.25 -4 L3.5 10.5 L-3.5 10.5 L-4.25 -4 Z";
const spireTip = "M0 -11.5 L2.4 -7.25 L0 -5.5 L-2.4 -7.25 Z";

// The marker shape of a location kind, centred on (0, 0), for use inside an SVG.
export function KindShape({ kind, size, class: className }: { kind: LocationKind; size: number; class?: string }) {
  if (kind === "spire") {
    return (
      <g class={className} transform={`scale(${size / 24})`}>
        <path d={spireOutline} class="spire-body" />
        <path d={spireTip} class="spire-tip" />
      </g>
    );
  }

  return <image class={className} href={flameIconUrl} x={-size / 2} y={-size / 2} width={size} height={size} />;
}

// The same shape as a small inline icon, for lists.
export function KindIcon({ kind, class: className }: { kind: LocationKind; class?: string }) {
  if (kind === "spire") {
    return (
      <svg class={className} viewBox="-12 -12 24 24" aria-hidden="true">
        <KindShape kind="spire" size={24} />
      </svg>
    );
  }

  return <img class={className} src={flameIconUrl} alt="" />;
}
