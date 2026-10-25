"use client";
import { useState } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "./Avatar";
import { HoldButton } from "./HoldButton";
import { ShareGame } from "./Lobby";
import type { GameState } from "./types";
import { PushCheck } from "./PhoneSetup";
import { ago, clock, post, pts } from "./util";

type Toast = (text: string, bad?: boolean) => void;

/** Bottom sheet with a dimmed, blurred backdrop. Tap outside to close. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  // Rendered on <body>: opened from inside the chat (its own stacking layer) the nav bar would cover it.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="sheetwrap" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bsheet glass">
        <div className="row">
          <span className="title">{title}</span>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Chiudi">✕</button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" className="cell toggle" role="switch" aria-checked={on} onClick={() => onChange(!on)}>
      <span>{label}</span>
      <span className={`switch ${on ? "on" : ""}`}><i /></span>
    </button>
  );
}

export function SettingsSheet({ onClose, sound, setSound, vibe, setVibe, glassClear, setGlassClear, isHost, openHost, openRules, radioFx, setRadioFx, radioAuto, setRadioAuto, onDeleteData }: {
  onClose: () => void;
  onDeleteData: () => Promise<void>;
  radioFx: "police" | "ghost"; setRadioFx: (fx: "police" | "ghost") => void;
  radioAuto: boolean; setRadioAuto: (v: boolean) => void;
  sound: boolean; setSound: (v: boolean) => void;
  vibe: boolean; setVibe: (v: boolean) => void;
  glassClear: boolean; setGlassClear: (v: boolean) => void;
  isHost: boolean; openHost: () => void; openRules: () => void;
}) {
  return (
    <Sheet title="Impostazioni" onClose={onClose}>
      <div className="box" style={{ gap: 0, paddingBlock: 2 }}>
        <Toggle label="Suoni" on={sound} onChange={setSound} />
        <Toggle label="Vibrazione" on={vibe} onChange={setVibe} />
        <Toggle label="Vetro trasparente" on={glassClear} onChange={setGlassClear} />
      </div>
      <PushCheck />
      <div className="box">
        <span className="lbl">Radio · voce dei tuoi messaggi</span>
        <div className="seg" role="radiogroup" aria-label="Effetto voce radio">
          <button type="button" role="radio" aria-checked={radioFx === "police"} className={radioFx === "police" ? "on" : ""} onClick={() => setRadioFx("police")}>📻 Polizia</button>
          <button type="button" role="radio" aria-checked={radioFx === "ghost"} className={radioFx === "ghost" ? "on" : ""} onClick={() => setRadioFx("ghost")}>👻 Fantasma</button>
        </div>
      </div>
      <div className="box" style={{ gap: 0, paddingBlock: 2 }}>
        <Toggle label="Ascolta subito la radio della squadra" on={radioAuto} onChange={setRadioAuto} />
      </div>
      <p className="muted small">Con l&apos;ascolto automatico i messaggi radio partono dall&apos;altoparlante appena arrivano: in tasca vicino a un cercatore, si sentono.</p>
      <button type="button" className="btn" onClick={openRules}>Regole del gioco</button>
      {isHost && <button type="button" className="btn a" onClick={openHost}>Pannello organizzatore</button>}
      <p className="muted small legal-links"><a href="/regole" target="_blank" rel="noreferrer">Regole e sicurezza</a> · <a href="/privacy" target="_blank" rel="noreferrer">Privacy</a></p>
      <DeleteData onDelete={onDeleteData} />
    </Sheet>
  );
}

/** "Cancella i miei dati": hidden behind a second tap, then a 2-second hold. */
function DeleteData({ onDelete }: { onDelete: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!open) return <button type="button" className="linkbtn" onClick={() => setOpen(true)}>Cancella i miei dati</button>;
  return (
    <div className="dangerzone">
      <p>
        Cancelli te stesso dalla partita e tutto quello che hai lasciato: posizione e percorso, foto profilo, vocali, foto e video delle missioni che hai caricato, e il tuo rango con l&apos;account.
        I punti già vinti restano alla coppia. Non si può annullare.
      </p>
      <HoldButton label={busy ? "Cancello…" : "Tieni premuto per cancellare tutto"} ms={2000} disabled={busy} onFire={async () => { setBusy(true); await onDelete().finally(() => setBusy(false)); }} />
      <button type="button" className="linkbtn" onClick={() => setOpen(false)}>Annulla</button>
    </div>
  );
}

