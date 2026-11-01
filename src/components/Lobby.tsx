"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Avatar, AvatarPicker, uploadAvatar } from "./Avatar";
import { Cobwebs } from "./Cobwebs";
import { ShaderBackground } from "@/components/ui/ass";
import { HoldButton } from "./HoldButton";
import { PhoneSetup } from "./PhoneSetup";
import { PumpkinCat } from "./PumpkinCat";
import type { GameState } from "./types";
import { post } from "./util";
import { RoleCharacter } from "./GhostAnim";
import { CardBack } from "./CardBack";
import { AccountBox, profileKey, RankBadge, RankPanel, RecoverForm } from "./Rank";
import { play } from "./sound";
import { buzz } from "./util";

type Toast = (text: string, bad?: boolean) => void;

const ZONE_OPTIONS = [
  { key: "cirenaica", name: "Cirenaica", desc: "Piazzetta degli Umarells, Via Paolo Fabbri 43, Teatro Dehon." },
  { key: "sandonato", name: "San Donato", desc: "Mercato San Donato, Le 8 province, Palazzo degli Affari." },
  { key: "bolognina", name: "Bolognina", desc: "Piazza dell'Unità, Parco della Zucca, ex Caserma Sani." },
  { key: "santostefano", name: "Santo Stefano", desc: "Due Torri, Strada Maggiore, Giardini Margherita, ex Staveco." },
] as const;
type ZoneOption = (typeof ZONE_OPTIONS)[number]["key"];

/** Real nearby places from Italian Wikipedia, fetched in the browser (a normal IP, no datacenter blocking). */
async function wikiPlaces(lat: number, lng: number, radiusM: number): Promise<{ name: string; lat: number; lng: number }[]> {
  try {
    const r = Math.max(120, Math.min(10_000, Math.round(radiusM)));
    const url = `https://it.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat}%7C${lng}&gsradius=${r}&gslimit=50&format=json&origin=*`;
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const d = (await resp.json()) as { query?: { geosearch?: { title: string; lat: number; lon: number }[] } };
    return (d.query?.geosearch ?? [])
      .filter((g) => g.title && g.lat != null && g.lon != null)
      .slice(0, 30)
      .map((g) => ({ name: g.title, lat: g.lat, lng: g.lon }));
  } catch {
    return [];
  }
}

