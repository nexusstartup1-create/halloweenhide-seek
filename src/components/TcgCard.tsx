"use client";
import { useRef, useState } from "react";
import type { Card } from "./types";
import { CARD_INFO, clock } from "./util";

/*
  Trading-card look for the deck: faction frame, name bar, art window, type line, ability box,
  stat row, flavour text, set number and rarity, with a holographic foil on rare cards.
  Art is loaded from /cards/<code>.webp (generated with Gemini); a vector emblem is drawn until it exists.
*/

type Faction = "FUGITIVE" | "HUNTER" | "GHOST";
type Rarity = "comune" | "non comune" | "rara";

interface Meta { faction: Faction; type: string; ability: string; flavor: string; rarity: Rarity; no: number; file: string }

export const CARD_META: Record<Card["code"], Meta> = {
  GHOST_SHIELD: { faction: "FUGITIVE", type: "Difesa", ability: "Velo Spettrale", flavor: "Le mani dei cercatori lo attraversano come nebbia d'ottobre.", rarity: "rara", no: 1, file: "ghost_shield" },
  NEBBIA: { faction: "FUGITIVE", type: "Occultamento", ability: "Coltre di Nebbia", flavor: "Sotto i portici della Cirenaica la nebbia sa tenere i segreti.", rarity: "non comune", no: 2, file: "nebbia" },
  ECO: { faction: "FUGITIVE", type: "Inganno", ability: "Doppio Fantasma", flavor: "Il radar sente un passo. Ma di chi?", rarity: "non comune", no: 3, file: "eco" },
  RADAR_PING: { faction: "HUNTER", type: "Ricerca", ability: "Sonar del Pipistrello", flavor: "Ogni battito d'ali torna indietro con un nome.", rarity: "comune", no: 4, file: "radar_ping" },
  TRACCIA: { faction: "HUNTER", type: "Inseguimento", ability: "Impronte Fresche", flavor: "Il selciato bagnato ricorda ogni passo.", rarity: "non comune", no: 5, file: "traccia" },
  SUSSURRO: { faction: "GHOST", type: "Spionaggio", ability: "Voce dall'Aldilà", flavor: "I morti non tradiscono. Sussurrano soltanto.", rarity: "rara", no: 6, file: "sussurro" },
};

const FACTION_LABEL: Record<Faction, string> = { FUGITIVE: "Fuggiasco", HUNTER: "Cercatore", GHOST: "Fantasma" };
const RARITY_MARK: Record<Rarity, string> = { comune: "●", "non comune": "◆", rara: "★" };
const STATE_LABEL = { READY: "Pronta", ACTIVE: "Attiva", COOLDOWN: "Ricarica", SPENT: "Usata", LOCKED: "Bloccata" } as const;

function mins(s: number) {
  if (s <= 0) return "—";
  return s % 60 === 0 ? `${s / 60} min` : `${Math.round(s / 60)} min`;
}

/** Placeholder art: night sky, rooftops and a faction emblem. */
function Emblem({ code }: { code: Card["code"] }) {
  const glyph: Record<Card["code"], React.ReactNode> = {
    GHOST_SHIELD: (
      <g>
        <path d="M60 20C44 20 33 32 33 48v32q6.75 8 13.5 0q6.75 8 13.5 0q6.75 8 13.5 0q6.75 8 13.5 0V48C87 32 76 20 60 20z" />
        <path d="M24 50c-6 4-6 12 0 16M96 50c6 4 6 12 0 16" fill="none" strokeWidth="4" strokeLinecap="round" opacity=".7" />
        <ellipse cx="51" cy="47" rx="4.5" ry="6" className="eye" />
        <ellipse cx="69" cy="47" rx="4.5" ry="6" className="eye" />
        <path d="M53 60q7 5 14 0" fill="none" strokeWidth="3" strokeLinecap="round" className="eye-line" />
      </g>
    ),
    NEBBIA: <path d="M26 58h68M20 68h80M30 78h60M38 48h44" strokeWidth="6" strokeLinecap="round" fill="none" />,
    ECO: <g><circle cx="44" cy="52" r="10" /><path d="M34 82c0-12 4-18 10-18s10 6 10 18z" /><path d="M70 40a24 24 0 010 36M80 32a36 36 0 010 52" strokeWidth="5" fill="none" strokeLinecap="round" /></g>,
    RADAR_PING: (
      <g>
        <circle cx="60" cy="54" r="30" fill="none" strokeWidth="2.5" opacity=".75" />
        <circle cx="60" cy="54" r="42" fill="none" strokeWidth="1.5" opacity=".45" />
        <path d="M57 52 L20 40 L28 52 L18 61 L33 60 L39 71 L57 61 Z" />
        <path d="M63 52 L100 40 L92 52 L102 61 L87 60 L81 71 L63 61 Z" />
        <ellipse cx="60" cy="57" rx="7" ry="12" />
        <path d="M54 48 L55 39 L59 46 Z M66 48 L65 39 L61 46 Z" />
      </g>
    ),
    TRACCIA: <g><ellipse cx="42" cy="76" rx="7" ry="10" /><ellipse cx="62" cy="58" rx="7" ry="10" /><ellipse cx="80" cy="40" rx="7" ry="10" /><circle cx="60" cy="56" r="34" fill="none" strokeWidth="3" /><path d="M60 16v14M60 82v14M20 56h14M86 56h14" strokeWidth="3" /></g>,
    SUSSURRO: <g><path d="M40 30c-10 0-16 8-16 18v34l6-4 6 4 6-4 6 4V48c0-10-6-18-14-18z" /><path d="M62 46c8 0 14 4 22 4M62 56c10 0 18 2 30 0M62 66c8 0 14-2 22-4" strokeWidth="4" fill="none" strokeLinecap="round" /></g>,
  };
  return (
    <svg viewBox="0 0 120 90" className="tcg-emblem" aria-hidden="true">
      <circle cx="96" cy="18" r="9" className="moon" />
      <path d="M0 90V70l10-6 8 4V58l12-8 10 8v8l10-4 8 6V60l14-10 14 10v10l10-6 12 8V90z" className="roofs" />
      <g className="glyph">{glyph[code]}</g>
    </svg>
  );
}

