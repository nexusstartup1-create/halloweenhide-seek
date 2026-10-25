"use client";

/**
 * Back of the role card, like a collectible card: ornate double frame with corner pieces, a diamond
 * lattice, a full moon with the hooded hunter's silhouette (red eyes) and a "NIGHT HUNT" ribbon.
 * Stars twinkle and a foil sheen sweeps across while it waits to be turned (CSS in globals.css).
 */
export function CardBack({ ready, label }: { ready: boolean; label: string }) {
  return (
    <svg className="cb-art" viewBox="0 0 250 350" aria-hidden="true">
      <defs>
        <radialGradient id="cbBg" cx="50%" cy="42%" r="75%">
          <stop offset="0" stopColor="#3b1675" />
          <stop offset="0.6" stopColor="#1c0b38" />
          <stop offset="1" stopColor="#0c0518" />
        </radialGradient>
        <radialGradient id="cbMoon" cx="42%" cy="38%" r="60%">
          <stop offset="0" stopColor="#fbf6e4" />
          <stop offset="0.7" stopColor="#d9d2b6" />
          <stop offset="1" stopColor="#a39b80" />
        </radialGradient>
        <radialGradient id="cbHalo" cx="50%" cy="50%" r="50%">
          <stop offset="0.55" stopColor="#c9b8ff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#c9b8ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="cbGold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e9d8ff" />
          <stop offset="0.5" stopColor="#a970ff" />
          <stop offset="1" stopColor="#5b2bb0" />
        </linearGradient>
        <linearGradient id="cbRibbon" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8cf25a" />
          <stop offset="1" stopColor="#3f9a2c" />
        </linearGradient>
        <pattern id="cbLattice" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 0H18M0 0V18" stroke="#a970ff" strokeOpacity="0.16" strokeWidth="1" />
          <circle cx="9" cy="9" r="0.9" fill="#c9b8ff" fillOpacity="0.25" />
        </pattern>
        <clipPath id="cbMoonClip"><circle cx="125" cy="158" r="58" /></clipPath>
      </defs>

      {/* Card body and lattice */}
      <rect x="0" y="0" width="250" height="350" rx="18" fill="url(#cbBg)" />
      <rect x="14" y="14" width="222" height="322" rx="10" fill="url(#cbLattice)" />

      {/* Double frame */}
      <rect x="7" y="7" width="236" height="336" rx="14" fill="none" stroke="url(#cbGold)" strokeWidth="3" />
      <rect x="15" y="15" width="220" height="320" rx="9" fill="none" stroke="#a970ff" strokeOpacity="0.55" strokeWidth="1" strokeDasharray="2 4" />

      {/* Corner pieces: a little diamond with curls */}
      {[[26, 26, 0], [224, 26, 90], [224, 324, 180], [26, 324, 270]].map(([x, y, r]) => (
        <g key={`${x}-${y}`} transform={`translate(${x} ${y}) rotate(${r})`}>
          <path d="M0 -7L7 0L0 7L-7 0Z" fill="url(#cbGold)" />
          <path d="M9 0 C 18 0 22 -6 18 -11 M0 9 C 0 18 -6 22 -11 18" fill="none" stroke="#c9b8ff" strokeOpacity="0.8" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="0" cy="0" r="2" fill="#0c0518" />
        </g>
      ))}

      {/* Stars */}
      {[[52, 70, 1.6, 0], [196, 62, 1.2, 0.8], [70, 250, 1.1, 1.6], [186, 236, 1.5, 0.4], [40, 160, 1, 1.2], [212, 150, 1.2, 2]].map(([x, y, r, d]) => (
        <circle key={`${x}-${y}`} className="cb-star" cx={x} cy={y} r={r} fill="#fff" style={{ animationDelay: `${d}s` }} />
      ))}

      {/* Full moon with its halo */}
      <circle cx="125" cy="158" r="84" fill="url(#cbHalo)" />
      <circle cx="125" cy="158" r="58" fill="url(#cbMoon)" />
      <g fill="#8f8770" opacity="0.35">
        <circle cx="104" cy="140" r="9" /><circle cx="142" cy="128" r="6" /><circle cx="150" cy="176" r="11" /><circle cx="112" cy="182" r="5" />
      </g>

      {/* Bare branch across the moon */}
      <path d="M58 104 C 86 112 98 118 120 108 M88 112 C 92 100 100 94 108 92 M100 116 C 104 124 112 128 118 128" fill="none" stroke="#120720" strokeWidth="2.6" strokeLinecap="round" />

      {/* Hooded hunter rising from the bottom of the moon */}
      <g clipPath="url(#cbMoonClip)">
        <path d="M125 138 C 104 138 94 158 94 178 C 82 184 72 200 70 216 L 180 216 C 178 200 168 184 156 178 C 156 158 146 138 125 138 Z" fill="#0c0518" />
        <ellipse cx="125" cy="168" rx="16" ry="20" fill="#05020a" />
      </g>
      <circle className="cb-eye" cx="118" cy="166" r="2.4" fill="#ff2a3a" />
      <circle className="cb-eye" cx="132" cy="166" r="2.4" fill="#ff2a3a" />

      {/* Question mark seal */}
      <g transform="translate(125 238)">
        <circle r="17" fill="#0c0518" stroke="url(#cbGold)" strokeWidth="2" />
        <text y="7" textAnchor="middle" fontSize="22" fontWeight="900" fill={ready ? "#8cf25a" : "#7a6a9a"}>?</text>
      </g>

      {/* Ribbon with the name */}
      <g transform="translate(125 278)">
        <path d="M-92 -12 L-80 -12 L-80 12 L-92 12 L-86 0 Z M92 -12 L80 -12 L80 12 L92 12 L86 0 Z" fill="#2b6b1f" />
        <rect x="-82" y="-14" width="164" height="28" rx="3" fill="url(#cbRibbon)" />
        <text y="6" textAnchor="middle" fontSize="16" fontWeight="900" letterSpacing="4" fill="#0c0518">NIGHT HUNT</text>
      </g>

      {/* Call to action, between the bottom corners */}
      <text className={ready ? "cb-cta" : undefined} x="125" y="316" textAnchor="middle" fontSize="9.5" fontWeight="800" letterSpacing="2" fill={ready ? "#8cf25a" : "#9a8cb8"}>{label.toUpperCase()}</text>
    </svg>
  );
}