const PHASE_LABEL: Record<string, string> = { LOBBY: "In lobby", HEAD_START: "Vantaggio fuggiaschi", LIVE: "Caccia aperta", PAUSED: "In pausa", ENDED: "Finita" };

function Choice<T extends string | number>({ label, value, options, render, disabled, onPick }: {
  label: string; value: T; options: T[]; render: (v: T) => string; disabled: boolean; onPick: (v: T) => void;
}) {
  return (
    <div className="field">
      <span className="lbl">{label}</span>
      <div className="seg">
        {options.map((o) => (
          <button type="button" key={String(o)} className={o === value ? "on" : ""} disabled={disabled} onClick={() => o !== value && onPick(o)}>{render(o)}</button>
        ))}
      </div>
    </div>
  );
}

export function HostPanel({ s, now, refresh, toast, onClose }: { s: GameState; now: number; refresh: () => void; toast: Toast; onClose: () => void }) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const g = s.game;
  const running = g.phase === "HEAD_START" || g.phase === "LIVE" || g.phase === "PAUSED";
  const lobby = g.phase === "LOBBY";

  const act = async (body: Record<string, unknown>, ok?: string) => {
    setBusy(true);
    try {
      await post("/api/lobby", body);
      if (ok) toast(ok);
      refresh();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title="Organizzatore" onClose={onClose}>
      <ShareGame code={g.code} zoneName={g.zoneName} toast={toast} />

      <section className="field">
        <div className="row"><span className="lbl">Partita</span><span className={`chip ${g.phase === "PAUSED" ? "fr" : running ? "a" : ""}`}>{PHASE_LABEL[g.phase]}</span></div>
        {running && g.phase !== "PAUSED" && g.endsAt && <span className="muted small">Fine tra {clock(+new Date(g.endsAt) - now)}</span>}
        {(g.phase === "HEAD_START" || g.phase === "LIVE") && (
          <button type="button" className="btn" disabled={busy} onClick={() => act({ action: "pause" }, "Partita in pausa.")}>Metti in pausa</button>
        )}
        {g.phase === "PAUSED" && (
          <button type="button" className="btn a" disabled={busy} onClick={() => act({ action: "resume" }, "Si riparte!")}>Riprendi la partita</button>
        )}
        {running && (
          <div className="dangerhold">
            <HoldButton label="Tieni premuto per terminare la partita" ms={2000} disabled={busy} onFire={() => act({ action: "terminate" }, "Partita terminata.")} />
          </div>
        )}
      </section>

      <section className="field">
        <span className="lbl">Impostazioni {lobby ? "" : "(si cambiano in lobby)"}</span>
        <Choice label="Missioni" value={g.missionsMode} options={["chill", "abbandonati"] as ("chill" | "abbandonati")[]} render={(v) => (v === "chill" ? "Chill" : "Posti abbandonati")} disabled={!lobby || busy} onPick={(v) => act({ action: "settings", missionsMode: v })} />
        <Choice label="Durata della caccia" value={g.liveMin} options={g.options.live} render={(v) => `${v}′`} disabled={!lobby || busy} onPick={(v) => act({ action: "settings", liveMin: v })} />
        <Choice label="Vantaggio iniziale" value={g.headStartMin} options={g.options.headStart} render={(v) => `${v}′`} disabled={!lobby || busy} onPick={(v) => act({ action: "settings", headStartMin: v })} />
        <Choice label="Cerchio dei fuggiaschi" value={g.zoneRadiusM} options={g.options.radius} render={(v) => `${v} m`} disabled={!lobby || busy} onPick={(v) => act({ action: "settings", zoneRadiusM: v })} />
        <Choice label="Cercatori da estrarre" value={g.huntersN} options={[0, 1, 2, 3, 4, 5, 6]} render={(v) => (v === 0 ? `Auto (${g.huntersPlanned})` : String(v))} disabled={!lobby || busy} onPick={(v) => act({ action: "settings", huntersN: v })} />
      </section>

      <section className="field">
        <span className="lbl">Giocatori e codici di rientro</span>
        <div className="box" style={{ gap: 0, paddingBlock: 2 }}>
          {(s.hostView ?? []).map((p) => (
            <div key={p.id} className="cell" style={{ alignItems: "flex-start" }}>
              <span className="row" style={{ gap: 10, justifyContent: "flex-start", minWidth: 0 }}>
                <Avatar id={p.id} name={p.name} at={s.avatars[p.id]} size={32} kind={p.role === "HUNTER" ? "hunter" : "fugitive"} />
                <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <b style={{ fontSize: 15 }}>{p.name}{p.id === s.me.id ? " (tu)" : ""}</b>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {p.role === "HUNTER" ? "Cercatore" : "Fuggiasco"}{p.spectator ? " · spettatore" : p.status === "CAPTURED" ? " · fantasma" : ""}
                    {p.lastSeen ? ` · visto ${ago(now - +new Date(p.lastSeen))}` : ""}
                  </span>
                </span>
              </span>
              <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                <span className="code">{p.rejoinCode}</span>
                {p.id !== s.me.id && (
                  confirm === p.id ? (
                    <span className="row" style={{ gap: 6 }}>
                      <button type="button" className="chip r" onClick={() => { setConfirm(null); act({ action: "remove", playerId: p.id }, `${p.name} espulso.`); }}>Espelli</button>
                      <button type="button" className="chip" onClick={() => setConfirm(null)}>No</button>
                    </span>
                  ) : confirm === `host:${p.id}` ? (
                    <span className="row" style={{ gap: 6 }}>
                      <button type="button" className="chip a" onClick={() => { setConfirm(null); act({ action: "makeHost", playerId: p.id }, `${p.name} ora è l'organizzatore.`); onClose(); }}>Conferma</button>
                      <button type="button" className="chip" onClick={() => setConfirm(null)}>No</button>
                    </span>
                  ) : (
                    <span className="row" style={{ gap: 6 }}>
                      <button type="button" className="chip" onClick={() => setConfirm(`host:${p.id}`)}>Passa</button>
                      <button type="button" className="chip" onClick={() => setConfirm(p.id)}>Espelli</button>
                    </span>
                  )
                )}
              </span>
            </div>
          ))}
        </div>
        <span className="muted small">Se qualcuno esce, dagli il suo codice: tocca &quot;Rientra&quot; e lo inserisce.</span>
      </section>
    </Sheet>
  );
}

