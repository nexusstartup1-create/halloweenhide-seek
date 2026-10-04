"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AvatarPicker } from "./Avatar";
import { useGeo, useNow, useWakeLock } from "./hooks";
import { Glyph, Icon } from "./Icons";
import { Join, Lobby } from "./Lobby";
import { Missions } from "./Missions";
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
  const [toastMsg, setToastMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [seenAlert, setSeenAlert] = useState(0);
  const [seenMsg, setSeenMsg] = useState(0);
  const [offline, setOffline] = useState(false);
  const [glass, setGlass] = useState<"clear" | "tinted">("clear");
  const [vibe, setVibe] = useState(true);
  const lastMsg = useRef(0);
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
      // Vibrate once per new alert, ever: remembered on the phone so reloads never vibrate again.
      const top = data.alerts[0]?.id ?? 0;
      const buzzedKey = `cnh_buzzed_${data.me.id}_${data.game.round}`;
      let buzzed = 0;
      try { buzzed = Number(localStorage.getItem(buzzedKey) ?? 0); } catch {}
      if (top > lastAlert.current && lastAlert.current !== 0 && top > buzzed) {
        buzz([200, 100, 200]);
        try { localStorage.setItem(buzzedKey, String(top)); } catch {}
      }
      lastAlert.current = Math.max(lastAlert.current, top) || -1;
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
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearTimeout(first);
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onVis);
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
  if (auth === "out" || !s) return <Join onDone={refresh} />;

  const phase = s.game.phase;
  const inGame = phase === "HEAD_START" || phase === "LIVE";
  const hunter = s.me.role === "HUNTER";
  const alert = s.alerts.find((a) => a.id > seenAlert);
  const unread = tab !== "comms" && lastId > seenMsg;
  const outsider = inGame && (!s.me.role || (!hunter && !s.fugitive));
  const ghost = inGame && !outsider && !hunter && s.me.status === "CAPTURED";
  const fullNav = inGame && !outsider && !ghost;

  const logout = async () => {
    await post("/api/logout", {}).catch(() => {});
    setS(null);
    setAuth("out");
  };

  let screen: React.ReactNode;
  if (tab === "comms") screen = <Comms s={s} messages={messages} refresh={refresh} toast={toast} />;
  else if (phase === "LOBBY") screen = <Lobby s={s} refresh={refresh} toast={toast} />;
  else if (phase === "ENDED") screen = <Results s={s} refresh={refresh} toast={toast} />;
  else if (ghost) screen = <Ghost s={s} now={now} refresh={refresh} toast={toast} />;
  else if (outsider) screen = <div className="full"><p className="muted">Sei entrato dopo l&apos;estrazione, quindi questa partita la segui dalla chat. Giochi dalla prossima.</p></div>;
  else if (tab === "hud") screen = hunter ? <HunterHud s={s} now={now} /> : <FugitiveHud s={s} now={now} />;
  else if (tab === "map") screen = <MapTab s={s} fix={fix} geoError={geoError} />;
  else if (tab === "main") screen = hunter ? <Capture s={s} refresh={refresh} toast={toast} /> : <Missions s={s} fix={fix} refresh={refresh} toast={toast} />;
  else screen = <Deck s={s} now={now} refresh={refresh} toast={toast} />;

  const roleLabel = hunter ? "Cercatore" : ghost ? "Fantasma · aiuta i cercatori" : s.fugitive ? `Fuggiasco · ${s.fugitive.pair.name}` : s.me.role === "FUGITIVE" ? "Fuggiasco" : "In lobby";
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
          kind={hunter ? "hunter" : ghost ? "ghost" : "fugitive"}
          onDone={() => { toast("Foto profilo aggiornata."); refresh(); }}
          onError={(m) => toast(m, true)}
        />
        <span className="who">
          <b>{s.me.name}</b>
          <span>{roleLabel}{inGame ? ` · ${fix ? `GPS ±${Math.round(fix.acc)} m` : geoError ? "GPS spento" : "GPS…"}` : ""}</span>
        </span>
        <button
          type="button"
          className={`iconbtn ${vibe ? "" : "off"}`}
          onClick={() => { setVibration(!vibe); setVibe(!vibe); toast(vibe ? "Vibrazione disattivata." : "Vibrazione attivata."); }}
          aria-label={vibe ? "Disattiva vibrazione" : "Attiva vibrazione"}
          aria-pressed={!vibe}
          title="Vibrazione"
        >
          <Glyph.vibrate />
        </button>
        <button type="button" className="iconbtn" onClick={toggleGlass} aria-label={glass === "clear" ? "Vetro più coprente" : "Vetro più trasparente"} title="Trasparenza">
          <Glyph.drop />
        </button>
        <button type="button" className="iconbtn" onClick={logout} aria-label="Esci">
          <Glyph.exit />
        </button>
      </header>
      <div className="banners">
        {offline && <div className="alert">Connessione persa · riprovo</div>}
        {alert && (
          <button type="button" className="alert" onClick={() => { setSeenAlert(alert.id); writeNum("cnh_alert_seen", alert.id); }}>
            <span>{alert.body}</span><span className="ok">OK</span>
          </button>
        )}
      </div>
      {fullNav ? (
        <nav className="nav glass" style={{ ["--tabs" as string]: 5 }}>
          {tabBtn("hud", "HUD", <Icon.hud />)}
          {tabBtn("map", "Mappa", <Icon.map />)}
          {hunter ? tabBtn("main", "Cattura", <Icon.cross />, "cta") : tabBtn("main", "Missioni", <Icon.quest />, "cta")}
          {tabBtn("deck", "Mazzo", <Icon.deck />)}
          {tabBtn("comms", "Canale", <Icon.comms />)}
        </nav>
      ) : (
        <nav className="nav glass" style={{ ["--tabs" as string]: 2 }}>
          {tabBtn("hud", phase === "LOBBY" ? "Lobby" : phase === "ENDED" ? "Risultati" : ghost ? "Fantasma" : "Partita", <Icon.hud />)}
          {tabBtn("comms", "Chat", <Icon.comms />)}
        </nav>
      )}
      {toastMsg && <div className={`toast glass ${toastMsg.bad ? "r" : ""}`} role="status">{toastMsg.text}</div>}
    </div>
  );
}
