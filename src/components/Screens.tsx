"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { GhostIntro, GhostLoop, GraveLoop } from "./GhostAnim";
import { FlameDither } from "@/components/ui/flame-dither";
import { ProofMedia } from "./Missions";
import { play as playSfx } from "./sound";
import { canRecord, VoiceBubble, VoiceRecorder } from "./Voice";
import { TcgCard } from "./TcgCard";
import { HoldButton } from "./HoldButton";
import { Sheet } from "./Panels";
import { Icon } from "./Icons";
import MapView, { sectorCenter, type MapPoint } from "./MapView";
import { Replay } from "./Replay";
import { RankAward } from "./Rank";
import { MapLegend, type LegendTarget, type LegendTargets } from "./MapLegend";
import type { Card, Channel, Fix, GameState, Message } from "./types";
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

type PodiumEntry = { key: string; mine: boolean; title: string; sub?: string; points: number; out?: boolean; faces: React.ReactNode[] };

/** Top three on steps (2nd, 1st, 3rd), everyone else listed underneath. */
function Podium({ entries }: { entries: PodiumEntry[] }) {
  const top = entries.slice(0, 3);
  const order = [top[1], top[0], top[2]];
  const rest = entries.slice(3);
  return (
    <div className="podium-wrap">
      <div className="podium">
        {order.map((e, i) => {
          if (!e) return <div key={`empty${i}`} className="step-col" />;
          const place = i === 1 ? 1 : i === 0 ? 2 : 3;
          return (
            <div key={e.key} className={`step-col p${place}${e.mine ? " me" : ""}`}>
              {place === 1 && <span className="crown" aria-hidden="true">👑</span>}
              <div className="faces">{e.faces}</div>
              <b className="who">{e.title}{e.out ? " ✕" : ""}</b>
              {e.sub && <span className="sub">{e.sub}</span>}
              <span className="pts num">{pts(e.points)}</span>
              <div className="step"><span>{place}</span></div>
            </div>
          );
        })}
      </div>
      {rest.length > 0 && (
        <div className="lb">
          {rest.map((e, i) => (
            <div key={e.key} className={e.mine ? "me" : ""}><span>{i + 4}</span><span>{e.title}{e.sub ? ` · ${e.sub}` : ""}{e.out ? " ✕" : ""}</span><span>{pts(e.points)}</span></div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Everyone captured during the game, in order, with what their pair lost. */
function Graveyard({ fallen, meId }: { fallen: NonNullable<GameState["results"]>["fallen"]; meId: string }) {
  if (!fallen.length) return null;
  return (
    <div className="graveyard">
      <GraveLoop />
      <span className="lbl">Cimitero · {fallen.length === 1 ? "1 caduto" : `${fallen.length} caduti`}</span>
      {fallen.map((f) => (
        <div key={f.id} className={`grave${f.id === meId ? " me" : ""}`}>
          <span className="rip" aria-hidden="true">RIP</span>
          <span className="who">
            <b>{f.name}</b>
            <small>{f.pair ? `${f.pair} · ` : ""}preso da {f.by} alle {new Date(f.at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</small>
          </span>
          <span className="lost num">{f.risen ? <small className="risen">🧟 risorto</small> : null}−{pts(f.lost)}</span>
        </div>
      ))}
    </div>
  );
}

type StandingsTab = "general" | "hunters" | "pairs" | "ghosts" | "missions";
const STANDINGS_TABS: { key: StandingsTab; label: string }[] = [
  { key: "general", label: "Generale" },
  { key: "hunters", label: "Cercatori" },
  { key: "pairs", label: "Coppie" },
  { key: "ghosts", label: "Fantasmi" },
  { key: "missions", label: "Missioni" },
];

/** General ranking (everyone, individually) plus one tab per category. */
function Standings({ s }: { s: GameState }) {
  const r = s.results!;
  const st = r.standings;
  const [tab, setTab] = useState<StandingsTab>("general");
  const kindOf = (id: string) => {
    const p = s.lobby.players.find((x) => x.id === id);
    return p?.role === "HUNTER" ? "hunter" : r.fallen.some((f) => f.id === id) ? "ghost" : "fugitive";
  };
  type Row = { key: string; avatarId?: string; name: string; detail?: string; value: string; mine: boolean; faces?: { id: string; name: string }[] };
  const rows: Row[] =
    tab === "general"
      ? st.general.map((x) => ({ key: x.id, avatarId: x.id, name: x.ghost ? `👻 ${x.name}` : x.name, detail: x.detail, value: pts(x.points), mine: x.id === s.me.id }))
      : tab === "hunters"
        ? st.hunters.map((x) => ({ key: x.id, avatarId: x.id, name: x.name, value: pts(x.points), mine: x.id === s.me.id }))
        : tab === "pairs"
          ? r.pairs.map((p) => ({
              key: p.id, name: p.name, detail: `${p.members.map((m) => m.name).join(" & ")}${p.active === 0 ? " · eliminata" : ""}`,
              value: pts(p.pool), mine: p.id === s.me.pairId, faces: p.members,
            }))
          : tab === "ghosts"
            ? st.ghosts.map((x) => ({ key: x.id, avatarId: x.id, name: x.name, detail: x.detail, value: pts(x.points), mine: x.id === s.me.id }))
            : st.missions.map((x) => ({
                key: x.id, avatarId: x.id, name: x.name, detail: x.detail,
                value: x.count === 1 ? "1 missione" : `${x.count} missioni`, mine: x.id === s.me.id,
              }));
  const empty = { general: "Nessun giocatore.", hunters: "Nessun cercatore.", pairs: "Nessuna coppia.", ghosts: "Nessuno è stato catturato.", missions: "Nessun fuggiasco." }[tab];
  const note = {
    general: "Cercatori: punti rubati. Fuggiaschi: la propria quota del pool a fine partita (0 se catturati) + quanto rubato da fantasma.",
    hunters: "Punti rubati con le catture, bonus compresi.",
    pairs: "Pool rimasto a fine partita: decide chi vince se qualcuno resta libero.",
    ghosts: "Punti rubati dopo essere diventati fantasmi.",
    missions: "Prove foto e video caricate da ciascuno.",
  }[tab];
  return (
    <section className="standings">
      <span className="lbl">Classifiche</span>
      <div className="chatbar standtabs" role="tablist">
        {STANDINGS_TABS.map((t) => (
          <button type="button" key={t.key} role="tab" aria-selected={tab === t.key} className={`chatchip glass ${tab === t.key ? "on" : ""}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="standlist">
        {rows.length === 0 && <span className="muted small cell">{empty}</span>}
        {rows.map((x, i) => (
          <div key={x.key} className={`standrow ${x.mine ? "me" : ""} ${i < 3 ? `top${i + 1}` : ""}`}>
            <span className="rank">{i + 1}</span>
            <span className="faces">
              {x.faces
                ? x.faces.map((m) => <Avatar key={m.id} id={m.id} name={m.name} at={s.avatars[m.id]} size={30} kind={kindOf(m.id)} />)
                : x.avatarId && <Avatar id={x.avatarId} name={x.name.replace("👻 ", "")} at={s.avatars[x.avatarId]} size={32} kind={kindOf(x.avatarId)} />}
            </span>
            <span className="who"><b>{x.name}</b>{x.detail && <small>{x.detail}</small>}</span>
            <span className="val num">{x.value}</span>
          </div>
        ))}
      </div>
      <p className="muted small">{note}</p>
    </section>
  );
}

export function Results({ s, refresh, toast }: { s: GameState; refresh: () => void; toast: Toast }) {
  const w = s.game.winner;
  const r = s.results;
  const [album, setAlbum] = useState<AlbumItem[] | null>(null);
  const [replay, setReplay] = useState(false);
  useEffect(() => {
    fetch("/api/album", { cache: "no-store" })
      .then((res) => res.json())
      .then((d) => setAlbum(d.proofs ?? []))
      .catch(() => setAlbum([]));
  }, []);
  const [asked, setAsked] = useState(false);
  const again = async () => {
    try {
      await post("/api/lobby", { action: "newRound" });
      refresh();
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const ask = async () => {
    try {
      await post("/api/lobby", { action: "askLobby" });
      setAsked(true);
      toast(`Richiesta mandata a ${s.game.hostName ?? "l'organizzatore"}.`);
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const canRestart = s.game.hostId === s.me.id || s.game.hostStale;
  const back = <BackToLobby canRestart={canRestart} asked={asked} hostName={s.game.hostName} onRestart={again} onAsk={ask} />;
  return (
    <div className="pad">
      {back}
      <div className="lbl">Partita finita</div>
      <div className="mega">{w ? w.name : "Fine"}</div>
      <div className="box a">
        <span className="lbl">{w?.kind === "HUNTER" ? "Vincono i cercatori · classifica individuale" : "Vincono i fuggiaschi · classifica a coppie"}</span>
      </div>
      {s.rank && <RankAward rank={s.rank} />}
      <button type="button" className="btn a replaybtn" onClick={() => setReplay(true)}>▶ Guarda il replay della serata</button>
      {replay && <Replay onClose={() => setReplay(false)} />}
      {r && (w?.kind === "HUNTER" ? (
        <Podium
          entries={[...r.hunters].sort((a, b) => b.stolen - a.stolen).map((h) => ({
            key: h.id, mine: h.id === s.me.id, title: h.ghost ? `👻 ${h.name}` : h.name, sub: h.ghost ? "fantasma" : undefined, points: h.stolen,
            faces: [<Avatar key={h.id} id={h.id} name={h.name} at={s.avatars[h.id]} size={44} kind={h.ghost ? "ghost" : "hunter"} />],
          }))}
        />
      ) : (
        <Podium
          entries={r.pairs.map((p) => ({
            key: p.id, mine: p.id === s.me.pairId, title: p.name, sub: p.members.map((m) => m.name).join(" & "), points: p.pool, out: p.active === 0,
            faces: p.members.map((m) => <Avatar key={m.id} id={m.id} name={m.name} at={s.avatars[m.id]} size={36} />),
          }))}
        />
      ))}
      {r && <Standings s={s} />}
      {r && <Graveyard fallen={r.fallen} meId={s.me.id} />}
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
      {back}
    </div>
  );
}

/** "Back to the lobby": the host restarts (after a confirm, results go away); the others ask the host. */
function BackToLobby({ canRestart, asked, hostName, onRestart, onAsk }: { canRestart: boolean; asked: boolean; hostName: string | null; onRestart: () => void; onAsk: () => void }) {
  const [confirm, setConfirm] = useState(false);
  if (!canRestart) {
    return (
      <div className="backlobby">
        <button type="button" className="btn" onClick={onAsk} disabled={asked}>{asked ? "✓ Richiesta mandata" : "↩ Chiedi di tornare in lobby"}</button>
        <span className="small muted">Torna in lobby {hostName ?? "l'organizzatore"} per tutti, con gli stessi giocatori.</span>
      </div>
    );
  }
  return (
    <div className="backlobby">
      {!confirm ? (
        <button type="button" className="btn a" onClick={() => setConfirm(true)}>↩ Torna alla lobby</button>
      ) : (
        <>
          <span className="small">Tutti tornano in lobby con gli stessi giocatori e si estraggono di nuovo ruoli e coppie. <b>Classifica, album e replay di questa partita non saranno più visibili.</b></span>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn" style={{ flex: 1 }} onClick={() => setConfirm(false)}>Annulla</button>
            <button type="button" className="btn a" style={{ flex: 1 }} onClick={onRestart}>Torna alla lobby</button>
          </div>
        </>
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
        <div className="notice" style={{ background: "var(--threat-soft)", color: "#ff5a62" }}>I cercatori vedono la tua zona: un cerchio di {s.game.zoneRadiusM} m che ti segue in tempo reale (tu sei dentro, non per forza al centro).</div>
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
  const zombie = s.cards.find((c) => c.code === "ZOMBIE" && c.state === "READY");
  const partner = s.fugitive?.partner;
  const [busy, setBusy] = useState(false);
  const rise = async () => {
    if (!zombie || !confirm("Usare la carta Zombie e tornare fuggiasco? Avrai una password nuova e 3 minuti di immunità.")) return;
    setBusy(true);
    try {
      const r = await post<{ message: string }>("/api/cards", { cardId: zombie.id });
      buzz([80, 60, 300]);
      playSfx("start");
      toast(r.message);
      refresh();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
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
      <GhostIntro playerId={`${s.me.id}-r${s.game.round}`} />
      <PhaseTimer s={s} now={now} />
      <div className="box ghost">
        <GhostLoop />
        <span className="lbl">Sei stato catturato</span>
        <div className="mega">Fantasma</div>
        {s.ghostCapture && (
          <div className="row"><span className="lbl">Punti rubati da fantasma</span><span className="big a num">{pts(s.ghostCapture.stolen)}</span></div>
        )}
        {zombie && (
          <button type="button" className="btn zombiebtn" onClick={rise} disabled={busy}>
            🧟 Risorgi con la carta Zombie
          </button>
        )}
        <p className="small muted">
          Adesso giochi con i cercatori: <b>catturi esattamente come loro</b>, con la password del fuggiasco (tranne il tuo ex
          compagno), e i punti rubati sono tuoi. Leggi e scrivi nel loro canale, e con il Sussurro riveli il settore di un fuggiasco a
          caso (mai il tuo ex partner). Si ricarica ogni 10 minuti.
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
  | { result: "PHASE"; phase: string }
  | { result: "PARTNER"; targetName: string };

export function Capture({ s, refresh, toast }: { s: GameState; refresh: () => void; toast: Toast }) {
  // Hunters and ghosts share this screen.
  const h = s.hunter ?? s.ghostCapture ?? { attemptsLeft: 0, lockedS: 0 };
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
            {v.result === "PARTNER" && "È IL TUO EX COMPAGNO"}
          </b>
          <span className="muted small">
            {v.result === "WRONG" && `Controlla con il fuggiasco come si scrive. ${v.attemptsLeft} tentativi prima del blocco di 60 s.`}
            {v.result === "ALREADY" && `${v.targetName} è già stato preso da ${v.capturedBy}.`}
            {v.result === "SHIELDED" && `Immune ancora per ${clock(v.shieldLeftS * 1000)}. Se lo scudo è partito dopo il tocco, contestate sul gruppo WhatsApp.`}
            {v.result === "LOCKED" && `Troppi errori. Riprova tra ${v.lockedS} s.`}
            {v.result === "PHASE" && "La cattura si apre quando finisce il vantaggio dei fuggiaschi."}
            {v.result === "PARTNER" && `${v.targetName} era in coppia con te: un fantasma non può catturare il proprio ex compagno.`}
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
  if (c.state === "LOCKED") return c.code === "ZOMBIE" ? "si usa da fantasma, per risorgere" : "si sblocca a caccia aperta";
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

/** Wall clock for the legend's "is the partner's fix old" check. */
const clockNow = () => Date.now();

export function MapTab({ s, fix, geoError }: { s: GameState; fix: Fix | null; geoError: string | null }) {
  const g = s.game;
  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const p of s.hunter?.pings ?? []) for (const [k, v] of Object.entries(p.sectors)) out[k] = Math.max(out[k] ?? 0, v);
    return out;
  }, [s.hunter?.pings]);
  const points = useMemo<MapPoint[]>(() => {
    const p = s.fugitive?.partner;
    return p && p.status === "ACTIVE" && p.lat != null && p.lng != null ? [{ id: "partner", lat: p.lat, lng: p.lng, kind: "partner", label: p.distanceM != null ? `${p.name} · ${p.distanceM} m` : p.name, fixAt: p.fixAt }] : [];
  }, [s.fugitive?.partner]);
  const meLook = s.me.role === "HUNTER" ? "hunter" : s.me.status === "CAPTURED" ? "ghost" : "fugitive";
  const [focus, setFocus] = useState<{ lng: number; lat: number; zoom: number; n: number } | null>(null);
  const goTo = (t: LegendTarget) => setFocus((f) => ({ ...t, n: (f?.n ?? 0) + 1 }));

  const quests = useMemo(
    () =>
      (s.fugitive?.missions ?? []).filter((m) => !m.special).map((m) => ({
        id: m.id, lat: m.lat, lng: m.lng, title: m.place, points: m.points, done: m.proofId != null,
        radiusM: m.radiusM, flash: m.flashUntil != null, reward: m.reward ?? null, abandoned: !!m.abandoned,
      })),
    [s.fugitive?.missions],
  );

  // Where each legend symbol is right now (nearest one to you), for "Mostra sulla mappa".
  const targets = useMemo<LegendTargets>(() => {
    const out: LegendTargets = {};
    const near = (a: { lat: number; lng: number }) => (fix ? (a.lat - fix.lat) ** 2 + ((a.lng - fix.lng) * 0.71) ** 2 : 0);
    const kindOf = (q: (typeof quests)[number]) =>
      q.done ? "done" : q.flash ? "flash" : q.reward === "ZOMBIE" ? "zombie" : q.reward ? "reward" : q.abandoned ? "abandoned" : "quest";
    for (const q of [...quests].sort((a, b) => near(a) - near(b))) out[kindOf(q)] ??= { lat: q.lat, lng: q.lng, zoom: 17 };
    if (fix) {
      out.me = { lat: fix.lat, lng: fix.lng, zoom: 17 };
      if (fix.acc > 12) out.acc = { lat: fix.lat, lng: fix.lng, zoom: 16.5 };
    }
    const p = points[0];
    if (p) out[p.fixAt && clockNow() - Date.parse(p.fixAt) > 120_000 ? "partnerOld" : "partner"] = { lat: p.lat, lng: p.lng, zoom: 17 };
    const zs = [...(s.hunter?.zones ?? [])].sort((a, b) => a.ageS - b.ageS);
    const hot = zs.find((z) => z.ageS < 90), old = zs.findLast((z) => z.ageS >= 90);
    if (hot) out.zoneHot = { lat: hot.lat, lng: hot.lng, zoom: 16 };
    if (old) out.zoneOld = { lat: old.lat, lng: old.lng, zoom: 16 };
    const sector = (id: string | undefined): LegendTarget | undefined => {
      const c = id ? sectorCenter(g.boundary, id) : null;
      return c ? { lng: c[0], lat: c[1], zoom: 15.5 } : undefined;
    };
    out.ping = sector(Object.keys(counts).find((k) => counts[k] > 0));
    out.track = sector(s.hunter?.track?.sector);
    const xs = g.boundary.map((b) => b[0]), ys = g.boundary.map((b) => b[1]);
    out.boundary = out.sectors = { lng: (Math.min(...xs) + Math.max(...xs)) / 2, lat: (Math.min(...ys) + Math.max(...ys)) / 2, zoom: 14.3 };
    for (const k of Object.keys(out) as (keyof LegendTargets)[]) if (!out[k]) delete out[k];
    return out;
  }, [quests, fix, points, s.hunter?.zones, s.hunter?.track?.sector, counts, g.boundary]);

  let edge: string | null = null;
  if (fix) {
    const inside = pointIn(fix.lng, fix.lat, g.boundary);
    edge = inside ? null : "Sei fuori dai confini. Rientra entro 60 s.";
  }

  return (
    <div className="mapfull">
      <MapView boundary={g.boundary} fix={fix} points={points} quests={quests} zones={s.hunter?.zones ?? []} sectorCounts={counts} tracked={s.hunter?.track?.sector ?? null} meLook={meLook} focus={focus} />
      <div className="mapover top">
        {geoError && <div className="alert">{geoError}</div>}
        {edge && <div className="alert">{edge}</div>}
        {s.hunter?.pings.length ? <span className="chip r glass">Ping attivo · {s.hunter.pings[0].hunter}</span> : null}
        {s.hunter?.track && <span className="chip fa">Traccia {s.hunter.track.sector}</span>}
        {s.hunter && s.game.phase === "LIVE" && <span className="chip glass">{s.hunter.zones.length} zone · in tempo reale</span>}
        {s.hunter && s.game.phase === "HEAD_START" && <span className="chip glass">Le zone dei fuggiaschi compaiono a caccia aperta</span>}
      </div>
      <div className="mapover bottom">
        <MapLegend look={meLook} targets={targets} onFocus={goTo} />
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

function chatLabel(s: GameState, c: Channel) {
  return c in CH_LABEL ? CH_LABEL[c as keyof typeof CH_LABEL] : s.groups.find((g) => g.channel === c)?.name ?? "Gruppo";
}

/** "Mara, Hugo e Anna" / "Mara, Hugo e altri 3": used when the group gets no name. */
function autoName(names: string[]) {
  if (names.length <= 3) return names.length > 1 ? `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}` : names[0] ?? "";
  return `${names.slice(0, 2).join(", ")} e altri ${names.length - 2}`;
}

/**
 * New group or add people to one. Built for big games: search, team filter, sections
 * (your partner, your team, the other team), picked people as removable chips on top,
 * optional name, and the button always in reach.
 */
function GroupSheet({ s, group, onClose, onDone, toast }: {
  s: GameState; group?: GameState["groups"][number]; onClose: () => void; onDone: (channel?: Channel) => void; toast: Toast;
}) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState<"ALL" | "HUNTER" | "FUGITIVE">("ALL");
  const [busy, setBusy] = useState(false);

  const inGroup = new Set(group?.members.map((m) => m.id) ?? []);
  const people = s.lobby.players.filter((p) => p.id !== s.me.id && !inGroup.has(p.id));
  const byId = new Map(people.map((p) => [p.id, p]));
  const norm = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const shown = people.filter((p) => (team === "ALL" || p.role === team) && norm(p.name).includes(norm(query.trim())));

  const myRole = s.me.role;
  const partner = shown.filter((p) => s.me.pairId && p.pairId === s.me.pairId);
  const mine = shown.filter((p) => p.role === myRole && !partner.includes(p));
  const others = shown.filter((p) => p.role !== myRole);
  const teamName = (r: string | null) => (r === "HUNTER" ? "Cercatori" : r === "FUGITIVE" ? "Fuggiaschi" : "Senza ruolo");
  const sections = [
    { key: "partner", title: "Il tuo compagno", list: partner },
    { key: "mine", title: myRole ? `La tua squadra · ${teamName(myRole)}` : "Giocatori", list: mine },
    { key: "others", title: myRole ? `Squadra avversaria · ${teamName(myRole === "HUNTER" ? "FUGITIVE" : "HUNTER")}` : "Altri", list: others },
  ].filter((x) => x.list.length);

  const toggle = (id: string) => setPicked((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  const toggleAll = (ids: string[]) =>
    setPicked((x) => (ids.every((id) => x.includes(id)) ? x.filter((y) => !ids.includes(y)) : [...new Set([...x, ...ids])]));

  const pickedPeople = picked.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
  const mixed = new Set([myRole, ...pickedPeople.map((p) => p.role)].filter(Boolean)).size > 1;
  const suggested = autoName([s.me.name, ...pickedPeople.map((p) => p.name)]);
  // Cut by characters, not UTF-16 units, so an emoji typed in the name is never split.
  const finalName = Array.from(name.trim() || suggested).slice(0, 30).join("");

  const submit = async () => {
    setBusy(true);
    try {
      const r = await post<{ channel?: Channel }>("/api/groups", group ? { action: "add", channel: group.channel, members: picked } : { action: "create", name: finalName, members: picked });
      toast(group ? `Aggiunt${picked.length === 1 ? "o" : "i"} a ${group.name}.` : `Gruppo "${finalName}" creato.`);
      onDone(r.channel);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const counts = { ALL: people.length, HUNTER: people.filter((p) => p.role === "HUNTER").length, FUGITIVE: people.filter((p) => p.role === "FUGITIVE").length };

  return (
    <Sheet title={group ? `Aggiungi a ${group.name}` : "Nuovo gruppo"} onClose={onClose}>
      {pickedPeople.length > 0 && (
        <div className="pickedrow" aria-label="Persone scelte">
          {!group && (
            <span className="picked me">
              <Avatar id={s.me.id} name={s.me.name} at={s.avatars[s.me.id]} size={44} kind={myRole === "HUNTER" ? "hunter" : "fugitive"} />
              <small>Tu</small>
            </span>
          )}
          {pickedPeople.map((p) => (
            <button type="button" key={p.id} className="picked" onClick={() => toggle(p.id)} aria-label={`Togli ${p.name}`}>
              <Avatar id={p.id} name={p.name} at={s.avatars[p.id]} size={44} kind={p.role === "HUNTER" ? "hunter" : "fugitive"} />
              <span className="x" aria-hidden="true">✕</span>
              <small>{p.name}</small>
            </button>
          ))}
        </div>
      )}

      {people.length === 0 ? (
        <p className="muted small">Non c&apos;è nessun altro da aggiungere.</p>
      ) : (
        <>
          {people.length > 6 && (
            <input className="input search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Cerca tra ${people.length} giocatori`} />
          )}
          <div className="seg filterseg" role="radiogroup" aria-label="Squadra">
            {(["ALL", "HUNTER", "FUGITIVE"] as const).map((t) => (
              <button type="button" key={t} role="radio" aria-checked={team === t} className={team === t ? "on" : ""} onClick={() => setTeam(t)}>
                {t === "ALL" ? "Tutti" : teamName(t)} <span className="n">{counts[t]}</span>
              </button>
            ))}
          </div>
          <div className="picklist">
            {sections.length === 0 && <p className="muted small">Nessuno con questo nome.</p>}
            {sections.map((sec) => {
              const ids = sec.list.map((p) => p.id);
              const all = ids.every((id) => picked.includes(id));
              return (
                <section key={sec.key} className="picksec">
                  <div className="pickhead">
                    <span className="lbl">{sec.title}</span>
                    {ids.length > 1 && <button type="button" className="linkbtn" onClick={() => toggleAll(ids)}>{all ? "Togli tutti" : "Scegli tutti"}</button>}
                  </div>
                  {sec.list.map((p) => {
                    const on = picked.includes(p.id);
                    return (
                      <button type="button" key={p.id} className={`pick ${on ? "on" : ""}`} onClick={() => toggle(p.id)} aria-pressed={on}>
                        <span className="avwrap">
                          <Avatar id={p.id} name={p.name} at={s.avatars[p.id]} size={38} kind={p.role === "HUNTER" ? "hunter" : "fugitive"} />
                          {on && <span className="badge" aria-hidden="true">✓</span>}
                        </span>
                        <span className="who">
                          <b>{p.name}</b>
                          <small>{p.spectator ? "Spettatore" : p.role === "HUNTER" ? "Cercatore" : p.role === "FUGITIVE" ? "Fuggiasco" : "Senza ruolo"}</small>
                        </span>
                        <span className={`radio ${on ? "on" : ""}`} aria-hidden="true" />
                      </button>
                    );
                  })}
                </section>
              );
            })}
          </div>
        </>
      )}

      <div className="sheetfoot">
        {!group && (
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={pickedPeople.length ? suggested : "Nome del gruppo (facoltativo)"} maxLength={30} enterKeyHint="done" />
        )}
        {mixed && <p className="mixwarn">Nel gruppo ci sono cercatori e fuggiaschi: tutti leggono tutto.</p>}
        <button type="button" className="btn a" disabled={busy || !picked.length} onClick={submit}>
          {busy ? "Un attimo…" : !picked.length ? "Scegli almeno una persona" : group ? `Aggiungi ${picked.length === 1 ? pickedPeople[0]?.name : `${picked.length} persone`}` : `Crea "${finalName}" · ${picked.length + 1}`}
        </button>
      </div>
    </Sheet>
  );
}

export function Comms({ s, messages, refresh, toast }: { s: GameState; messages: Message[]; refresh: () => void; toast: Toast }) {
  const [ch, setCh] = useState<Channel>(s.channels[0]);
  const [sheet, setSheet] = useState<"new" | "add" | null>(null);
  const [text, setText] = useState("");
  const channel = s.channels.includes(ch) ? ch : s.channels[0];
  const list = messages.filter((m) => m.channel === channel);
  const phase = s.game.phase;
  const canWrite = channel !== "BROADCAST" || phase === "LOBBY" || phase === "ENDED";
  const group = s.groups.find((g) => g.channel === channel);
  const leave = async () => {
    if (!group || !confirm(`Uscire da "${group.name}"?`)) return;
    try {
      await post("/api/groups", { action: "leave", channel: group.channel });
      setCh(s.channels[0]);
      refresh();
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

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
      <FlameDither className="chatbg" />
      <div className="chatbar">
        {s.channels.map((c) => (
          <button type="button" key={c} className={`chatchip glass ${c === channel ? "on" : ""} ${c.startsWith("G") ? "grp" : ""}`} onClick={() => setCh(c)}>
            {chatLabel(s, c)}
          </button>
        ))}
        <button type="button" className="chatchip glass add" onClick={() => setSheet("new")} aria-label="Nuovo gruppo">＋ Gruppo</button>
      </div>
      {group && (
        <div className="groupbar glass">
          <span className="members">{group.members.map((m) => (m.id === s.me.id ? "Tu" : m.name)).join(", ")}</span>
          <button type="button" className="btn sm" onClick={() => setSheet("add")}>Aggiungi</button>
          <button type="button" className="btn sm ghostbtn" onClick={leave}>Esci</button>
        </div>
      )}
      {sheet && (
        <GroupSheet
          s={s}
          group={sheet === "add" ? group : undefined}
          onClose={() => setSheet(null)}
          onDone={(c) => { setSheet(null); if (c) setCh(c); refresh(); }}
          toast={toast}
        />
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
                  <VoiceBubble id={m.id} ms={m.audio_ms} radio={m.radio} />
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
          <input id="chat-text" className="input" value={text} onChange={(e) => onType(e.target.value)} placeholder={channel === "BROADCAST" ? "Scrivi a tutti" : group ? `Scrivi in ${group.name}` : `Scrivi ai ${chatLabel(s, channel).toLowerCase()}`} maxLength={500} />
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