export function RulesSheet({ s, onClose }: { s: GameState; onClose: () => void }) {
  const g = s.game;
  return (
    <Sheet title="Regole del gioco" onClose={onClose}>
      <div className="rules">
        <h4>Le squadre</h4>
        <p>I ruoli <b>non si scelgono</b>: l&apos;organizzatore li estrae a sorte in lobby. <b>Cercatori</b> da soli contro <b>fuggiaschi</b> in coppia. Il compagno invece lo scegliete voi: quando due fuggiaschi si scelgono a vicenda sono una coppia; chi resta da solo viene accoppiato a caso. Ogni coppia parte con 1.500 punti.</p>
        <h4>La partita</h4>
        <p>{g.headStartMin} minuti di vantaggio ai fuggiaschi, poi {g.liveMin} minuti di caccia a {g.zoneName}. Restate dentro il confine viola sulla mappa.</p>
        <h4>Eventi della notte</h4>
        <p><b>🩸 Luna di Sangue:</b> 30 minuti prima della fine, per 5 minuti, i cercatori vedono i cerchi grandi la metà e missioni e tesori valgono doppio.</p>
        <p><b>⚠️ Zona che si restringe:</b> negli ultimi 15 minuti il confine si stringe verso il centro fino a metà. Vale la linea rossa: chi resta fuori più di 60 s viene segnalato.</p>
        <p><b>💰 Tesori:</b> ogni 8 minuti ne compare uno in un posto pubblico della zona, per 6 minuti. Il primo fuggiasco che arriva entro 30 m prende 300–500 punti per la coppia. Lo vedono anche i cercatori.</p>
        <p><b>👁️ Chi sta fermo si vede:</b> un fuggiasco che resta nello stesso punto (40 m) per 10 minuti compare sulla mappa dei cercatori, nel punto esatto, per 45 secondi. La Nebbia lo protegge.</p>
        <p><b>🎯 Taglia:</b> la coppia più ricca (se ne restano almeno due) vale {pts(500)} punti in più a ogni cattura.</p>
        <h4>Fuggiaschi</h4>
        <p>Fate le missioni ({g.missionsMode === "abbandonati" ? "posti abbandonati" : "chill"}): una foto o un video sul posto, entro 40 m. Ogni 20 minuti una <b>missione lampo</b> vale doppio. I cercatori vedono la vostra zona come un cerchio di {g.zoneRadiusM} m.</p>
        <h4>Cercatori</h4>
        <p>Toccate un fuggiasco: vi dice la password e la scrivete in <b>Cattura</b>. Rubate metà dei punti della sua coppia (tutti, se è l&apos;ultimo) più {g.captureBounty} di taglia.</p>
        <h4>Carte</h4>
        <p>Ghost Shield (immunità), Nebbia (sparite dalla mappa), Eco (cerchio finto) per i fuggiaschi; Radar Ping e Traccia per i cercatori. Gli effetti durano 5 minuti.</p>
        <p>Alcune missioni, segnate con 🃏, <b>sbloccano una carta</b> per chi carica la prova: Ghost Shield, Eco o la rara <b>Zombie</b>, che da fantasma ti fa risorgere (password nuova, 3 minuti di immunità, una volta sola).</p>
        <p><b>Agguati e scherzetti:</b> missioni senza un posto fisso. Gli agguati valgono solo se un cercatore è davvero vicino quando inviate la prova; quelle con i passanti solo con chi accetta di giocare. Tutti hanno anche una carta <b>Jumpscare</b>: un avversario a caso si ritrova un&apos;apparizione a tutto schermo con urlo e vibrazione.</p>
        <h4>Fantasmi</h4>
        <p>Chi viene catturato passa con i cercatori: <b>cattura esattamente come loro</b> con la password (mai il proprio ex compagno), i punti rubati sono suoi e conta nella classifica dei cercatori. In più ha il <b>Sussurro</b> per rivelare il settore di un fuggiasco, e la <b>voce nel buio</b>: ogni 2 minuti può mandare una frase inquietante a un fuggiasco a caso, che non sa chi è stato.</p>
        <h4>Chi vince</h4>
        <p>Se sono tutti presi vince il cercatore (o il fantasma) con più punti. Altrimenti, allo scadere, vince la coppia ancora in gioco con più punti.</p>
        <h4>Ranghi</h4>
        <p>Il rango resta al tuo telefono da una partita all&apos;altra: Novellino, Ombra (40 RP), Predatore (100), Spettro (200), Incubo (350), Leggenda (550). Si sale solo sul podio: 30 RP al primo posto, 20 al secondo, 10 al terzo. Se vincono i cercatori il podio è dei cercatori, se vincono i fuggiaschi delle coppie (a tutti e due). Contano solo le partite con almeno 4 giocatori in strada. I migliori sono nella <a href="/classifica" target="_blank" rel="noreferrer">classifica di Bologna</a>.</p>
        <h4>Sicurezza</h4>
        <p>Si gioca di notte in strada: attenzione al traffico, niente corse in carreggiata, rispetto per chi abita lì. I luoghi abbandonati al buio possono essere pericolosi e spesso sono proprietà privata.</p>
      </div>
    </Sheet>
  );
}

