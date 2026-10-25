"use client";
import { useEffect, useState } from "react";
import { RANKS, rankOf } from "@/lib/ranks";
import type { GameState } from "./types";

const KEY = "cnh_profile";

/** Secret key of this phone's profile (ranks follow the phone across games). Created on first use. */
export function profileKey() {
  try {
    let k = localStorage.getItem(KEY);
    if (!k) {
      const b = new Uint8Array(24);
      crypto.getRandomValues(b);
      k = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
      localStorage.setItem(KEY, k);
    }
    return k;
  } catch {
    return undefined;
  }
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI"];

/** Shield emblem of a rank. */
export function RankBadge({ index, size = 22, title = true }: { index: number; size?: number; title?: boolean }) {
  const r = RANKS[Math.max(0, Math.min(RANKS.length - 1, index))];
  return (
    <span className="rankbadge" style={{ width: size, height: size, ["--rc" as string]: r.color, ["--rg" as string]: r.glow }} title={title ? r.name : undefined} aria-label={`Rango ${r.name}`}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 1.5l8.5 3v6.2c0 5.4-3.6 9.6-8.5 11.8-4.9-2.2-8.5-6.4-8.5-11.8V4.5z" fill="var(--rc)" />
        <path d="M12 3.4l6.8 2.4v5c0 4.4-2.9 7.9-6.8 9.7-3.9-1.8-6.8-5.3-6.8-9.7v-5z" fill="#0b0a0f" opacity=".55" />
        <text x="12" y="15.2" textAnchor="middle" fontSize={index >= 3 ? 6.5 : 7.5} fontWeight="900" fill="var(--rc)">{ROMAN[index] ?? ""}</text>
      </svg>
    </span>
  );
}

/** My rank with progress to the next one. */
export function RankPanel({ rank }: { rank: NonNullable<GameState["rank"]> }) {
  const span = rank.next ? rank.next.min - rank.min : 1;
  const pct = rank.next ? Math.min(100, ((rank.rp - rank.min) / span) * 100) : 100;
  return (
    <div className="rankpanel" style={{ ["--rc" as string]: rank.color, ["--rg" as string]: rank.glow }}>
      <RankBadge index={rank.index} size={46} title={false} />
      <div className="rp-main">
        <div className="row"><b>{rank.name}</b><span className="small muted">{rank.rp} RP</span></div>
        <div className="rp-bar"><i style={{ width: `${pct}%` }} /></div>
        <span className="small muted">
          {rank.next ? `${rank.next.min - rank.rp} RP per diventare ${rank.next.name}` : "Rango massimo raggiunto"} · {rank.podiums} podi in {rank.games} partite
        </span>
      </div>
    </div>
  );
}

/** End of game: RP won on the podium, with a rank-up celebration. */
export function RankAward({ rank }: { rank: NonNullable<GameState["rank"]> }) {
  const a = rank.award;
  const up = a ? a.before !== rank.name : false;
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 400);
    return () => clearTimeout(t);
  }, []);
  if (!a) {
    return (
      <div className="rankaward none">
        <RankBadge index={rank.index} size={34} />
        <span className="small">Niente podio questa volta: i punti rango si guadagnano solo arrivando tra i primi 3.</span>
      </div>
    );
  }
  const prev = rankOf(Math.max(0, rank.rp - a.rp));
  return (
    <div className={`rankaward ${up ? "up" : ""} ${show ? "show" : ""}`} style={{ ["--rc" as string]: rank.color, ["--rg" as string]: rank.glow }}>
      <span className="ra-place">{a.place}°</span>
      <div className="ra-main">
        <b>+{a.rp} RP</b>
        <span className="small muted">{prev.rp} → {rank.rp} RP</span>
      </div>
      {up ? (
        <div className="ra-up">
          <RankBadge index={rank.index} size={56} />
          <span>Nuovo rango<br /><b>{rank.name}</b></span>
        </div>
      ) : (
        <RankBadge index={rank.index} size={40} />
      )}
    </div>
  );
}

