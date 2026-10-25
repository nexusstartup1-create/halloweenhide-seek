"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AvatarPicker } from "./Avatar";
import { HostPanel, RulesSheet, SettingsSheet, SpectatorView } from "./Panels";
import { play, setSound as saveSound, soundOn, unlockAudio, type Sfx } from "./sound";
import { useGeo, useNow, useWakeLock } from "./hooks";
import { Glyph, Icon } from "./Icons";
import { Join, Lobby } from "./Lobby";
import { Missions } from "./Missions";
import { RoleIntro } from "./GhostAnim";
import { Jumpscare } from "./Jumpscare";
import { Onboarding, onboardingDone } from "./Onboarding";
import { RadioButton } from "./RadioButton";
import { playRadio, radioAuto, radioFx, setRadioAuto, setRadioFx, type RadioFx } from "./radio";
import { SosButton, SosLayer, SosSheet } from "./Sos";
import { Capture, Comms, Deck, FugitiveHud, Ghost, HunterHud, MapTab, Results } from "./Screens";
import type { GameState, Message } from "./types";
import { buzz, post, setVibration, vibrationOn } from "./util";

type Tab = "hud" | "map" | "main" | "deck" | "comms";
const POLL_MS = 3000;
/** Faster while the chat is open, so "sta scrivendo…" and new messages show up quickly. */
const POLL_CHAT_MS = 1200;

function readNum(key: string): number {
  try { return Number(localStorage.getItem(key) ?? 0); } catch { return 0; }
}
function writeNum(key: string, v: number) {
  try { localStorage.setItem(key, String(v)); } catch {}
}