function Art({ code }: { code: Card["code"] }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <Emblem code={code} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/cards/${CARD_META[code].file}.webp`} alt="" onError={() => setFailed(true)} draggable={false} />
  );
}

export function TcgCard({ card, now, size = "small", onClick, selected }: {
  card: Card; now: number; size?: "small" | "large"; onClick?: () => void; selected?: boolean;
}) {
  const info = CARD_INFO[card.code];
  const meta = CARD_META[card.code];
  const ref = useRef<HTMLDivElement>(null);
  const timer =
    card.state === "ACTIVE" && card.activeUntil ? clock(+new Date(card.activeUntil) - now)
    : card.state === "COOLDOWN" && card.cooldownUntil ? clock(+new Date(card.cooldownUntil) - now)
    : null;

  // Large card tilts and moves its foil with the finger.
  const move = (e: React.PointerEvent) => {
    if (size !== "large" || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    ref.current.style.setProperty("--mx", `${x * 100}%`);
    ref.current.style.setProperty("--my", `${y * 100}%`);
    ref.current.style.setProperty("--rx", `${(0.5 - y) * 14}deg`);
    ref.current.style.setProperty("--ry", `${(x - 0.5) * 18}deg`);
  };
  const reset = () => {
    ref.current?.style.removeProperty("--rx");
    ref.current?.style.removeProperty("--ry");
  };

  const body = (
    <div
      ref={ref}
      className={`tcg ${size} f-${meta.faction} s-${card.state} ${meta.rarity === "rara" ? "holo" : ""} ${selected ? "sel" : ""}`}
      onPointerMove={move}
      onPointerLeave={reset}
    >
      <div className="tcg-inner">
        <div className="tcg-head">
          <span className="tcg-name">{info.name}</span>
          <span className="tcg-power">{info.durationS > 0 ? mins(info.durationS).replace(" min", "′") : "⚡"}</span>
        </div>
        <div className="tcg-art">
          <Art code={card.code} />
          {card.state !== "READY" && (
            <span className="tcg-state">{STATE_LABEL[card.state]}{timer ? ` · ${timer}` : ""}</span>
          )}
          {card.state === "SPENT" && <span className="tcg-stamp">Usata</span>}
        </div>
        <div className="tcg-type">
          {FACTION_LABEL[meta.faction]} · {meta.type}
          <span className="tcg-uses">{card.usesLeft == null ? "∞" : `×${card.usesLeft}`}</span>
        </div>
        {size === "large" ? (
          <>
            <div className="tcg-ability">
              <b>{meta.ability}</b>
              <span>{info.effect}</span>
            </div>
            <div className="tcg-stats">
              <span><i>Durata</i>{info.durationS > 0 ? mins(info.durationS) : "Istantanea"}</span>
              <span><i>Ricarica</i>{mins(info.cooldownS)}</span>
              <span><i>Usi</i>{card.usesLeft == null ? "Illimitati" : card.usesLeft}</span>
            </div>
            <p className="tcg-flavor">{meta.flavor}</p>
          </>
        ) : (
          <div className="tcg-ability mini"><b>{meta.ability}</b></div>
        )}
        <div className="tcg-foot">
          <span>Cirenaica Night Hunt · 2026</span>
          <span>{String(meta.no).padStart(3, "0")}/006 {RARITY_MARK[meta.rarity]}</span>
        </div>
      </div>
      <i className="tcg-foil" aria-hidden="true" />
    </div>
  );

  return onClick ? (
    <button type="button" className="tcg-btn" onClick={onClick} aria-label={`${info.name}, ${STATE_LABEL[card.state]}`}>{body}</button>
  ) : body;
}