async function account(body: Record<string, unknown>) {
  const res = await fetch("/api/account", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error ?? "Qualcosa è andato storto. Riprova.");
  return d as { name?: string; rank?: string; rp?: number };
}

/** Recover a rank on this phone with the name and password chosen before. */
export function RecoverForm({ onDone, toast }: { onDone: () => void; toast: (t: string, bad?: boolean) => void }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form className="accform" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      try {
        const r = await account({ action: "recover", username: u, password: p, key: profileKey() });
        toast(`Bentornato ${r.name}: rango ${r.rank} (${r.rp} RP) recuperato su questo telefono.`);
        onDone();
      } catch (err) {
        toast((err as Error).message, true);
      } finally {
        setBusy(false);
      }
    }}>
      <input className="input" placeholder="Nome account" value={u} onChange={(e) => setU(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" />
      <input className="input" type="password" placeholder="Password" value={p} onChange={(e) => setP(e.target.value)} autoComplete="current-password" />
      <button type="submit" className="btn a" disabled={busy || u.trim().length < 3 || p.length < 6}>{busy ? "Controllo…" : "Recupera il rango"}</button>
    </form>
  );
}

/** Under the rank: protect it with a name + password, or recover one from another phone. */
export function AccountBox({ rank, refresh, toast }: { rank: GameState["rank"]; refresh: () => void; toast: (t: string, bad?: boolean) => void }) {
  const [mode, setMode] = useState<null | "save" | "recover">(null);
  const [u, setU] = useState(rank?.account ?? "");
  const [p, setP] = useState("");
  const [p2, setP2] = useState("");
  const [cur, setCur] = useState("");
  const [busy, setBusy] = useState(false);
  const has = !!rank?.account;
  return (
    <div className="accbox">
      {has ? (
        <span className="small"><b className="accok">✓ Rango protetto</b> · account <b>{rank!.account}</b>. Su un altro telefono usa «Recupera il rango».</span>
      ) : (
        <span className="small muted">Il rango è salvato su questo telefono. Proteggilo con un nome e una password per ritrovarlo se cambi telefono o usi l&apos;app installata.</span>
      )}
      <div className="row" style={{ gap: 8, justifyContent: "flex-start" }}>
        {rank && <button type="button" className={`chip ${mode === "save" ? "fa" : "a"}`} onClick={() => setMode(mode === "save" ? null : "save")}>{has ? "Cambia password" : "Proteggi il rango"}</button>}
        <button type="button" className={`chip ${mode === "recover" ? "fa" : ""}`} onClick={() => setMode(mode === "recover" ? null : "recover")}>Recupera il rango</button>
      </div>
      {mode === "save" && (
        <form className="accform" onSubmit={async (e) => {
          e.preventDefault();
          if (p !== p2) return toast("Le due password non coincidono.", true);
          setBusy(true);
          try {
            await account({ action: "save", username: u, password: p, current: cur || undefined });
            toast(has ? "Password cambiata." : "Rango protetto. Ricordati nome e password!");
            setMode(null); setP(""); setP2(""); setCur("");
            refresh();
          } catch (err) {
            toast((err as Error).message, true);
          } finally {
            setBusy(false);
          }
        }}>
          <input className="input" placeholder="Nome account (es. alberto.bo)" value={u} onChange={(e) => setU(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" />
          {has && <input className="input" type="password" placeholder="Password attuale" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />}
          <input className="input" type="password" placeholder={has ? "Nuova password (almeno 6 caratteri)" : "Password (almeno 6 caratteri)"} value={p} onChange={(e) => setP(e.target.value)} autoComplete="new-password" />
          <input className="input" type="password" placeholder="Ripeti la password" value={p2} onChange={(e) => setP2(e.target.value)} autoComplete="new-password" />
          <button type="submit" className="btn a" disabled={busy || u.trim().length < 3 || p.length < 6 || !p2}>{busy ? "Salvo…" : "Salva"}</button>
          <span className="small muted">Non usare una password che usi altrove. La salviamo solo cifrata.</span>
        </form>
      )}
      {mode === "recover" && <RecoverForm toast={toast} onDone={() => { setMode(null); refresh(); }} />}
    </div>
  );
}