/** What a late joiner sees while a game runs: clock, scores and the "Tutti" chat. */
export function SpectatorView({ s, now }: { s: GameState; now: number }) {
  const g = s.game;
  const r = s.results;
  return (
    <div className="pad">
      <div>
        <div className="lbl">{g.zoneName} · stai guardando</div>
        <div className="largetitle">Sei spettatore</div>
      </div>
      <div className="notice">Sei arrivato a partita iniziata: la segui da qui e giochi dalla prossima.</div>
      <div>
        <div className="lbl">{g.phase === "PAUSED" ? "Partita" : g.phase === "HEAD_START" ? "Vantaggio fuggiaschi" : "Tempo rimasto"}</div>
        <div className="timer">
          {g.phase === "PAUSED" ? "In pausa" : g.phase === "HEAD_START" ? clock(+new Date(g.liveAt!) - now) : g.endsAt ? clock(+new Date(g.endsAt) - now) : "--:--"}
        </div>
      </div>
      {r && (
        <div className="cols2">
          <div className="lb">
            <span className="lbl">Cercatori</span>
            {r.hunters.map((h, i) => <div key={h.id}><span>{i + 1}</span><span>{h.name}</span><span>{pts(h.stolen)}</span></div>)}
          </div>
          <div className="lb">
            <span className="lbl">Coppie</span>
            {r.pairs.map((p, i) => <div key={p.id}><span>{i + 1}</span><span>{p.name}{p.active === 0 ? " ✕" : ` · ${p.active}/2`}</span><span>{pts(p.pool)}</span></div>)}
          </div>
        </div>
      )}
    </div>
  );
}
