"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { ProofMedia } from "./Missions";
import { play as playSfx } from "./sound";
import { canRecord, VoiceBubble, VoiceRecorder } from "./Voice";
import { TcgCard } from "./TcgCard";
import { HoldButton } from "./HoldButton";
import { Icon } from "./Icons";
import MapView, { type MapPoint } from "./MapView";
import type { Card, Fix, GameState, Message } from "./types";
import { CARD_INFO, ago, buzz, clock, post, pts } from "./util";

type Toast = (text: string, bad?: boolean) => void;

/* ---------------- shared ---------------- */

function PhaseTimer({ s, now }: { s: GameState; now: number }) {
  const g = s.game;
  if (g.phase === "PAUSED") return <div><div className="lbl" style={{ color: "var(--accent)" }}>Partita</div><div className="timer">In pausa</div></div>;
  if (g.phase === "LOBBY") return <div><div className="lbl">In attesa del via</div><div className="timer">--:--</div></div>;
  if (g.phase === "HEAD_START") {
    return (
      <div>
        <div className="lbl" style={{ color: "var(--accent)" }}>Vantaggio fuggiaschi · cattura bloccata</div>
        <div className="timer">{clock(+new Date(g.liveAt!) - now)}</div>
      </div>
    );
  }
  return <div><div className="lbl">Tempo rimasto</div><div className="timer">{clock(+new Date(g.endsAt!) - now)}</div></div>;
}

