"use client";
import { useEffect, useRef, useState } from "react";
import { bearing, compass, distanceM } from "@/lib/geo";
import { HoldButton } from "./HoldButton";
import { Sheet } from "./Panels";
import type { Fix, GameState } from "./types";
import { ago, post } from "./util";

type Toast = (text: string, bad?: boolean) => void;
type Sos = GameState["sos"][number];

const vibrateAlarm = () => {
  try { navigator.vibrate?.([700, 200, 700, 200, 700]); } catch {}
};

/** Red SOS button in the top bar: opens a sheet where you hold to send. */
export function SosButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className="iconbtn sosbtn" onClick={onOpen} aria-label="SOS: chiedi aiuto" title="SOS">
      SOS
    </button>
  );
}

export function SosSheet({ fix, onClose, onSent, toast }: { fix: Fix | null; onClose: () => void; onSent: () => void; toast: Toast }) {
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      await post("/api/sos", { action: "send", lat: fix?.lat, lng: fix?.lng, acc: fix?.acc });
      onSent();
      onClose();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet title="Chiedi aiuto" onClose={onClose}>
      <p className="sos-lead">
        Ti sei fatto male, ti sei perso, qualcuno ti dà fastidio o non ti senti sicuro? Manda l&apos;SOS: <b>tutti</b> ricevono un
        avviso con la tua <b>posizione esatta</b> e la partita va in pausa.
      </p>
      <HoldButton label={busy ? "Invio…" : "Tieni premuto 2 secondi per mandare l'SOS"} onFire={send} disabled={busy} ms={2000} />
      {!fix && <p className="muted small">GPS non ancora pronto: verrà usata l&apos;ultima posizione nota.</p>}
      <a className="btn sos-112" href="tel:112">📞 Emergenza vera? Chiama il 112</a>
    </Sheet>
  );
}

function Where({ sos, fix, now }: { sos: Sos; fix: Fix | null; now: number }) {
  if (sos.lat == null || sos.lng == null) return <p className="muted">Posizione non disponibile.</p>;
  const d = fix ? Math.round(distanceM(fix.lat, fix.lng, sos.lat, sos.lng)) : null;
  const dir = fix ? compass(bearing(fix.lat, fix.lng, sos.lat, sos.lng)) : null;
  return (
    <>
      {d != null && <div className="sos-dist"><b>{d < 1000 ? `${d} m` : `${(d / 1000).toFixed(1)} km`}</b> verso {dir}</div>}
      <p className="muted small">
        Posizione aggiornata {sos.fixAt ? ago(now - Date.parse(sos.fixAt)) : "—"}{sos.acc ? ` · precisione ±${Math.round(sos.acc)} m` : ""}
      </p>
      <a className="btn a" href={`https://www.google.com/maps/dir/?api=1&destination=${sos.lat},${sos.lng}&travelmode=walking`} target="_blank" rel="noreferrer">
        🧭 Portami da {sos.name}
      </a>
    </>
  );
}

/**
 * Open SOS calls. Others get a full-screen alert (once per call, then a banner); whoever sent it sees
 * who's coming, a 112 button and "I'm fine".
 */
export function SosLayer({ s, fix, refresh, toast }: { s: GameState; fix: Fix | null; refresh: () => void; toast: Toast }) {
  const [hidden, setHidden] = useState<number[]>([]);
  const seen = useRef(new Set<number>());
  const isHost = s.game.hostId === s.me.id;

  // A new SOS from someone else: buzz, and show it even if it was hidden before.
  useEffect(() => {
    for (const x of s.sos) {
      if (seen.current.has(x.id)) continue;
      seen.current.add(x.id);
      if (!x.mine) vibrateAlarm();
    }
  }, [s.sos]);

  const act = async (action: "coming" | "resolve", id: number) => {
    try {
      await post("/api/sos", { action, id });
      if (action === "coming") toast("Hanno saputo che stai arrivando.");
      refresh();
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  const open = s.sos.find((x) => !hidden.includes(x.id));
  const banners = s.sos.filter((x) => hidden.includes(x.id));
  const meComing = (x: Sos) => x.responders.includes(s.me.name);

  return (
    <>
      {banners.length > 0 && (
        <div className="sos-banners">
          {banners.map((x) => (
            <button key={x.id} type="button" className="sos-banner" onClick={() => setHidden((h) => h.filter((i) => i !== x.id))}>
              🆘 {x.mine ? "Il tuo SOS è attivo" : `SOS · ${x.name}`} <span>Apri</span>
            </button>
          ))}
        </div>
      )}
      {open && (
        <div className="sos-full" role="alertdialog" aria-label={`SOS di ${open.name}`}>
          <div className="sos-card">
            <div className="sos-siren" aria-hidden="true">🆘</div>
            {open.mine ? (
              <>
                <h2>SOS inviato</h2>
                <p>Tutti sanno dove sei e la partita è in pausa. Resta dove sei se puoi, e tieni il telefono acceso.</p>
                <a className="btn sos-112" href="tel:112">📞 Chiama il 112</a>
              </>
            ) : (
              <>
                <h2>{open.name} ha bisogno di aiuto</h2>
                <p className="muted small">SOS mandato {ago(s.serverNow - Date.parse(open.at))}. La partita è in pausa.</p>
                <Where sos={open} fix={fix} now={s.serverNow} />
                {!meComing(open) && <button type="button" className="btn" onClick={() => act("coming", open.id)}>🏃 Sto arrivando</button>}
              </>
            )}
            {open.responders.length > 0 && <p className="sos-coming">In arrivo: <b>{open.responders.join(", ")}</b></p>}
            {(open.mine || isHost) && (
              <button type="button" className="btn sos-ok" onClick={() => act("resolve", open.id)}>
                {open.mine ? "✅ Sto bene, chiudi l'SOS" : "✅ Risolto, chiudi l'SOS"}
              </button>
            )}
            <button type="button" className="sos-hide" onClick={() => setHidden((h) => [...h, open.id])}>Nascondi (resta in alto)</button>
          </div>
        </div>
      )}
    </>
  );
}
