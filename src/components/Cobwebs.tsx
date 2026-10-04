// Decorative cobwebs in two corners of the join screen.
// Pure SVG, generated from a few numbers so the strands stay evenly spaced.

function web(size: number, spokes: number, rings: number) {
  // Web anchored at the top-left corner (0,0) fanning out over a quarter circle.
  const angles = Array.from({ length: spokes }, (_, i) => (i / (spokes - 1)) * (Math.PI / 2));
  const lines = angles.map((a) => `M0 0L${(Math.cos(a) * size).toFixed(1)} ${(Math.sin(a) * size).toFixed(1)}`);
  const strands: string[] = [];
  for (let r = 1; r <= rings; r++) {
    const radius = (r / rings) * size * 0.92;
    let d = "";
    for (let i = 0; i < angles.length; i++) {
      const x = Math.cos(angles[i]) * radius;
      const y = Math.sin(angles[i]) * radius;
      if (i === 0) {
        d += `M${x.toFixed(1)} ${y.toFixed(1)}`;
        continue;
      }
      // Each strand sags toward the corner between two spokes.
      const mid = (angles[i - 1] + angles[i]) / 2;
      const sag = radius * 0.82;
      d += `Q${(Math.cos(mid) * sag).toFixed(1)} ${(Math.sin(mid) * sag).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    strands.push(d);
  }
  return [...lines, ...strands].join("");
}

const BIG = web(230, 7, 6);
const SMALL = web(150, 6, 4);

export function Cobwebs() {
  return (
    <div className="cobwebs" aria-hidden="true">
      <svg className="web web-tr" viewBox="0 0 240 240">
        <g transform="translate(240 0) scale(-1 1)">
          <path d={BIG} fill="none" stroke="rgba(255,255,255,.2)" strokeWidth={1} />
        </g>
      </svg>
      <svg className="web web-bl" viewBox="0 0 160 160">
        <g transform="translate(0 160) scale(1 -1)">
          <path d={SMALL} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth={1} />
        </g>
      </svg>
    </div>
  );
}