export function Results({ s, refresh, toast }: { s: GameState; refresh: () => void; toast: Toast }) {
  const w = s.game.winner;
  const r = s.results;
  const [album, setAlbum] = useState<AlbumItem[] | null>(null);
  useEffect(() => {
    fetch("/api/album", { cache: "no-store" })
      .then((res) => res.json())
      .then((d) => setAlbum(d.proofs ?? []))
      .catch(() => setAlbum([]));
  }, []);
  const again = async () => {
    try {
      await post("/api/lobby", { action: "newRound" });
      refresh();
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  return (
    <div className="pad">
      <div className="lbl">Partita finita</div>
      <div className="mega">{w ? w.name : "Fine"}</div>
      <div className="box a">
        <span className="lbl">{w?.kind === "HUNTER" ? "Vince il cercatore · tutti i fuggiaschi presi" : "Vince la coppia con più punti ancora in gioco"}</span>
      </div>
      {r && (
        <div className="cols2">
          <div className="lb">
            <span className="lbl">Cercatori</span>
            {r.hunters.map((h, i) => (
              <div key={h.id} className={h.id === s.me.id ? "me" : ""}><span>{i + 1}</span><span>{h.name}</span><span>{pts(h.stolen)}</span></div>
            ))}
          </div>
          <div className="lb">
            <span className="lbl">Coppie</span>
            {r.pairs.map((p, i) => (
              <div key={p.id} className={p.id === s.me.pairId ? "me" : ""}><span>{i + 1}</span><span>{p.name}{p.active === 0 ? " ✕" : ""}</span><span>{pts(p.pool)}</span></div>
            ))}
          </div>
        </div>
      )}
      <div className="lbl">Album delle prove</div>
      {album == null && <span className="muted small">Carico…</span>}
      {album?.length === 0 && <span className="muted small">Nessuna prova caricata.</span>}
      <div className="album">
        {album?.map((a) => (
          <figure key={a.id}>
            <ProofMedia id={a.id} kind={a.kind} />
            <figcaption><b>{a.title}</b><span>{a.pair} · {a.player} · +{pts(a.points)}</span></figcaption>
          </figure>
        ))}
      </div>
      {s.game.hostId === s.me.id || s.game.hostStale ? (
        <>
          <HoldButton label="Tieni premuto per una nuova partita" onFire={again} ms={1500} />
          <p className="muted small">Si torna in lobby con gli stessi giocatori. Coppie e password si estraggono di nuovo.</p>
        </>
      ) : (
        <div className="notice">Per una nuova partita aspetta {s.game.hostName ?? "l'organizzatore"}.</div>
      )}
    </div>
  );
}

interface AlbumItem { id: number; title: string; kind: "PHOTO" | "VIDEO"; pair: string; player: string; points: number }

/* ---------------- fugitive HUD ---------------- */

export function FugitiveHud({ s, now }: { s: GameState; now: number }) {
  const f = s.fugitive!;
  const [show, setShow] = useState(false);
  const [hideShield, setHideShield] = useState(false);
  const shield = s.cards.find((c) => c.code === "GHOST_SHIELD" && c.state === "ACTIVE");
  const fog = s.cards.find((c) => c.code === "NEBBIA" && c.state === "ACTIVE");

  if (s.me.status === "CAPTURED") {
    return (
      <div className="full dead">
        <div className="lbl" style={{ color: "var(--threat)" }}>Sei fuori</div>
        <div className="mega" style={{ color: "var(--threat)" }}>Catturato</div>
        <p className="muted">
          {f.partner?.status === "ACTIVE" ? `${f.partner.name} è ancora in gioco con ${pts(f.pair.pool)} punti.` : "La tua coppia è eliminata."} Puoi seguire la partita nel canale Tutti.
        </p>
        <PhaseTimer s={s} now={now} />
      </div>
    );
  }

  if (shield && !hideShield) {
    return (
      <div className="full shield">
        <div className="lbl">Ghost Shield attivo · mostra questo schermo</div>
        <div className="mega">Immune</div>
        <div className="timer">{clock(+new Date(shield.activeUntil!) - now)}</div>
        <div className="title">{s.me.name} · {f.pair.name}</div>
        <button type="button" className="btn" style={{ background: "rgba(0,0,0,.18)", color: "var(--on-accent)" }} onClick={() => setHideShield(true)}>
          Torna all&apos;HUD
        </button>
      </div>
    );
  }

  const both = f.pair.active === 2;
  return (
    <div className="pad">
      <PhaseTimer s={s} now={now} />
      {shield && (
        <button type="button" className="notice" style={{ border: 0, textAlign: "left" }} onClick={() => setHideShield(false)}>
          Ghost Shield · {clock(+new Date(shield.activeUntil!) - now)} · tocca per mostrarlo
        </button>
      )}
      {fog ? (
        <div className="notice">Nebbia attiva · sei sparito dalla mappa dei cercatori · {clock(+new Date(fog.activeUntil!) - now)}</div>
      ) : s.game.phase === "LIVE" ? (
        <div className="notice" style={{ background: "var(--threat-soft)", color: "#ff5a62" }}>I cercatori vedono la tua zona: un cerchio di {s.game.zoneRadiusM} m, aggiornato ogni minuto.</div>
      ) : null}
      <div className="box a">
        <div className="row"><span className="lbl">Pool di coppia</span><span className="chip a">{f.pair.active}/2 attivi</span></div>
        <div className="big a">{pts(f.pair.pool)}</div>
        {both && <div className="splitbar"><i style={{ flex: 1 }} /><i style={{ flex: 1 }} /></div>}
        <div className="split">
          <div><span className="lbl">Tu · {s.me.name}</span><b>{pts(f.myShare)}</b></div>
          <div><span className="lbl">Partner · {f.partner?.name ?? "—"}</span><b style={{ color: f.partner?.status === "CAPTURED" ? "var(--threat)" : undefined }}>{f.partner?.status === "CAPTURED" ? "PRESO" : pts(f.partner?.share ?? 0)}</b></div>
        </div>
      </div>
      {f.partner && f.partner.status === "ACTIVE" && (
        <div className="box">
          <div className="row">
            <span className="row" style={{ gap: 10, justifyContent: "flex-start" }}>
              <Avatar id={f.partner.id} name={f.partner.name} at={s.avatars[f.partner.id]} size={32} />
              <span className="lbl">Partner · {f.partner.name}</span>
            </span>
            <span className="mono small">ATTIVO</span>
          </div>
          <div className="row mono">
            <span className="num">{f.partner.distanceM != null ? `${f.partner.distanceM} m · ${f.partner.dir}` : "posizione sconosciuta"}</span>
            <span className="lbl">{f.partner.fixAt ? `gps ${ago(now - +new Date(f.partner.fixAt))}` : "nessun gps"}</span>
          </div>
        </div>
      )}
      {f.leader && (
        <div className="row box" style={{ flexDirection: "row" }}>
          <span className="lbl">In testa</span>
          <span className="mono">{f.leader.isMe ? "VOI" : f.leader.name} · <b className="num">{pts(f.leader.pool)}</b></span>
        </div>
      )}
      <button
        type="button"
        className={show ? "btn a" : "btn ghost"}
        style={{ touchAction: "none", userSelect: "none" }}
        onPointerDown={() => setShow(true)}
        onPointerUp={() => setShow(false)}
        onPointerLeave={() => setShow(false)}
        onContextMenu={(e) => e.preventDefault()}
      >
        {show ? <span style={{ fontSize: 26, letterSpacing: ".12em" }}>{f.password}</span> : "Tieni premuto per la password"}
      </button>
      <p className="muted small">Se un cercatore ti tocca, digli la password. Lui la scrive nella sua app.</p>
      <span className="lbl">Codice di rientro · {s.me.rejoinCode}</span>
    </div>
  );
}

/* ---------------- ghost (captured fugitive) ---------------- */

export function Ghost({ s, now, refresh, toast }: { s: GameState; now: number; refresh: () => void; toast: Toast }) {
  const card = s.cards.find((c) => c.code === "SUSSURRO");
  const partner = s.fugitive?.partner;
  const [busy, setBusy] = useState(false);
  const whisper = async () => {
    if (!card) return;
    setBusy(true);
    try {
      const r = await post<{ message: string }>("/api/cards", { cardId: card.id });
      buzz(80);
      playSfx("whisper");
      toast(r.message);
      refresh();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  const left = card?.cooldownUntil ? +new Date(card.cooldownUntil) - now : 0;
  return (
    <div className="pad">
      <PhaseTimer s={s} now={now} />
      <div className="box ghost">
        <span className="lbl">Sei stato catturato</span>
        <div className="mega">Fantasma</div>
        <p className="small muted">
          Adesso giochi con i cercatori. Leggi e scrivi nel loro canale, e con il Sussurro riveli il settore di un fuggiasco a caso
          (mai il tuo ex partner). Si ricarica ogni 10 minuti.
        </p>
      </div>
      {card && (
        <div className="field" style={{ alignItems: "center" }}>
          <div style={{ width: "min(300px, 78vw)" }}>
            <TcgCard card={card} now={now} size="large" />
          </div>
          <div style={{ width: "min(300px, 78vw)" }}>
            <HoldButton label={busy ? "Sussurro…" : card.state === "READY" ? "Tieni premuto per sussurrare" : `Prossimo sussurro tra ${clock(left)}`} disabled={busy || card.state !== "READY"} onFire={whisper} />
          </div>
        </div>
      )}
      {partner && (
        <div className="row box" style={{ flexDirection: "row" }}>
          <span className="lbl">{partner.name}</span>
          <span>{partner.status === "ACTIVE" ? "ancora libero" : "anche lui fantasma"}</span>
        </div>
      )}
    </div>
  );
}

/* ---------------- hunter HUD ---------------- */

export function HunterHud({ s, now }: { s: GameState; now: number }) {
  const h = s.hunter!;
  const left = h.fugitives.filter((f) => !f.captured).length;
  const radar = s.cards.find((c) => c.code === "RADAR_PING");
  return (
    <div className="pad">
      <PhaseTimer s={s} now={now} />
      <div className="box a">
        <div className="row"><span className="lbl">Punti rubati</span><span className="chip fa">Posizione {h.rank}/{h.hunters.length}</span></div>
        <div className="big a">{pts(h.stolen)}</div>
      </div>
      <div className="box">
        <div className="row"><span className="lbl">Fuggiaschi rimasti</span><b className="mono num">{left}/{h.fugitives.length}</b></div>
        <div className="pips">{h.fugitives.map((f, i) => <i key={i} className={f.captured ? "x" : ""} />)}</div>
      </div>
      <div className="lb">
        {h.hunters.map((x, i) => (
          <div key={x.id} className={x.id === s.me.id ? "me" : ""}><span>{i + 1}</span><span>{x.name}{x.id === s.me.id ? " (tu)" : ""}</span><span>{pts(x.stolen)}</span></div>
        ))}
      </div>
      {h.track && (
        <div className="box w">
          <div className="row"><span className="lbl">Traccia · {h.track.sector}</span><span className="mono">{clock(+new Date(h.track.until) - now)}</span></div>
          <div className="big">{h.track.count} <span className="lbl">fuggiaschi ora</span></div>
        </div>
      )}
      {radar && (
        <div className="row box" style={{ flexDirection: "row" }}>
          <span className="lbl">Radar ping</span>
          <span className="mono">{radar.state === "READY" ? "PRONTO" : radar.state === "COOLDOWN" ? clock(+new Date(radar.cooldownUntil!) - now) : radar.state === "ACTIVE" ? "ATTIVO" : "BLOCCATO"}</span>
        </div>
      )}
      <span className="lbl">Codice di rientro · {s.me.rejoinCode}</span>
    </div>
  );
}

/* ---------------- capture ---------------- */

type Verdict =
  | { result: "OK"; stolen: number; targetName: string; pairName: string; partnerActive: boolean; poolLeft: number }
  | { result: "WRONG"; attemptsLeft: number }
  | { result: "ALREADY"; targetName: string; capturedBy: string }
  | { result: "SHIELDED"; shieldLeftS: number }
  | { result: "LOCKED"; lockedS: number }
  | { result: "PHASE"; phase: string };

export function Capture({ s, refresh, toast }: { s: GameState; refresh: () => void; toast: Toast }) {
  const h = s.hunter!;
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [v, setV] = useState<Verdict | null>(null);
  const live = s.game.phase === "LIVE";
  const locked = h.lockedS > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pw.trim() || busy) return;
    setBusy(true);
    try {
      const r = await post<Verdict>("/api/capture", { password: pw });
      setV(r);
      if (r.result === "OK") {
        buzz([80, 60, 300]);
        playSfx("capture");
        setPw("");
      } else buzz(200);
      refresh();
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  if (v?.result === "OK") {
    return (
      <div className="pad">
        <div className="notice">Cattura confermata</div>
        <div className="box a">
          <span className="lbl">Catturato</span>
          <div className="mega" style={{ fontSize: 48 }}>{v.targetName}</div>
          <span className="title">{v.pairName}</span>
          <div className="row"><span className="lbl">Rubati</span><span className="big a">+{pts(v.stolen)}</span></div>
          <span className="lbl">{v.partnerActive ? `Il partner è ancora libero · pool rimasto ${pts(v.poolLeft)}` : "Coppia eliminata"}</span>
        </div>
        <button type="button" className="btn" onClick={() => setV(null)}>Nuova cattura</button>
      </div>
    );
  }

  return (
    <form className="pad" onSubmit={submit} autoComplete="off" style={{ flex: 1 }}>
      <div className="row">
        <span className="lbl">Password del fuggiasco</span>
        <span className="chip">{locked ? `Bloccato ${h.lockedS}s` : `Tentativi ${h.attemptsLeft}/5`}</span>
      </div>
      <input
        id="capture-pw"
        className="input pwfield"
        value={pw}
        onChange={(e) => setPw(e.target.value.toUpperCase())}
        placeholder="CIMITERO45"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        autoComplete="off"
        enterKeyHint="send"
        autoFocus
        disabled={!live || locked}
      />
      <div className="att" aria-label={`${h.attemptsLeft} tentativi rimasti`}>
        {[0, 1, 2, 3, 4].map((i) => <i key={i} className={i < h.attemptsLeft ? "" : "u"} />)}
      </div>
      {v && (
        <div className="box r">
          <b style={{ color: "var(--threat)" }} className="mono">
            {v.result === "WRONG" && "PASSWORD SBAGLIATA"}
            {v.result === "ALREADY" && "GIÀ CATTURATO"}
            {v.result === "SHIELDED" && "GHOST SHIELD"}
            {v.result === "LOCKED" && "BLOCCATO"}
            {v.result === "PHASE" && "CATTURA NON APERTA"}
          </b>
          <span className="muted small">
            {v.result === "WRONG" && `Controlla con il fuggiasco come si scrive. ${v.attemptsLeft} tentativi prima del blocco di 60 s.`}
            {v.result === "ALREADY" && `${v.targetName} è già stato preso da ${v.capturedBy}.`}
            {v.result === "SHIELDED" && `Immune ancora per ${clock(v.shieldLeftS * 1000)}. Se lo scudo è partito dopo il tocco, contestate sul gruppo WhatsApp.`}
            {v.result === "LOCKED" && `Troppi errori. Riprova tra ${v.lockedS} s.`}
            {v.result === "PHASE" && "La cattura si apre quando finisce il vantaggio dei fuggiaschi."}
          </span>
        </div>
      )}
      <p className="muted small">Parola + 2 cifre. Maiuscole e spazi non contano. 5 errori in 60 s bloccano la cattura per un minuto.</p>
      <div style={{ flex: 1 }} />
      <button type="submit" className="btn a" disabled={!live || locked || busy || !pw.trim()}>
        {busy ? "Verifico…" : live ? "Conferma cattura" : "Cattura bloccata"}
      </button>
      {s.game.whatsappUrl && (
        <a className="btn ghost" href={s.game.whatsappUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
          Contestazione → WhatsApp admin
        </a>
      )}
    </form>
  );
}

/* ---------------- deck ---------------- */

function cardStatus(c: Card, now: number) {
  if (c.state === "ACTIVE") return `${clock(+new Date(c.activeUntil!) - now)} rimasti`;
  if (c.state === "COOLDOWN") return `ricarica ${clock(+new Date(c.cooldownUntil!) - now)}`;
  if (c.state === "LOCKED") return "si sblocca a caccia aperta";
  if (c.state === "SPENT") return "usata";
  return c.usesLeft == null ? "usi illimitati" : `${c.usesLeft} ${c.usesLeft === 1 ? "uso" : "usi"}`;
}


export function Deck({ s, now, refresh, toast }: { s: GameState; now: number; refresh: () => void; toast: Toast }) {
  const [sel, setSel] = useState<number | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const card = s.cards.find((c) => c.id === sel) ?? null;
  const info = card ? CARD_INFO[card.code] : null;
  const allowed = info?.sector === "LAST_PING" ? s.hunter?.lastPingSectors ?? [] : ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9"];

  const play = async () => {
    if (!card || busy) return;
    setBusy(true);
    try {
      const r = await post<{ message: string }>("/api/cards", { cardId: card.id, target });
      playSfx(card.code === "RADAR_PING" ? "ping" : "card");
      toast(r.message);
      setSel(null);
      setTarget(null);
      refresh();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pad">
      <div className="row"><span className="lbl">Mazzo · {s.cards.length} carte</span><span className="chip">{s.cards.filter((c) => c.state === "ACTIVE").length} attive</span></div>
      <div className="deckgrid">
        {s.cards.map((c) => (
          <TcgCard key={c.id} card={c} now={now} onClick={() => { setSel(c.id); setTarget(null); }} />
        ))}
      </div>
      <p className="muted small">Tocca una carta per vederla e giocarla. Le carte rare sono olografiche.</p>
      {card && info && (
        <div className="cardsheet" role="dialog" aria-modal="true" aria-label={info.name} onClick={(e) => e.target === e.currentTarget && setSel(null)}>
          <TcgCard card={card} now={now} size="large" />
          <div className="controls">
            {info.sector && card.state === "READY" && (
              <div className="box glass">
                <span className="lbl">{info.sector === "LAST_PING" ? "Settore dell'ultimo ping" : "Scegli il settore"}</span>
                {allowed.length === 0 ? (
                  <span className="muted small">Usa prima un Radar Ping.</span>
                ) : (
                  <div className="sectors">
                    {["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9"].map((x) => (
                      <button type="button" key={x} className={target === x ? "on" : ""} disabled={!allowed.includes(x)} onClick={() => setTarget(x)}>{x}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {card.state === "READY" && (
              <HoldButton label={busy ? "Attivo…" : "Tieni premuto per giocare"} disabled={busy || (!!info.sector && !target)} onFire={play} />
            )}
            {card.state !== "READY" && <div className="notice" style={{ textAlign: "center" }}>{cardStatus(card, now)}</div>}
            <button type="button" className="btn ghost" onClick={() => setSel(null)}>Chiudi</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- map tab ---------------- */

export function MapTab({ s, fix, geoError }: { s: GameState; fix: Fix | null; geoError: string | null }) {
  const g = s.game;
  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const p of s.hunter?.pings ?? []) for (const [k, v] of Object.entries(p.sectors)) out[k] = Math.max(out[k] ?? 0, v);
    return out;
  }, [s.hunter?.pings]);
  const points = useMemo<MapPoint[]>(() => {
    const p = s.fugitive?.partner;
    return p && p.status === "ACTIVE" && p.lat != null && p.lng != null ? [{ id: "partner", lat: p.lat, lng: p.lng, kind: "partner", label: p.name }] : [];
  }, [s.fugitive?.partner]);
  const quests = useMemo(
    () => (s.fugitive?.missions ?? []).map((m) => ({ id: m.id, lat: m.lat, lng: m.lng, title: m.place, points: m.points, done: m.proofId != null })),
    [s.fugitive?.missions],
  );

  let edge: string | null = null;
  if (fix) {
    const inside = pointIn(fix.lng, fix.lat, g.boundary);
    edge = inside ? null : "Sei fuori dai confini. Rientra entro 60 s.";
  }

  return (
    <div className="mapfull">
      <MapView boundary={g.boundary} fix={fix} points={points} quests={quests} zones={s.hunter?.zones ?? []} sectorCounts={counts} tracked={s.hunter?.track?.sector ?? null} />
      <div className="mapover top">
        {geoError && <div className="alert">{geoError}</div>}
        {edge && <div className="alert">{edge}</div>}
        {s.hunter?.pings.length ? <span className="chip r glass">Ping attivo · {s.hunter.pings[0].hunter}</span> : null}
        {s.hunter?.track && <span className="chip fa">Traccia {s.hunter.track.sector}</span>}
        {s.hunter && s.game.phase === "LIVE" && <span className="chip glass">{s.hunter.zones.length} zone · aggiornate ogni minuto</span>}
        {s.hunter && s.game.phase === "HEAD_START" && <span className="chip glass">Le zone dei fuggiaschi compaiono a caccia aperta</span>}
      </div>
      <div className="mapover bottom">
        <div className="legend glass">
          <span><i className="sw" style={{ borderColor: "var(--accent)" }} />Confine</span>
          {s.fugitive && <span><i className="sw" style={{ background: "var(--accent)", borderColor: "var(--accent)", borderRadius: "50%" }} />Missione</span>}
          <span><i className="sw" style={{ background: "var(--fg)", borderRadius: "50%" }} />Tu</span>
          {s.fugitive && <span><i className="sw" style={{ borderRadius: "50%" }} />Partner</span>}
          {s.hunter && <span><i className="sw" style={{ borderColor: "#FF4D55", background: "rgba(229,9,20,.25)", borderRadius: "50%", borderStyle: "dashed" }} />Zona fuggiasco</span>}
        {s.hunter && <span><i className="sw" style={{ borderColor: "var(--threat)", background: "repeating-linear-gradient(135deg,var(--threat) 0 2px,transparent 2px 5px)" }} />Ping</span>}
        </div>
      </div>
    </div>
  );
}

function pointIn(lng: number, lat: number, poly: [number, number][]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/* ---------------- comms ---------------- */

const CH_LABEL = { HUNTERS: "Cercatori", FUGITIVES: "Fuggiaschi", BROADCAST: "Tutti" };

export function Comms({ s, messages, refresh, toast }: { s: GameState; messages: Message[]; refresh: () => void; toast: Toast }) {
  const [ch, setCh] = useState<Message["channel"]>(s.channels[0]);
  const [text, setText] = useState("");
  const channel = s.channels.includes(ch) ? ch : s.channels[0];
  const list = messages.filter((m) => m.channel === channel);
  const phase = s.game.phase;
  const canWrite = channel !== "BROADCAST" || phase === "LOBBY" || phase === "ENDED";

  const scroller = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [micOk, setMicOk] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMicOk(canRecord()), 0);
    return () => clearTimeout(t);
  }, []);
  const isHost = s.game.hostId === s.me.id;
  const remove = async (id: number) => {
    setMenu(null);
    try {
      const res = await fetch("/api/messages", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Non sono riuscito a eliminarlo.");
      refresh();
    } catch (err) {
      toast((err as Error).message, true);
    }
  };
  const lastSeen = list.length ? list[list.length - 1].id : 0;
  const typingHere = s.typing.filter((t) => t.channel === channel);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastSeen, channel, typingHere.length]);

  // Tell the others we're typing, at most every 2.5 s.
  const lastPing = useRef(0);
  const onType = (v: string) => {
    setText(v);
    if (v.trim() && Date.now() - lastPing.current > 2500) {
      lastPing.current = Date.now();
      fetch("/api/typing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ channel }) }).catch(() => {});
    }
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      await post("/api/messages", { channel, text });
      setText("");
      refresh();
    } catch (err) {
      toast((err as Error).message, true);
    }
  };

  return (
    <div className="chat">
      {s.channels.length > 1 && (
        <div className="tabs seg glass">
          {s.channels.map((c) => <button type="button" key={c} className={c === channel ? "on" : ""} onClick={() => setCh(c)}>{CH_LABEL[c]}</button>)}
        </div>
      )}
      <div className="msgs" ref={scroller}>
        {list.length === 0 && <p className="muted small">Ancora nessun messaggio.</p>}
        {list.map((m) => {
          const canDelete = m.kind === "USER" && !m.deleted && (m.mine || isHost);
          const bubble = (
            <div className={`msg ${m.kind === "SYSTEM" ? "sys" : ""} ${m.mine && m.kind === "USER" ? "mine" : ""} ${m.deleted ? "deleted" : ""}`}>
              {m.kind !== "SYSTEM" && !m.mine && <span className="meta">{m.sender} · {new Date(m.at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</span>}
              {m.audio && !m.deleted ? (
                <span className="text voicewrap">
                  <VoiceBubble id={m.id} ms={m.audio_ms} />
                  {canDelete && (
                    <button type="button" className="msgmore" onClick={() => setMenu(menu === m.id ? null : m.id)} aria-label="Opzioni messaggio" aria-haspopup="menu" aria-expanded={menu === m.id}>
                      •••
                    </button>
                  )}
                </span>
              ) : canDelete ? (
                <button type="button" className="text" onClick={() => setMenu(menu === m.id ? null : m.id)} aria-haspopup="menu" aria-expanded={menu === m.id}>
                  {m.body}
                </button>
              ) : (
                <span className="text">{m.deleted ? "Messaggio eliminato" : m.body}</span>
              )}
              {menu === m.id && (
                <div className="msgmenu glass" role="menu">
                  <button type="button" role="menuitem" className="danger" onClick={() => remove(m.id)}>Elimina per tutti</button>
                  <button type="button" role="menuitem" onClick={() => setMenu(null)}>Annulla</button>
                </div>
              )}
              {m.proof_id && <ProofMedia id={m.proof_id} kind={m.proof_kind} />}
            </div>
          );
          if (m.kind === "SYSTEM" || m.mine || !m.sender_id) return <div key={m.id} style={{ display: "contents" }}>{bubble}</div>;
          const role = s.lobby.players.find((p) => p.id === m.sender_id)?.role;
          return (
            <div key={m.id} className="msgrow other">
              <Avatar id={m.sender_id} name={m.sender ?? "?"} at={s.avatars[m.sender_id]} size={30} kind={role === "HUNTER" ? "hunter" : "fugitive"} />
              {bubble}
            </div>
          );
        })}
        {typingHere.length > 0 && (
          <div className="typing" aria-live="polite">
            <Avatar id={typingHere[0].id} name={typingHere[0].name} at={s.avatars[typingHere[0].id]} size={30} />
            <div>
              <div className="who-typing">
                {typingHere.length === 1
                  ? `${typingHere[0].name} ${typingHere[0].audio ? "sta registrando un audio…" : "sta scrivendo…"}`
                  : `${typingHere.map((t) => t.name).join(" e ")} stanno scrivendo…`}
              </div>
              <div className="bubble"><i /><i /><i /></div>
            </div>
          </div>
        )}
      </div>
      {canWrite ? (
        recording ? (
          <div className="composer glass">
            <VoiceRecorder
              channel={channel}
              onDone={() => { setRecording(false); refresh(); }}
              onCancel={() => setRecording(false)}
              onError={(msg) => toast(msg, true)}
            />
          </div>
        ) : (
        <form className="composer glass" onSubmit={send}>
          <input id="chat-text" className="input" value={text} onChange={(e) => onType(e.target.value)} placeholder={channel === "BROADCAST" ? "Scrivi a tutti" : `Scrivi ai ${CH_LABEL[channel].toLowerCase()}`} maxLength={500} />
          {text.trim() || !micOk ? (
            <button type="submit" className="btn a sm">Invia</button>
          ) : (
            <button type="button" className="sendbtn" onClick={() => setRecording(true)} aria-label="Registra un messaggio vocale">
              <svg viewBox="0 0 24 24"><path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" /></svg>
            </button>
          )}
        </form>
        )
      ) : (
        <div className="composer glass"><span className="muted">Durante la partita il canale Tutti è in sola lettura.</span></div>
      )}
    </div>
  );
}

export { Icon };