export function Join({ onDone, onGuide }: { onDone: () => void; onGuide?: () => void }) {
  const [mode, setMode] = useState<"create" | "join" | "code">("join");
  const [gameCode, setGameCode] = useState("");
  const [zone, setZone] = useState<ZoneOption | "custom">("cirenaica");
  const [customName, setCustomName] = useState("");
  const [customCenter, setCustomCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [customRadius, setCustomRadius] = useState(500);
  const [customAi, setCustomAi] = useState(true);
  const [geoBusy, setGeoBusy] = useState(false);
  const [missionsMode, setMissionsMode] = useState<"chill" | "abbandonati">("chill");
  const [found, setFound] = useState<{ zoneName: string; players: number; phase: string } | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [abandonOk, setAbandonOk] = useState(false);
  const [recover, setRecover] = useState(false);
  const [recoverMsg, setRecoverMsg] = useState<{ text: string; bad: boolean } | null>(null);

  // A shared link (…/?p=ABCDE) opens straight on "Entra" with the game code filled in.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("p");
    const t = setTimeout(() => {
      if (p) {
        setMode("join");
        setGameCode(p.toUpperCase().slice(0, 5));
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // Look the game up as soon as the code is complete, so you know where you're joining.
  useEffect(() => {
    if (mode !== "join" || gameCode.length !== 5) {
      const t = setTimeout(() => setFound(null), 0);
      return () => clearTimeout(t);
    }
    let alive = true;
    fetch(`/api/game?code=${gameCode}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d.error) { setFound(null); setErr(d.error); } else { setFound(d); setErr(null); }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [mode, gameCode]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      // For an AI custom zone, gather the real nearby places here in the browser and send them along.
      const places = mode === "create" && zone === "custom" && customCenter && customAi
        ? await wikiPlaces(customCenter.lat, customCenter.lng, customRadius)
        : [];
      const body =
        mode === "create" ? {
          action: "create", zone, missionsMode, name, consent, profile: profileKey(),
          ...(zone === "custom" && customCenter
            ? { custom: { name: customName, lat: customCenter.lat, lng: customCenter.lng, radiusM: customRadius, ai: customAi, ...(places.length ? { places } : {}) } }
            : {}),
        }
        : mode === "join" ? { action: "join", gameCode, name, consent, profile: profileKey() }
        : { action: "rejoin", code };
      await post("/api/lobby", body);
      if (mode !== "code" && photo) await uploadAvatar(photo).catch(() => {});
      if (window.location.search) window.history.replaceState(null, "", "/");
      onDone();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) { setErr("Il telefono non espone la posizione."); return; }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setCustomCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGeoBusy(false); setErr(null); },
      () => { setGeoBusy(false); setErr("Non riesco a prendere la posizione: concedi il permesso GPS e riprova."); },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const who = (
    <>
      <label className="joinphoto">
        <span className="avpick">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="av" src={preview} alt="" style={{ width: 64, height: 64 }} />
          ) : (
            <span className="av av-fugitive" style={{ width: 64, height: 64, fontSize: 26 }}>{name.trim().slice(0, 1).toUpperCase() || "?"}</span>
          )}
          <span className="avpick-badge" aria-hidden="true">+</span>
        </span>
        <span className="small muted">{photo ? "Foto scelta. Tocca per cambiarla." : "Aggiungi una foto profilo (facoltativa)"}</span>
        <input
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setPhoto(f);
            setPreview(URL.createObjectURL(f));
          }}
        />
      </label>
      <label className="field">
        <span className="lbl">Il tuo nome</span>
        <input id="join-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} autoComplete="nickname" placeholder="Mara" />
      </label>
      <p className="muted small">Il ruolo non si sceglie: cercatori e fuggiaschi si estraggono a sorte in lobby. Il compagno di fuga invece lo scegliete voi.</p>
      <label className="consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          Accetto le <a href="/regole" target="_blank" rel="noreferrer">regole e la sicurezza</a> e la{" "}
          <a href="/privacy" target="_blank" rel="noreferrer">privacy</a>.
        </span>
      </label>
    </>
  );

  return (
    <form className="login" onSubmit={submit}>
      <div className="loginbg" aria-hidden="true"><ShaderBackground /></div>
      <Cobwebs />
      <div className="lbl brand">Halloween · Bologna</div>
      <div className="hero">
        <h1>Night<br /><span>Hunt</span></h1>
        <PumpkinCat />
      </div>
      <div className="sheet glass">
        <div className="seg">
          <button type="button" className={mode === "join" ? "on" : ""} onClick={() => { setMode("join"); setErr(null); }}>Entra</button>
          <button type="button" className={mode === "create" ? "on" : ""} onClick={() => { setMode("create"); setErr(null); }}>Crea</button>
          <button type="button" className={mode === "code" ? "on" : ""} onClick={() => { setMode("code"); setErr(null); }}>Rientra</button>
        </div>

        {mode === "join" && (
          <>
            <label className="field">
              <span className="lbl">Codice partita</span>
              <input id="join-game" className="input pwfield" value={gameCode} onChange={(e) => setGameCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))} autoCapitalize="characters" autoCorrect="off" spellCheck={false} placeholder="K7M2Q" />
            </label>
            {found ? (
              <div className="notice">Partita a {found.zoneName} · {found.players} {found.players === 1 ? "giocatore" : "giocatori"}{found.phase === "LOBBY" ? " · in lobby" : found.phase === "ENDED" ? " · appena finita" : " · in corso"}</div>
            ) : (
              <span className="muted small">Chiedi le 5 lettere a chi ha creato la partita, o apri il link che ti ha mandato.</span>
            )}
            {who}
            <button type="submit" className="btn a" disabled={busy || !consent || gameCode.length !== 5 || name.trim().length < 2}>{busy ? "Entro…" : "Entra in partita"}</button>
          </>
        )}

        {mode === "create" && (
          <>
            <div className="field">
              <span className="lbl">Zona di gioco</span>
              <div className="zones">
                {ZONE_OPTIONS.map((z) => (
                  <button type="button" key={z.key} className={`zonecard ${zone === z.key ? "on" : ""}`} onClick={() => setZone(z.key)} aria-pressed={zone === z.key}>
                    <b>{z.name}</b>
                    <span>{z.desc}</span>
                  </button>
                ))}
                <button type="button" className={`zonecard ${zone === "custom" ? "on" : ""}`} onClick={() => setZone("custom")} aria-pressed={zone === "custom"}>
                  <b>📍 La mia zona</b>
                  <span>Gioca ovunque: segna il centro e il raggio della vostra area.</span>
                </button>
              </div>
            </div>
            {zone === "custom" ? (
              <div className="field">
                <label className="field">
                  <span className="lbl">Nome della zona</span>
                  <input className="input" value={customName} onChange={(e) => setCustomName(e.target.value)} maxLength={40} placeholder="Trastevere, Roma" />
                </label>
                <button type="button" className="btn" onClick={useMyLocation} disabled={geoBusy}>
                  {geoBusy ? "Prendo la posizione…" : customCenter ? "Posizione segnata ✓ · aggiorna" : "📍 Usa la mia posizione come centro"}
                </button>
                {customCenter && <span className="muted small">Centro: {customCenter.lat.toFixed(5)}, {customCenter.lng.toFixed(5)}</span>}
                <span className="lbl" style={{ marginTop: 8 }}>Raggio dell&apos;area</span>
                <div className="seg">
                  {[300, 500, 800, 1200].map((r) => (
                    <button type="button" key={r} className={customRadius === r ? "on" : ""} onClick={() => setCustomRadius(r)}>{r >= 1000 ? `${r / 1000} km` : `${r} m`}</button>
                  ))}
                </div>
                <label className="consent" style={{ marginTop: 10 }}>
                  <input type="checkbox" checked={customAi} onChange={(e) => setCustomAi(e.target.checked)} />
                  <span>Genera missioni su misura con l&apos;AI dai luoghi reali della zona (richiede qualche secondo in più). Se non riesce, usa missioni generiche.</span>
                </label>
                <span className="muted small">Le missioni di una zona personalizzata si possono fare ovunque dentro l&apos;area.</span>
              </div>
            ) : (
              <div className="field">
                <span className="lbl">Missioni</span>
                <div className="seg">
                  <button type="button" className={missionsMode === "chill" ? "on" : ""} onClick={() => setMissionsMode("chill")}>Chill</button>
                  <button type="button" className={missionsMode === "abbandonati" ? "on" : ""} onClick={() => setMissionsMode("abbandonati")}>Posti abbandonati</button>
                </div>
                <span className="muted small">{missionsMode === "chill" ? "Piazze, parchi e luoghi del quartiere." : "Edifici e luoghi abbandonati del quartiere, più qualche missione classica se sono pochi."}</span>
                {missionsMode === "abbandonati" && (
                  <label className="consent abandonwarn">
                    <input type="checkbox" checked={abandonOk} onChange={(e) => setAbandonOk(e.target.checked)} />
                    <span>
                      Ho capito: i posti abbandonati possono essere pericolanti, e entrare in un edificio privato o recintato è reato.
                      Le missioni si fanno da fuori, salvo luoghi aperti a tutti, e ognuno decide per sé.
                    </span>
                  </label>
                )}
              </div>
            )}
            {who}
            <button type="submit" className="btn a" disabled={busy || !consent || (zone !== "custom" && missionsMode === "abbandonati" && !abandonOk) || name.trim().length < 2 || (zone === "custom" && (!customCenter || customName.trim().length < 2))}>{busy ? "Creo…" : zone === "custom" ? "Crea partita qui" : `Crea partita a ${ZONE_OPTIONS.find((z) => z.key === zone)!.name}`}</button>
            <span className="muted small">Diventi l&apos;organizzatore: poi condividi il codice (o il link) con il tuo gruppo.</span>
          </>
        )}

        {mode === "code" && (
          <>
            <label className="field">
              <span className="lbl">Il tuo codice di rientro</span>
              <input id="join-code" className="input pwfield" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={4} autoCapitalize="characters" autoCorrect="off" spellCheck={false} placeholder="AB3K" />
            </label>
            <span className="muted small">Sono le 4 lettere che trovi in lobby e nell&apos;HUD. Servono se cambi telefono o chiudi il browser.</span>
            <button type="submit" className="btn a" disabled={busy || code.trim().length !== 4}>{busy ? "Entro…" : "Rientra"}</button>
          </>
        )}
        {err && <div className="notice" style={{ background: "var(--threat-soft)", color: "#ff5a62" }}>{err}</div>}
      </div>
      {onGuide && <button type="button" className="linkbtn guidelink" onClick={onGuide}>Come funziona? Rivedi la guida</button>}
      <div className="joinrecover">
        <button type="button" className="linkbtn" onClick={() => setRecover(!recover)}>Hai già un rango su un altro telefono? Recuperalo</button>
        {recover && <RecoverForm toast={(text, bad = false) => setRecoverMsg({ text, bad })} onDone={() => setRecover(false)} />}
        {recoverMsg && <div className="notice" style={recoverMsg.bad ? { background: "var(--threat-soft)", color: "#ff5a62" } : undefined}>{recoverMsg.text}</div>}
      </div>
      <p className="muted small legal-links"><a href="/classifica">🏆 Classifica di Bologna</a> · <a href="/regole">Regole e sicurezza</a> · <a href="/privacy">Privacy</a></p>
    </form>
  );
}

/** Game code with share + QR: the link (and the QR) open the join screen with the code already filled in. */
export function ShareGame({ code, zoneName, toast }: { code: string; zoneName: string; toast: Toast }) {
  const [qr, setQr] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const url = () => `${window.location.origin}/?p=${code}`;
  const share = async () => {
    const text = `Night Hunt a ${zoneName}: entra con il codice ${code}`;
    try {
      if (navigator.share) await navigator.share({ title: "Night Hunt", text, url: url() });
      else {
        await navigator.clipboard.writeText(`${text} ${url()}`);
        toast("Link copiato: incollalo nel gruppo.");
      }
    } catch {
      // share sheet closed: nothing to do
    }
  };
  const toggleQr = async () => {
    if (!showQr && !qr) {
      try {
        setQr(await QRCode.toDataURL(url(), { width: 240, margin: 1, color: { dark: "#0b0b12", light: "#ffffff" } }));
      } catch { toast("Non riesco a generare il QR.", true); return; }
    }
    setShowQr((v) => !v);
  };
  return (
    <div className="box a gamecode">
      <div className="gamecode-row">
        <div>
          <span className="lbl">Codice partita</span>
          <span className="code big-code">{code}</span>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn sm" onClick={toggleQr} aria-pressed={showQr}>{showQr ? "Nascondi QR" : "QR"}</button>
          <button type="button" className="btn a sm" onClick={share}>Condividi</button>
        </div>
      </div>
      {showQr && qr && (
        <div className="qrbox">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR per entrare in partita" width={240} height={240} style={{ borderRadius: 12 }} />
          <span className="muted small">Fai inquadrare questo QR: si entra dritti in partita.</span>
        </div>
      )}
    </div>
  );
}

/** The role as a face-down card: tap to turn it over (once per round; then it stays turned). */
function RoleCard({ role, revealKey }: { role: "HUNTER" | "FUGITIVE" | null; revealKey: string }) {
  const seen = () => { try { return localStorage.getItem(revealKey) === "1"; } catch { return false; } };
  const [open, setOpen] = useState(() => typeof window !== "undefined" && role != null && seen());
  const [shake, setShake] = useState(false);
  const reveal = () => {
    if (!role || open) return;
    setShake(true);
    setTimeout(() => {
      setShake(false);
      setOpen(true);
      play("card");
      buzz(role === "HUNTER" ? [80, 60, 160] : [60, 40, 60]);
      try { localStorage.setItem(revealKey, "1"); } catch {}
    }, 450);
  };
  const hunter = role === "HUNTER";
  return (
    <>
      <button type="button" className={`rolecard ${open ? "open" : ""} ${shake ? "shake" : ""}`} onClick={reveal} disabled={!role} aria-label={role ? (open ? (hunter ? "Sei un cercatore" : "Sei un fuggiasco") : "Tocca per scoprire il tuo ruolo") : "Ruolo non ancora estratto"}>
        <span className="rc-inner">
          <span className={`rc-face rc-back ${role ? "ready" : "waiting"}`}>
            <CardBack ready={!!role} label={role ? "Tocca per scoprire" : "In attesa dell'estrazione"} />
          </span>
          {role && (
            <span className={`rc-face rc-front ${hunter ? "hunter" : "fugitive"}`}>
              {open && <RoleCharacter role={role} size={120} />}
              <span className="rc-role">{hunter ? "Cercatore" : "Fuggiasco"}</span>
              <span className="rc-sub">{hunter ? "Dai la caccia ai fuggiaschi e ruba i loro punti." : "Scappa con il tuo compagno e fai le missioni."}</span>
            </span>
          )}
        </span>
      </button>
      {!role && <p className="muted small" style={{ textAlign: "center", margin: 0 }}>Cercatore o fuggiasco? Lo decide la sorte quando l&apos;organizzatore estrae i ruoli.</p>}
    </>
  );
}

export function Lobby({ s, refresh, toast, openRules, openHost }: { s: GameState; refresh: () => void; toast: Toast; openRules?: () => void; openHost?: () => void }) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const players = s.lobby.players;
  const hunters = players.filter((p) => p.role === "HUNTER");
  const fugitives = players.filter((p) => p.role === "FUGITIVE");
  const waiting = players.filter((p) => !p.role && !p.spectator);
  const canDraw = hunters.length >= 1 && fugitives.length >= 2;
  const rolesDrawn = s.game.rolesDrawn;
  const canDrawRoles = players.filter((p) => !p.spectator).length >= 3;
  // Partner choices: two fugitives who picked each other are a pair.
  const byId = new Map(players.map((p) => [p.id, p]));
  const mateOf = (p: (typeof players)[number]) => {
    const o = p.partnerPick ? byId.get(p.partnerPick) : undefined;
    return o && o.partnerPick === p.id ? o : null;
  };
  const meP = byId.get(s.me.id);
  const myMate = meP ? mateOf(meP) : null;
  const pairedCount = fugitives.filter((f) => mateOf(f)).length;
  const myPair = s.lobby.pairs.find((p) => p.id === s.me.pairId);
  const isHost = s.game.hostId === s.me.id;
  const canLead = isHost || s.game.hostStale;

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

  const row = (p: (typeof players)[number]) => {
    const me = p.id === s.me.id;
    const host = p.id === s.game.hostId;
    return (
      <div key={p.id} className="cell">
        <span className="row" style={{ gap: 10, justifyContent: "flex-start", minWidth: 0 }}>
          <Avatar id={p.id} name={p.name} at={s.avatars[p.id]} size={34} kind="fugitive" />
          <span style={{ fontWeight: me ? 600 : 400, color: me ? "var(--accent)" : undefined }}>{p.name}{me ? " (tu)" : ""}</span>
          <RankBadge index={p.rank} size={18} />
          {host && <span className="chip a">Organizzatore</span>}
          {rolesDrawn && !s.game.drawn && p.role === "FUGITIVE" && (mateOf(p) ? <span className="chip fa">coppia ✓</span> : p.partnerPick ? <span className="chip">ha scelto {byId.get(p.partnerPick)?.name}</span> : null)}
        </span>
        {confirm === p.id ? (
          <span className="row" style={{ gap: 6 }}>
            <button type="button" className="chip r" onClick={() => { setConfirm(null); act({ action: "remove", playerId: p.id }, me ? "Sei uscito dalla lobby." : `${p.name} tolto dalla lobby.`); }}>{me ? "Esci" : "Togli"}</button>
            <button type="button" className="chip" onClick={() => setConfirm(null)}>Annulla</button>
          </span>
        ) : confirm === `host:${p.id}` ? (
          <span className="row" style={{ gap: 6 }}>
            <button type="button" className="chip a" onClick={() => { setConfirm(null); act({ action: "makeHost", playerId: p.id }, `${p.name} ora è l'organizzatore.`); }}>Conferma</button>
            <button type="button" className="chip" onClick={() => setConfirm(null)}>Annulla</button>
          </span>
        ) : me ? (
          <button type="button" className="chip" onClick={() => setConfirm(p.id)}>Esci</button>
        ) : isHost ? (
          <span className="row" style={{ gap: 6 }}>
            <button type="button" className="chip" onClick={() => setConfirm(`host:${p.id}`)} aria-label={`Rendi ${p.name} organizzatore`}>Passa</button>
            <button type="button" className="chip" onClick={() => setConfirm(p.id)} aria-label={`Togli ${p.name}`}>Togli</button>
          </span>
        ) : null}
      </div>
    );
  };

  const list = (title: string, ps: typeof players) => (
    <section className="field">
      <div className="row"><span className="lbl">{title}</span><span className="chip">{ps.length}</span></div>
      <div className="box" style={{ gap: 0, paddingBlock: 2 }}>
        {ps.length === 0 && <span className="muted small cell">Ancora nessuno.</span>}
        {ps.map(row)}
      </div>
    </section>
  );

  return (
    <div className="pad">
      <div>
        <div className="lbl">{s.game.zoneName} · lobby · round {s.game.round}</div>
        <div className="largetitle">{s.game.drawn ? "Coppie fatte" : rolesDrawn ? "Sceglietevi il compagno" : "Chi gioca stasera?"}</div>
      </div>

      <ShareGame code={s.game.code} zoneName={s.game.zoneName} toast={toast} />

      <div className="box">
        <span className="lbl">Questa partita</span>
        <span className="small">
          Missioni <b>{s.game.missionsMode === "abbandonati" ? "posti abbandonati" : "chill"}</b> · caccia <b>{s.game.liveMin}′</b> · vantaggio <b>{s.game.headStartMin}′</b> · cerchio <b>{s.game.zoneRadiusM} m</b>
        </span>
        <div className="row" style={{ gap: 8 }}>
          {openRules && <button type="button" className="btn sm" style={{ flex: 1 }} onClick={openRules}>Come si gioca</button>}
          {openHost && isHost && <button type="button" className="btn a sm" style={{ flex: 1 }} onClick={openHost}>Impostazioni partita</button>}
        </div>
      </div>

      <PhoneSetup toast={toast} />

      <div className="box">
        <div className="row">
          <span className="row" style={{ gap: 12, justifyContent: "flex-start" }}>
            <AvatarPicker id={s.me.id} name={s.me.name} at={s.avatars[s.me.id]} size={48} kind="fugitive" onDone={() => { toast("Foto profilo aggiornata."); refresh(); }} onError={(m) => toast(m, true)} />
            <span className="lbl">Il tuo ruolo</span>
          </span>
          <span className="small muted">rientro <span className="code">{s.me.rejoinCode}</span></span>
        </div>
        <RoleCard key={`${s.me.id}-r${s.game.round}-${s.me.role ?? "none"}`} role={s.me.role} revealKey={`cnh_reveal_${s.me.id}_r${s.game.round}`} />
      </div>
      {s.rank && <RankPanel rank={s.rank} />}
      <AccountBox key={s.rank?.account ?? "none"} rank={s.rank} refresh={refresh} toast={toast} />

      {rolesDrawn && !s.game.drawn && s.me.role === "FUGITIVE" && (
        <section className="field">
          <div className="row"><span className="lbl">Il tuo compagno</span>{myMate && <span className="chip fa">coppia fatta</span>}</div>
          {myMate ? (
            <div className="notice row" style={{ justifyContent: "space-between" }}>
              <span>Fai coppia con <b>{myMate.name}</b>.</span>
              <button type="button" className="chip" disabled={busy} onClick={() => act({ action: "pick", partnerId: null })}>Sciogli</button>
            </div>
          ) : (
            <>
              <p className="muted small">Tocca chi vuoi come compagno. Quando anche lui sceglie te, la coppia è fatta. Chi resta da solo viene accoppiato a caso.</p>
              <div className="box" style={{ gap: 0, paddingBlock: 2 }}>
                {fugitives.filter((f) => f.id !== s.me.id && !f.spectator).length === 0 && <span className="muted small cell">Non ci sono altri fuggiaschi.</span>}
                {fugitives.filter((f) => f.id !== s.me.id && !f.spectator).map((f) => {
                  const mine = meP?.partnerPick === f.id;
                  const wantsMe = f.partnerPick === s.me.id;
                  const taken = !!mateOf(f);
                  return (
                    <div key={f.id} className={`cell pickrow ${wantsMe ? "wants" : ""}`}>
                      <span className="row" style={{ gap: 10, justifyContent: "flex-start", minWidth: 0 }}>
                        <Avatar id={f.id} name={f.name} at={s.avatars[f.id]} size={34} />
                        <span>{f.name}</span>
                        {wantsMe && <span className="chip a">ti ha scelto!</span>}
                        {taken && <span className="chip">già in coppia</span>}
                      </span>
                      {mine ? (
                        <button type="button" className="chip" disabled={busy} onClick={() => act({ action: "pick", partnerId: null })}>Scelto · annulla</button>
                      ) : (
                        <button type="button" className={`chip ${wantsMe ? "fa" : "a"}`} disabled={busy || taken} onClick={() => act({ action: "pick", partnerId: f.id }, wantsMe ? `Coppia fatta con ${f.name}!` : undefined)}>
                          {wantsMe ? "Accetta" : "Scegli"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      )}

      {rolesDrawn ? (
        <>
          {list("Cercatori", hunters)}
          {list("Fuggiaschi", fugitives)}
          {waiting.length > 0 && list("Senza ruolo", waiting)}
        </>
      ) : (
        list("Giocatori", players)
      )}

      {s.game.drawn && (
        <>
          <div className="stack-pairs">
            {s.lobby.pairs.map((p, i) => (
              <div key={p.id} className={`box reveal ${p.id === s.me.pairId ? "a" : ""}`} style={{ animationDelay: `${i * 0.25}s` }}>
                <span className="lbl">Coppia {i + 1}</span>
                <span className="title">{p.name}</span>
                <span className="muted">{p.members.join("  +  ")}</span>
              </div>
            ))}
          </div>
          {myPair && <div className="notice">Sei in coppia con {myPair.members.find((n) => n !== s.me.name)} · {myPair.name}</div>}
        </>
      )}

      {canLead ? (
        <>
          {!isHost && <div className="notice">{s.game.hostName ?? "L'organizzatore"} non apre l&apos;app da qualche minuto: puoi guidare tu la partita.</div>}
          {!rolesDrawn ? (
            <>
              <HoldButton label={busy ? "Estraggo…" : "Tieni premuto per estrarre i ruoli"} disabled={!canDrawRoles || busy} onFire={() => act({ action: "roles" })} />
              <p className="muted small">
                {canDrawRoles
                  ? `Estrai quando ci sono tutti: ${s.game.huntersPlanned} ${s.game.huntersPlanned === 1 ? "cercatore" : "cercatori"} a sorte, gli altri fuggiaschi. Il numero lo cambi in Impostazioni partita.`
                  : "Servono almeno 3 giocatori: 1 cercatore e 2 fuggiaschi. Nessun limite massimo."}
              </p>
            </>
          ) : s.game.drawn ? (
            <>
              <HoldButton label={busy ? "Avvio…" : "Tieni premuto per avviare"} disabled={busy} ms={1500} onFire={() => act({ action: "start" })} />
              <button type="button" className="btn ghost" disabled={busy || !canDraw} onClick={() => act({ action: "draw" }, "Coppie rifatte.")}>Rifai le coppie</button>
              <p className="muted small">Al via: {s.game.headStartMin} minuti di vantaggio ai fuggiaschi, poi {s.game.liveMin} minuti di caccia.</p>
            </>
          ) : (
            <>
              <HoldButton label={busy ? "Chiudo…" : "Tieni premuto per chiudere le coppie"} disabled={!canDraw || busy} onFire={() => act({ action: "draw" })} />
              <p className="muted small">
                {canDraw
                  ? `${pairedCount / 2} ${pairedCount / 2 === 1 ? "coppia scelta" : "coppie scelte"}; ${fugitives.length - pairedCount} ${fugitives.length - pairedCount === 1 ? "fuggiasco verrà accoppiato" : "fuggiaschi verranno accoppiati"} a caso${(fugitives.length - pairedCount) % 2 ? " (uno farà il Lupo Solitario)" : ""}.`
                  : "Servono almeno 1 cercatore e 2 fuggiaschi: rifai l'estrazione dei ruoli."}
              </p>
              <button type="button" className="btn ghost" disabled={busy || !canDrawRoles} onClick={() => act({ action: "roles" }, "Ruoli estratti di nuovo.")}>Rifai l&apos;estrazione dei ruoli</button>
            </>
          )}
        </>
      ) : (
        <div className="notice">
          {s.game.drawn ? `Aspetta che ${s.game.hostName} avvii la partita.` : rolesDrawn ? `Quando siete pronti, ${s.game.hostName} chiude le coppie.` : `Aspetta che ${s.game.hostName} estragga i ruoli.`}
        </div>
      )}
    </div>
  );
}
