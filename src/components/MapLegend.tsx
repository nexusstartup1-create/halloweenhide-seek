"use client";
import { useState } from "react";
import { Sheet } from "./Panels";

export interface LegendTarget { lng: number; lat: number; zoom: number }
export type LegendTargets = Partial<Record<LegendId, LegendTarget>>;
type LegendId =
  | "quest" | "flash" | "zombie" | "reward" | "abandoned" | "done"
  | "me" | "partner" | "partnerOld" | "acc"
  | "zoneHot" | "zoneOld" | "ping" | "track" | "still"
  | "treasure" | "boundary" | "shrink" | "sectors";

interface Item { id: LegendId; title: string; text: string; icon: React.ReactNode }

/* ---------- small drawings of what's on the map ---------- */

const Gem = ({ c, beam = true, small = false }: { c: string; beam?: boolean; small?: boolean }) => (
  <svg viewBox="0 0 40 40" aria-hidden="true">
    <ellipse cx="20" cy="33" rx="15" ry="5" fill={c} opacity=".18" />
    <ellipse cx="20" cy="33" rx="11" ry="3.6" fill="none" stroke={c} strokeWidth="1.2" opacity=".7" />
    {beam && <rect x="18" y="0" width="4" height="24" fill={`url(#b${c.slice(1)})`} />}
    <defs>
      <linearGradient id={`b${c.slice(1)}`} x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor={c} stopOpacity=".9" /><stop offset="1" stopColor={c} stopOpacity="0" /></linearGradient>
    </defs>
    {small
      ? <path d="M20 22l4 5-4 5-4-5z" fill={c} stroke="#fff" strokeOpacity=".3" strokeWidth=".8" />
      : <path d="M20 12l7 8-7 8-7-8z" fill={c} stroke="#fff" strokeOpacity=".75" strokeWidth="1" />}
  </svg>
);

const Pumpkin = ({ eyes, faded = false }: { eyes: string; faded?: boolean }) => (
  <svg viewBox="0 0 40 40" aria-hidden="true" opacity={faded ? 0.35 : 1}>
    <ellipse cx="20" cy="34" rx="14" ry="4" fill={eyes} opacity=".25" />
    <path d="M20 9c1-3 3-4 5-4" stroke="#4a6b1f" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    <ellipse cx="20" cy="21" rx="13" ry="11" fill="#ff7a14" />
    <path d="M14 11c-3 3-3 17 0 20M26 11c3 3 3 17 0 20M20 10v22" stroke="#c4520a" strokeWidth="1" fill="none" opacity=".6" />
    <path d="M13 19l2.5-4 2.5 4zM22 19l2.5-4 2.5 4z" fill={eyes} />
    <path d="M12.5 23q7.5 7 15 0q-7.5 3-15 0z" fill={eyes} />
  </svg>
);

