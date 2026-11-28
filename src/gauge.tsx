// A progress ring centred on 0,0, for use inside an SVG. It starts at the top and fills clockwise.
// A complete ring is filled and shows a check mark.
export function GaugeRing({ found, total, radius, class: className = "" }: { found: number; total: number; radius: number; class?: string }) {
  const progress = total ? found / total : 0;
  const complete = total > 0 && found === total;
  const check = radius * 0.45;

  return (
    <g class={`gauge ${complete ? "is-complete" : ""} ${className}`}>
      <circle class="gauge-track" r={radius} />
      {/* pathLength 1 makes the dash length the progress itself. */}
      <circle class="gauge-fill" r={radius} pathLength={1} stroke-dasharray={`${progress} 1`} transform="rotate(-90)" />
      {complete && <path class="gauge-check" d={`M${-check} 0l${check * 0.7} ${check * 0.7} ${check * 1.3}-${check * 1.4}`} />}
    </g>
  );
}

// The ring as its own image, for use in HTML.
export function Gauge({ found, total, size }: { found: number; total: number; size: number }) {
  const radius = size / 2 - 2;

  return (
    <svg class="shrink-0" width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} aria-hidden="true">
      <GaugeRing found={found} total={total} radius={radius} />
    </svg>
  );
}