export default function App() {
  const [auth, setAuth] = useState<"unknown" | "out" | "in">("unknown");
  const [s, setS] = useState<GameState | null>(null);
  const [offset, setOffset] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [tab, setTab] = useState<Tab>("hud");
  const tabRef = useRef<Tab>("hud");
  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);
  // Tapping a chat notification lands on the chat: via ?tab= on a fresh start, or a message from the service worker.
  useEffect(() => {
    const url = new URL(location.href);
    const fromLink = url.searchParams.get("tab") === "comms";
    if (fromLink) {
      url.searchParams.delete("tab");
      history.replaceState(null, "", url);
    }
    const t = setTimeout(() => fromLink && setTab("comms"), 0);
    const sw = "serviceWorker" in navigator ? navigator.serviceWorker : null;
    const onMsg = (e: MessageEvent) => e.data?.type === "open-tab" && e.data.tab === "comms" && setTab("comms");
    sw?.addEventListener("message", onMsg);
    return () => {
      clearTimeout(t);
      sw?.removeEventListener("message", onMsg);
    };
  }, []);
  const [toastMsg, setToastMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [seenAlert, setSeenAlert] = useState(0);
  const [scare, setScare] = useState<{ id: number; text: string } | null>(null);
  const [onAir, setOnAir] = useState<string | null>(null);
  // First visit on this phone: the 3-step guide before the join screen.
  const [guide, setGuide] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => !onboardingDone() && setGuide(true), 0);
    return () => clearTimeout(t);
  }, []);
  const [radioPrefs, setRadioPrefs] = useState<{ fx: RadioFx; auto: boolean }>({ fx: "police", auto: true });
  const [seenMsg, setSeenMsg] = useState(0);
  const [offline, setOffline] = useState(false);
  const [glass, setGlass] = useState<"clear" | "tinted">("clear");
  const [vibe, setVibe] = useState(true);
  const [sound, setSoundState] = useState(true);
  const [sheet, setSheet] = useState<null | "settings" | "host" | "rules" | "sos">(null);
  const prevPhase = useRef<string | null>(null);
  const lastMsg = useRef(0);
  // Highest radio message already handled; -1 until the first load (old ones never auto-play).
  const radioSeen = useRef(-1);
  const lastAlert = useRef(0);
  const viewKey = useRef("");
  const now = useNow(offset);
  useWakeLock();

  const playing = auth === "in" && !!s && s.game.phase !== "ENDED";
  const { fix, error: geoError } = useGeo(playing);

  const refresh = useCallback(async () => {
    try {
      // A new round or a change of channels (e.g. after a capture) restarts the message feed.
      const res = await fetch(`/api/state?after=${lastMsg.current}`, { cache: "no-store" });
      if (res.status === 401) {
        setAuth("out");
        setOffline(false);
        return;
      }
      if (!res.ok) throw new Error();
      let data = (await res.json()) as GameState;
      const key = `${data.game.round}|${data.channels.join(",")}`;
      if (viewKey.current && key !== viewKey.current) {
        viewKey.current = key;
        lastMsg.current = 0;
        const again = await fetch("/api/state?after=0", { cache: "no-store" });
        if (!again.ok) throw new Error();
        data = (await again.json()) as GameState;
        setMessages(data.messages);
      } else {
        viewKey.current = key;
        setMessages((prev) => [...prev, ...data.messages.filter((m) => !prev.some((b) => b.id === m.id))].slice(-300));
      }
      // Blank out messages deleted after we received them.
      if (data.deletedIds.length) {
        const gone = new Set(data.deletedIds);
        setMessages((prev) => (prev.some((m) => gone.has(m.id) && !m.deleted) ? prev.map((m) => (gone.has(m.id) ? { ...m, deleted: true, body: "" } : m)) : prev));
      }
      if (data.messages.length) lastMsg.current = Math.max(lastMsg.current, ...data.messages.map((m) => m.id));
      setOffline(false);
      setOffset(data.serverNow - Date.now());
      // Walkie-talkie: teammates' new radio messages play by themselves while the app is open.
      const radios = data.messages.filter((m) => m.radio && m.audio && !m.deleted);
      const maxRadio = Math.max(0, ...radios.map((m) => m.id));
      if (radioSeen.current >= 0 && radioAuto() && document.visibilityState === "visible") {
        for (const m of radios.filter((x) => x.id > radioSeen.current && !x.mine).sort((a, b) => a.id - b.id)) {
          playRadio(m.id, m.radio!, (on) => setOnAir(on ? m.sender ?? "?" : null));
        }
      }
      radioSeen.current = Math.max(radioSeen.current, maxRadio);
      // Vibrate once per new alert, ever: remembered on the phone so reloads never vibrate again.
      const top = data.alerts[0]?.id ?? 0;
      const buzzedKey = `cnh_buzzed_${data.me.id}_${data.game.round}`;
      let buzzed = 0;
      try { buzzed = Number(localStorage.getItem(buzzedKey) ?? 0); } catch {}
      // Jumpscare: shown once per alert, even if it arrived while the app was closed (alerts live 10 min).
      const scareAlert = data.alerts.find((a) => a.kind === "JUMPSCARE");
      if (scareAlert) {
        const key = `cnh_scared_${data.me.id}`;
        let seen = 0;
        try { seen = Number(localStorage.getItem(key) ?? 0); } catch {}
        if (scareAlert.id > seen) {
          try { localStorage.setItem(key, String(scareAlert.id)); } catch {}
          try { localStorage.setItem(buzzedKey, String(Math.max(top, buzzed))); } catch {}
          setScare({ id: scareAlert.id, text: scareAlert.body });
        }
      }
      if (top > lastAlert.current && lastAlert.current !== 0 && top > buzzed && data.alerts[0]?.kind !== "JUMPSCARE") {
        buzz([200, 100, 200]);
        const kind = data.alerts[0]?.kind;
        const sfx: Record<string, Sfx> = { PINGED: "ping", CAPTURED: "capture", PARTNER_DOWN: "alert", REVEALED: "whisper" };
        play(sfx[kind] ?? "alert");
        try { localStorage.setItem(buzzedKey, String(top)); } catch {}
      }
      lastAlert.current = Math.max(lastAlert.current, top) || -1;
      // Gong when the game starts and when the hunt opens.
      const ph = data.game.phase;
      if (prevPhase.current && prevPhase.current !== ph && (ph === "HEAD_START" || (ph === "LIVE" && prevPhase.current === "HEAD_START"))) play("start");
      prevPhase.current = ph;
      setS(data);
      setAuth("in");
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => {
      setSeenAlert(readNum("cnh_alert_seen"));
      setVibe(vibrationOn());
      setSoundState(soundOn());
      setSeenMsg(readNum("cnh_msg_seen"));
      refresh();
    }, 0);
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      t = setTimeout(async () => {
        if (document.visibilityState === "visible") await refresh();
        loop();
      }, tabRef.current === "comms" ? POLL_CHAT_MS : POLL_MS);
    };
    loop();
    // Leaving the screen tells the server at once, so chat notifications aren't held back.
    const away = () => navigator.sendBeacon?.("/api/away");
    const onVis = () => (document.visibilityState === "visible" ? refresh() : away());
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", away);
    return () => {
      clearTimeout(first);
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", away);
    };
  }, [refresh]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (/android/i.test(navigator.userAgent)) root.dataset.os = "android";
    else if (/iphone|ipad|macintosh/i.test(navigator.userAgent)) root.dataset.os = "apple";
    let saved: string | null = null;
    try { saved = localStorage.getItem("cnh_glass"); } catch {}
    if (saved === "tinted") {
      root.dataset.glass = "tinted";
      const t = setTimeout(() => setGlass("tinted"), 0);
      return () => clearTimeout(t);
    }
  }, []);

  // Browsers allow sound only after a first tap.
  useEffect(() => {
    const unlock = () => unlockAudio();
    document.addEventListener("pointerdown", unlock, { once: true });
    return () => document.removeEventListener("pointerdown", unlock);
  }, []);

  const toggleGlass = () => {
    const next = glass === "clear" ? "tinted" : "clear";
    setGlass(next);
    document.documentElement.dataset.glass = next;
    try { localStorage.setItem("cnh_glass", next); } catch {}
  };

  const toast = useCallback((text: string, bad = false) => {
    setToastMsg({ text, bad });
    setTimeout(() => setToastMsg(null), 4500);
  }, []);
  const closeScare = useCallback(() => setScare(null), []);

  const lastId = messages.length ? messages[messages.length - 1].id : 0;
  useEffect(() => {
    if (tab === "comms" && lastId !== seenMsg) {
      const t = setTimeout(() => {
        setSeenMsg(lastId);
        writeNum("cnh_msg_seen", lastId);
      }, 0);
      return () => clearTimeout(t);
    }
  }, [tab, lastId, seenMsg]);

  if (auth === "unknown") {
    return <div className="login"><div className="lbl blink">{offline ? "Server non raggiungibile · riprovo ogni 3 s" : "Connessione…"}</div></div>;
  }
  if (auth === "out" || !s) {
    if (guide) return <Onboarding onDone={() => setGuide(false)} />;
    return <Join onDone={refresh} onGuide={() => setGuide(true)} />;
  }

  const phase = s.game.phase;
  const inGame = phase === "HEAD_START" || phase === "LIVE" || phase === "PAUSED";
  const isHost = s.game.hostId === s.me.id;
  const spectator = inGame && s.me.spectator;
  const hunter = s.me.role === "HUNTER";
  const alert = s.alerts.find((a) => a.id > seenAlert && a.kind !== "JUMPSCARE");
  const unread = tab !== "comms" && lastId > seenMsg;
  const outsider = inGame && (spectator || !s.me.role || (!hunter && !s.fugitive));
  const ghost = inGame && !outsider && !hunter && s.me.status === "CAPTURED";
  const fullNav = inGame && !outsider && !ghost;
  const teamChannel = s.channels.find((c) => c === "HUNTERS" || c === "FUGITIVES");

  const logout = async () => {
    await post("/api/logout", {}).catch(() => {});
    setS(null);
    setAuth("out");
  };

  let screen: React.ReactNode;
  if (tab === "comms") screen = <Comms s={s} messages={messages} refresh={refresh} toast={toast} />;
  else if (phase === "LOBBY") screen = <Lobby s={s} refresh={refresh} toast={toast} openRules={() => setSheet("rules")} openHost={() => setSheet("host")} />;
  else if (phase === "ENDED") screen = <Results s={s} refresh={refresh} toast={toast} />;
  else if (ghost) screen = tab === "main" ? <Capture s={s} refresh={refresh} toast={toast} /> : <Ghost s={s} now={now} refresh={refresh} toast={toast} />;
  else if (outsider) screen = <SpectatorView s={s} now={now} />;
  else if (tab === "hud") screen = hunter ? <HunterHud s={s} now={now} /> : <FugitiveHud s={s} now={now} />;
  else if (tab === "map") screen = <MapTab s={s} fix={fix} geoError={geoError} />;
  else if (tab === "main") screen = hunter ? <Capture s={s} refresh={refresh} toast={toast} /> : <Missions s={s} fix={fix} refresh={refresh} toast={toast} />;
  else screen = <Deck s={s} now={now} refresh={refresh} toast={toast} />;

  // In the lobby the role stays a secret until the card is turned over.
  const roleLabel = phase === "LOBBY" ? "In lobby" : spectator ? "Spettatore" : hunter ? "Cercatore" : ghost ? "Fantasma · caccia con i cercatori" : s.fugitive ? `Fuggiasco · ${s.fugitive.pair.name}` : s.me.role === "FUGITIVE" ? "Fuggiasco" : "In lobby";
  const isOn = (id: Tab) => id === tab || (!fullNav && id === "hud" && tab !== "comms");
  const tabBtn = (id: Tab, label: string, icon: React.ReactNode, extra = "") => (
    <button type="button" className={`${extra} ${isOn(id) ? "on" : ""}`} onClick={() => setTab(id)} aria-current={isOn(id) ? "page" : undefined}>
      <span className="ico">{icon}</span>
      {label}
      {id === "comms" && unread && <i className="dot" />}
    </button>
  );

  return (
    <div className="shell">
      <main className={`main ${(tab === "map" && fullNav) || tab === "comms" ? "flush" : ""}`}>{screen}</main>
      <header className="topbar glass">
        <AvatarPicker
          id={s.me.id}
          name={s.me.name}
          at={s.avatars[s.me.id]}
          kind={phase === "LOBBY" ? "fugitive" : hunter ? "hunter" : ghost ? "ghost" : "fugitive"}
          onDone={() => { toast("Foto profilo aggiornata."); refresh(); }}
          onError={(m) => toast(m, true)}
        />
        <span className="who">
          <b>{s.me.name}</b>
          <span>{roleLabel}{inGame ? ` · ${fix ? `GPS ±${Math.round(fix.acc)} m` : geoError ? "GPS spento" : "GPS…"}` : ""}</span>
        </span>
        {inGame && <SosButton onOpen={() => setSheet("sos")} />}
        {isHost && (
          <button type="button" className="iconbtn host" onClick={() => setSheet("host")} aria-label="Pannello organizzatore" title="Organizzatore">
            <Glyph.crown />
          </button>
        )}
        <button type="button" className="iconbtn" onClick={() => { setRadioPrefs({ fx: radioFx(), auto: radioAuto() }); setSheet("settings"); }} aria-label="Impostazioni" title="Impostazioni">
          <Glyph.gear />
        </button>
        <button type="button" className="iconbtn" onClick={logout} aria-label="Esci">
          <Glyph.exit />
        </button>
      </header>
      {inGame && !outsider && !ghost && (
        <RoleIntro
          storageKey={`role-${s.me.id}-r${s.game.round}`}
          role={hunter ? "HUNTER" : "FUGITIVE"}
          title={hunter ? "Sei un cercatore" : "Sei un fuggiasco"}
          line={
            hunter
              ? `I fuggiaschi hanno ${s.game.headStartMin} minuti di vantaggio. Poi caccia aperta.`
              : `${s.fugitive?.pair.name ?? "La tua coppia"}${s.fugitive?.partner ? ` con ${s.fugitive.partner.name}` : ""}. Hai ${s.game.headStartMin} minuti per sparire.`
          }
        />
      )}
      <div className="banners">
        {phase === "PAUSED" && <div className="alert" style={{ background: "rgba(109,40,217,.88)" }}>Partita in pausa · aspettate l&apos;organizzatore</div>}
        {offline && <div className="alert">Connessione persa · riprovo</div>}
        {inGame && geoError && <div className="alert" style={{ background: "rgba(109,40,217,.88)" }}>{geoError}</div>}
        {alert && (
          <button type="button" className="alert" onClick={() => { setSeenAlert(alert.id); writeNum("cnh_alert_seen", alert.id); }}>
            <span>{alert.body}</span><span className="ok">OK</span>
          </button>
        )}
      </div>
      {inGame && !outsider && tab !== "comms" && !(tab === "main" && (hunter || ghost)) && teamChannel && (
        <RadioButton
          side={tab === "map" ? "left" : "right"}
          channel={teamChannel}
          label={teamChannel === "HUNTERS" ? "cercatori" : "fuggiaschi"}
          onSent={() => { toast("📻 Messaggio radio inviato."); refresh(); }}
          onError={(m) => toast(m, true)}
        />
      )}
      {onAir && <div className="onair glass" role="status">📻 {onAir} in radio…</div>}
      {fullNav ? (
        <nav className="nav glass" style={{ ["--tabs" as string]: 5 }}>
          {tabBtn("hud", "HUD", <Icon.hud />)}
          {tabBtn("map", "Mappa", <Icon.map />)}
          {hunter ? tabBtn("main", "Cattura", <Icon.cross />, "cta") : tabBtn("main", "Missioni", <Icon.quest />, "cta")}
          {tabBtn("deck", "Mazzo", <Icon.deck />)}
          {tabBtn("comms", "Canale", <Icon.comms />)}
        </nav>
      ) : (
        <nav className="nav glass" style={{ ["--tabs" as string]: ghost ? 3 : 2 }}>
          {tabBtn("hud", phase === "LOBBY" ? "Lobby" : phase === "ENDED" ? "Risultati" : ghost ? "Fantasma" : spectator ? "Partita" : "Partita", <Icon.hud />)}
          {ghost && tabBtn("main", "Cattura", <Icon.cross />, "cta")}
          {tabBtn("comms", "Chat", <Icon.comms />)}
        </nav>
      )}
      {toastMsg && <div className={`toast glass ${toastMsg.bad ? "r" : ""}`} role="status">{toastMsg.text}</div>}
      {scare && <Jumpscare key={scare.id} text={scare.text} onClose={closeScare} />}
      {s.sos.length > 0 && <SosLayer s={s} fix={fix} refresh={refresh} toast={toast} />}
      {sheet === "sos" && <SosSheet fix={fix} onClose={() => setSheet(null)} onSent={refresh} toast={toast} />}
      {sheet === "settings" && (
        <SettingsSheet
          onClose={() => setSheet(null)}
          onDeleteData={async () => {
            const res = await fetch("/api/me", { method: "DELETE" });
            if (!res.ok) { toast((await res.json().catch(() => ({}))).error ?? "Cancellazione non riuscita. Riprova.", true); return; }
            setSheet(null);
            setS(null);
            setAuth("out");
            toast("I tuoi dati sono stati cancellati.");
          }}
          sound={sound}
          setSound={(v) => { saveSound(v); setSoundState(v); if (v) play("card"); }}
          vibe={vibe}
          setVibe={(v) => { setVibration(v); setVibe(v); }}
          glassClear={glass === "clear"}
          setGlassClear={(v) => { if ((glass === "clear") !== v) toggleGlass(); }}
          isHost={isHost}
          openHost={() => setSheet("host")}
          openRules={() => setSheet("rules")}
          radioFx={radioPrefs.fx}
          setRadioFx={(fx) => { setRadioFx(fx); setRadioPrefs((p) => ({ ...p, fx })); }}
          radioAuto={radioPrefs.auto}
          setRadioAuto={(v) => { setRadioAuto(v); setRadioPrefs((p) => ({ ...p, auto: v })); }}
        />
      )}
      {sheet === "host" && isHost && <HostPanel s={s} now={now} refresh={refresh} toast={toast} onClose={() => setSheet(null)} />}
      {sheet === "rules" && <RulesSheet s={s} onClose={() => setSheet(null)} />}
    </div>
  );
}
