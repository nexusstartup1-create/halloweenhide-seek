"use client";
import { useMemo, useState } from "react";
import MapView, { type MapPoint } from "./MapView";
import type { GameState } from "./types";
import { post } from "./util";

type Toast = (text: string, bad?: boolean) => void;

/** Scary ready-made lines (Halloween horror register, not a real-world threat). */
const TEMPLATES = [
  "TI VEDO. NON PUOI NASCONDERTI.",
  "SEI STATO SCELTO DAL KILLER. 🔪",
  "SO DOVE SEI. STO ARRIVANDO.",
  "DIETRO DI TE. GIRATI. 👁️",
  "QUESTA NOTTE NON FINISCE BENE PER TE.",
];

function freshness(fixAt: string | null, now: number) {
  if (!fixAt) return "mai";
  const s = Math.round((now - +new Date(fixAt)) / 1000);
  if (s < 60) return `${s}s fa`;
  if (s < 3600) return `${Math.floor(s / 60)} min fa`;
  return `${Math.floor(s / 3600)} h fa`;
}

/** The hidden phantom: sees everyone live on the map, picks a victim, sends a full-screen apparition. */
export function PhantomView({ s, now, refresh, toast }: { s: GameState; now: number; refresh: () => void; toast: Toast }) {
  const ph = s.phantom!;
  const [target, setTarget] = useState<string | null>(null);
  const [text, setText] = useState(TEMPLATES[0]);
  const [busy, setBusy] = useState(false);

  const points = useMemo<MapPoint[]>(
    () =>
      ph.people
        .filter((p) => p.lat != null && p.lng != null)
        .map((p) => ({
          id: p.id,
          lat: p.lat!,
          lng: p.lng!,
          kind: p.role === "HUNTER" ? "hunter" : p.status === "CAPTURED" ? "captured" : "fugitive",
          label: p.id === target ? `🎯 ${p.name}` : p.name,
          fixAt: p.fixAt,
        })),
    [ph.people, target],
  );

  const victim = ph.people.find((p) => p.id === target) ?? null;

  const scare = async () => {
    if (!target) { toast("Scegli prima chi spaventare.", true); return; }
    if (!text.trim()) { toast("Scrivi il messaggio.", true); return; }
    setBusy(true);
    try {
      const r = await post<{ name: string }>("/api/scare", { targetId: target, text });
      toast(`💀 Spavento mandato a ${r.name}.`);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
      refresh();
    }
  };

  return (
    <div className="shell phantom">
      <main className="main flush">
        <MapView boundary={ph.boundary} points={points} />
      </main>

      <header className="topbar glass">
        <span className="who">
          <b>👻 Ombra</b>
          <span>Invisibile · {ph.people.length} in mappa · {ph.phase === "LIVE" ? "caccia aperta" : ph.phase.toLowerCase()}</span>
        </span>
      </header>

      <div className="phantom-panel glass">
        <div className="lbl">Chi è in giro ({ph.people.length})</div>
        <div className="phantom-list">
          {ph.people.length === 0 && <span className="muted small">Nessuno ha ancora mandato la posizione.</span>}
          {ph.people.map((p) => (
            <button
              type="button"
              key={p.id}
              className={`phantom-row ${p.id === target ? "sel" : ""}`}
              onClick={() => setTarget(p.id)}
            >
              <span className="row" style={{ gap: 8, justifyContent: "flex-start", minWidth: 0 }}>
                <i className={`dotrole ${p.role === "HUNTER" ? "h" : p.status === "CAPTURED" ? "g" : "f"}`} />
                <b style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</b>
              </span>
              <span className="small muted">{freshness(p.fixAt, now)}</span>
            </button>
          ))}
        </div>

        <div className="lbl" style={{ marginTop: 10 }}>Messaggio a tutto schermo {victim ? `· per ${victim.name}` : ""}</div>
        <div className="phantom-templates">
          {TEMPLATES.map((t) => (
            <button type="button" key={t} className={`chip ${text === t ? "a" : ""}`} onClick={() => setText(t)}>{t}</button>
          ))}
        </div>
        <textarea
          className="input"
          rows={2}
          maxLength={140}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Scrivi il messaggio spaventoso…"
        />
        <button type="button" className="btn a" disabled={busy || !target} onClick={scare}>
          {busy ? "Mando…" : victim ? `💀 Spaventa ${victim.name}` : "Scegli chi spaventare"}
        </button>
        <p className="muted small">Comparirà come un&apos;apparizione a tutto schermo con urlo e vibrazione. Tu resti invisibile a tutti.</p>
      </div>
    </div>
  );
}