const Hunter = () => (
  <svg viewBox="0 0 40 40" aria-hidden="true">
    <path d="M20 30L38 22A20 20 0 0 1 38 38z" fill="#ffe3a0" opacity=".35" />
    <ellipse cx="20" cy="35" rx="9" ry="2.5" fill="#000" opacity=".6" />
    <path d="M12 35l2-14 2-6h8l2 6 2 14z" fill="#3a0c12" />
    <circle cx="20" cy="11" r="6.5" fill="#3a0c12" />
    <ellipse cx="20" cy="12" rx="4.3" ry="5" fill="#ebe5d2" />
    <ellipse cx="18.3" cy="11" rx="1" ry=".8" fill="#ff1a2a" />
    <ellipse cx="21.7" cy="11" rx="1" ry=".8" fill="#ff1a2a" />
    <path d="M18 8l1 1.2 1-1.2 1 1.2 1-1.2" stroke="#d0101e" strokeWidth=".9" fill="none" />
    <circle cx="11" cy="27" r="2.2" fill="#ffcf6a" />
    <path d="M29 22l2 9" stroke="#c9ced6" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const GhostIcon = () => (
  <svg viewBox="0 0 40 40" aria-hidden="true">
    <ellipse cx="20" cy="35" rx="12" ry="3.5" fill="#7dffb0" opacity=".3" />
    <path d="M10 30V16a10 10 0 0 1 20 0v14l-3.3-2.5-3.3 2.5-3.4-2.5-3.3 2.5-3.4-2.5z" fill="#eafff2" />
    <ellipse cx="16.5" cy="17" rx="1.6" ry="2.4" fill="#0d1016" />
    <ellipse cx="23.5" cy="17" rx="1.6" ry="2.4" fill="#0d1016" />
    <circle cx="20" cy="23" r="1.3" fill="#0d1016" />
  </svg>
);

const Partner = () => (
  <svg viewBox="0 0 40 40" aria-hidden="true">
    <rect x="18" y="0" width="4" height="22" fill="url(#pb)" />
    <defs><linearGradient id="pb" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#3ee0ff" /><stop offset="1" stopColor="#3ee0ff" stopOpacity="0" /></linearGradient></defs>
    <g transform="translate(6 12) scale(.7)"><Pumpkin eyes="#3ee0ff" /></g>
    <path d="M2 37h36" stroke="#3ee0ff" strokeWidth="2" strokeDasharray="4 3" />
  </svg>
);

const Disc = ({ c, ring = false, dashed = false }: { c: string; ring?: boolean; dashed?: boolean }) => (
  <svg viewBox="0 0 40 40" aria-hidden="true">
    <defs><radialGradient id={`d${c.slice(1)}`}><stop offset="0" stopColor={c} stopOpacity=".75" /><stop offset="1" stopColor={c} stopOpacity=".05" /></radialGradient></defs>
    <circle cx="20" cy="20" r="16" fill={`url(#d${c.slice(1)})`} />
    {ring && <circle cx="20" cy="20" r="16" fill="none" stroke={c} strokeWidth="1.5" strokeDasharray={dashed ? "3 3" : undefined} />}
  </svg>
);

const Square = ({ kind }: { kind: "ping" | "track" | "sectors" }) => (
  <svg viewBox="0 0 40 40" aria-hidden="true">
    <defs><pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="5" fill="#E50914" /></pattern></defs>
    <rect x="5" y="5" width="30" height="30" rx="2" fill={kind === "ping" ? "url(#hatch)" : "none"} opacity={kind === "ping" ? 0.8 : 1}
      stroke={kind === "ping" ? "#E50914" : kind === "track" ? "#fff" : "#9A938C"} strokeWidth={kind === "track" ? 3 : 1.5} strokeDasharray={kind === "sectors" ? "3 3" : undefined} />
    {kind === "sectors" && <text x="20" y="24" textAnchor="middle" fontSize="10" fontWeight="700" fill="#9A938C">C5</text>}
  </svg>
);

const Boundary = () => (
  <svg viewBox="0 0 40 40" aria-hidden="true"><path d="M3 30L12 8l16 3 9 19z" fill="none" stroke="#a970ff" strokeWidth="3" strokeLinejoin="round" /></svg>
);

const Shrink = () => (
  <svg viewBox="0 0 40 40" aria-hidden="true">
    <path d="M3 30L12 8l16 3 9 19z" fill="none" stroke="#a970ff" strokeWidth="2" strokeDasharray="3 3" strokeLinejoin="round" opacity=".4" />
    <path d="M11 26l5-11 9 2 5 9z" fill="none" stroke="#ff3a50" strokeWidth="3" strokeLinejoin="round" />
  </svg>
);

const Still = () => (
  <svg viewBox="0 0 40 40" aria-hidden="true">
    <circle cx="20" cy="20" r="14" fill="none" stroke="#FF6600" strokeWidth="1.5" strokeDasharray="3 3" />
    <circle cx="20" cy="20" r="7" fill="#FF6600" stroke="#0B0B0C" strokeWidth="2" />
  </svg>
);

/* ---------- content ---------- */

function sections(look: "fugitive" | "hunter" | "ghost") {
  const fugitive = look === "fugitive";
  const chase = look !== "fugitive";
  const s: { title: string; items: Item[] }[] = [];
  if (fugitive)
    s.push({
      title: "Missioni",
      items: [
        { id: "quest", title: "Missione", icon: <Gem c="#ff6a00" />, text: "Il faro si vede da lontano. Gli anelli mostrano l'area valida (40 m): entra lì e manda foto o video." },
        { id: "flash", title: "Missione lampo", icon: <Gem c="#ff2848" />, text: "Punti ×2 ancora per poco. Il faro lampeggia e gli anelli corrono più veloci." },
        { id: "zombie", title: "Sblocca Zombie", icon: <Gem c="#6dff7a" />, text: "Se la fate, sbloccate la carta Zombie: se vi prendono potete risorgere." },
        { id: "reward", title: "Sblocca una carta", icon: <Gem c="#b48cff" />, text: "Fatela per sbloccare Ghost Shield o Eco." },
        { id: "abandoned", title: "Posto abbandonato", icon: <Gem c="#c9b8ff" />, text: "Sfida dentro o fuori dall'edificio, decidete voi. Mai da soli." },
        { id: "treasure", title: "Tesoro", icon: <Gem c="#ffc928" />, text: "Compare ogni tanto in un posto pubblico e sparisce dopo qualche minuto. Il primo fuggiasco che ci arriva (30 m) prende i punti. Lo vedono anche i cercatori!" },
        { id: "done", title: "Già fatta", icon: <Gem c="#5a5a62" beam={false} small />, text: "La vostra coppia l'ha già completata: niente più punti qui." },
      ],
    });
  s.push({
    title: "Giocatori",
    items: [
      look === "hunter"
        ? { id: "me", title: "Tu, cercatore", icon: <Hunter />, text: "Maschera, machete e lanterna. La luce sulla strada indica dove stai camminando." }
        : look === "ghost"
          ? { id: "me", title: "Tu, fantasma", icon: <GhostIcon />, text: "Fluttui e catturi come un cercatore. La freccia davanti indica dove stai andando." }
          : { id: "me", title: "Tu", icon: <Pumpkin eyes="#ffd23a" />, text: "La tua zucca si gira e saltella verso dove cammini. La freccia davanti indica la direzione." },
      ...(fugitive
        ? [
            { id: "partner" as const, title: "Il tuo compagno", icon: <Partner />, text: "Zucca con gli occhi azzurri e faro azzurro. La linea tratteggiata va da te a lui, sotto il nome c'è la distanza." },
            { id: "partnerOld" as const, title: "Compagno non aggiornato", icon: <Pumpkin eyes="#3ee0ff" faded />, text: "Trasparente e senza faro: la sua posizione ha più di 2 minuti. Scrivigli o chiamalo." },
          ]
        : []),
      { id: "acc", title: "GPS impreciso", icon: <Disc c="#ffffff" ring />, text: "L'alone chiaro sotto di te: il telefono non sa bene dove sei, sei da qualche parte lì dentro. All'aperto migliora." },
    ],
  });
  if (chase)
    s.push({
      title: "Caccia",
      items: [
        { id: "zoneHot", title: "Zona fuggiasco recente", icon: <Disc c="#ff2030" />, text: "Un fuggiasco è da qualche parte nel cerchio, non al centro. Rosso acceso: posizione fresca." },
        { id: "zoneOld", title: "Zona che si raffredda", icon: <Disc c="#3a6bff" />, text: "Passa da rosso ad arancione e poi a blu in circa 3 minuti: più è blu, più il fuggiasco può essersi spostato." },
        { id: "ping", title: "Settore pingato", icon: <Square kind="ping" />, text: "Un ping ha trovato fuggiaschi in questo settore. Il numero dice quanti." },
        { id: "track", title: "Settore tracciato", icon: <Square kind="track" />, text: "Settore seguito con la carta Traccia: il conteggio si aggiorna finché dura." },
        { id: "still", title: "Fuggiasco fermo", icon: <Still />, text: "Un fuggiasco che non si muove da 10 minuti compare qui, nel punto esatto, per 45 secondi. Corri!" },
        { id: "treasure", title: "Tesoro", icon: <Gem c="#ffc928" />, text: "I fuggiaschi ci correranno per prendere i punti: aspettali lì." },
      ],
    });
  s.push({
    title: "Zona di gioco",
    items: [
      { id: "boundary", title: "Confine", icon: <Boundary />, text: "Linea viola: il limite del gioco. Se esci hai 60 secondi per rientrare." },
      { id: "shrink", title: "Zona che si restringe", icon: <Shrink />, text: "Negli ultimi 15 minuti il confine si stringe verso il centro: vale la linea rossa. Fuori per più di 60 s e vieni segnalato." },
      { id: "sectors", title: "Settori C1–C9", icon: <Square kind="sectors" />, text: "La zona è divisa in 9 settori. Li usano i ping e le carte." },
    ],
  });
  return s;
}

/** "Legenda" button on the map; opens a sheet where every symbol explains itself and can be found on the map. */
export function MapLegend({ look, targets, onFocus }: { look: "fugitive" | "hunter" | "ghost"; targets: LegendTargets; onFocus: (t: LegendTarget) => void }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<LegendId | null>(null);
  return (
    <>
      <button type="button" className="chip glass lgbtn" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span aria-hidden="true">?</span> Legenda
      </button>
      {open && (
        <Sheet title="Cosa c'è sulla mappa" onClose={() => setOpen(false)}>
          <div className="lglist">
            {sections(look).map((sec) => (
              <section key={sec.title}>
                <h3>{sec.title}</h3>
                {sec.items.map((it) => {
                  const on = sel === it.id;
                  const t = targets[it.id];
                  return (
                    <div key={it.id} className={`lgrow ${on ? "on" : ""}`}>
                      <button type="button" className="lghead" aria-expanded={on} onClick={() => setSel(on ? null : it.id)}>
                        <span className="lgicon">{it.icon}</span>
                        <b>{it.title}</b>
                        {t && <span className="lgdot" aria-label="Presente sulla mappa" />}
                        <span className="lgchev" aria-hidden="true">›</span>
                      </button>
                      {on && (
                        <div className="lgbody">
                          <p>{it.text}</p>
                          {t && (
                            <button type="button" className="btn a sm" onClick={() => { setOpen(false); onFocus(t); }}>
                              Mostra sulla mappa
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
          <p className="muted small">Il pallino verde accanto a un simbolo vuol dire che adesso è sulla mappa.</p>
          <p className="muted small lgcredit">
            Modello 3D del cercatore:{" "}
            <a href="https://sketchfab.com/3d-models/jason-108997898ac241ccb1ee509120e6bb46" target="_blank" rel="noreferrer">“jason”</a> di{" "}
            <a href="https://sketchfab.com/skull-gamer" target="_blank" rel="noreferrer">skull-GamerYT</a>, licenza{" "}
            <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> (corpo e scheletro; maschera, tunica e machete ridisegnati per Night Hunt).
          </p>
        </Sheet>
      )}
    </>
  );
}
