"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { post } from "./util";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Android/Chrome fires this once, early: keep it so the button can use it later.
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}
const subscribeInstall = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

function urlB64ToUint8Array(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export function phoneEnv() {
  if (typeof window === "undefined") return { ios: false, standalone: false, push: false };
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  const push = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && !!VAPID;
  return { ios, standalone, push };
}

export async function subscribePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(VAPID) }));
  await post("/api/push", sub.toJSON());
}

/** Whether Chrome offered the install prompt, and a function to show it. */
export function useInstallPrompt() {
  const canPrompt = useSyncExternalStore(subscribeInstall, () => !!deferred, () => false);
  const install = async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const choice = await deferred.userChoice.catch(() => null);
    deferred = null;
    listeners.forEach((l) => l());
    return choice?.outcome === "accepted";
  };
  return { canPrompt, install };
}

/** "Get your phone ready" card: install the app and turn on notifications. */
export function PhoneSetup({ toast }: { toast: (t: string, bad?: boolean) => void }) {
  const canPrompt = useSyncExternalStore(subscribeInstall, () => !!deferred, () => false);
  const [info, setInfo] = useState({ ios: false, standalone: false, push: false });
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      const e = phoneEnv();
      setInfo(e);
      const p = e.push ? Notification.permission : "unsupported";
      setPerm(p);
      // Re-link an existing subscription to whoever is logged in on this phone now.
      if (p === "granted") subscribePush().catch(() => {});
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => null);
    deferred = null;
    listeners.forEach((l) => l());
  };

  const enable = async () => {
    setBusy(true);
    try {
      const p = await Notification.requestPermission();
      setPerm(p);
      if (p !== "granted") return toast("Notifiche non attivate. Puoi abilitarle dalle impostazioni del browser.", true);
      await subscribePush();
      toast("Notifiche attive.");
    } catch {
      toast("Non sono riuscito ad attivare le notifiche su questo telefono.", true);
    } finally {
      setBusy(false);
    }
  };

  const iosNeedsHome = info.ios && !info.standalone;
  if (info.standalone && perm === "granted") return null;

  return (
    <div className="box">
      <span className="lbl">Prepara il telefono</span>
      <div className="cell">
        <span className="small">{info.standalone ? "App installata" : "Installa l'app"}</span>
        {info.standalone ? <span className="chip a">Fatto</span> : canPrompt ? (
          <button type="button" className="btn a sm" onClick={install}>Installa</button>
        ) : iosNeedsHome ? (
          <span className="chip">Condividi → Aggiungi a Home</span>
        ) : (
          <span className="chip">Menu → Installa app</span>
        )}
      </div>
      <div className="cell">
        <span className="small">Notifiche (ping, catture, missioni lampo)</span>
        {perm === "granted" ? <span className="chip a">Attive</span>
          : perm === "denied" ? <span className="chip r">Bloccate</span>
          : iosNeedsHome ? <span className="chip">Prima installa</span>
          : perm === "unsupported" ? <span className="chip">Non disponibili</span>
          : <button type="button" className="btn a sm" disabled={busy} onClick={enable}>Attiva</button>}
      </div>
      {iosNeedsHome && <span className="muted small">Su iPhone le notifiche arrivano solo se apri il gioco dall&apos;icona sulla schermata Home.</span>}
    </div>
  );
}

/**
 * Settings: notification status and a test push that arrives 10 s later, to check it works with the
 * app closed. On Android it also says where to lift the battery limits that stop it.
 */
export function PushCheck() {
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  const [android, setAndroid] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setPerm(phoneEnv().push ? Notification.permission : "unsupported");
      setAndroid(/android/i.test(navigator.userAgent));
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const test = async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (Notification.permission !== "granted") {
        const p = await Notification.requestPermission();
        setPerm(p);
        if (p !== "granted") return setMsg("Notifiche non attivate.");
      }
      await subscribePush();
      const r = await post<{ subs: number }>("/api/pushcheck", {});
      setMsg(r.subs ? "Inviata tra 10 secondi: chiudi l'app adesso (o blocca lo schermo) e aspetta." : "Questo telefono non risulta iscritto. Riprova tra poco.");
    } catch (e) {
      setMsg((e as Error).message || "Non sono riuscito a mandare la prova.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="box">
      <span className="lbl">Notifiche</span>
      {perm === "unsupported" ? (
        <span className="small muted">Questo browser non riceve notifiche. Su iPhone apri il gioco dall&apos;icona sulla schermata Home.</span>
      ) : perm === "denied" ? (
        <span className="small muted">Bloccate. Riattivale dalle impostazioni del browser: lucchetto accanto all&apos;indirizzo → Notifiche → Consenti.</span>
      ) : (
        <button type="button" className="btn a sm" disabled={busy} onClick={test}>
          {perm === "granted" ? "🔔 Prova: arriva tra 10 s ad app chiusa" : "Attiva e prova le notifiche"}
        </button>
      )}
      {msg && <span className="small">{msg}</span>}
      {android && perm !== "unsupported" && (
        <span className="small muted">
          Se ad app chiusa non arriva: Impostazioni del telefono → App → <b>Chrome</b> → Batteria → <b>Senza restrizioni</b>, e in Notifiche di Chrome lascia
          attivo <b>nighthunt.vercel.app</b>. Su Xiaomi attiva anche «Avvio automatico», su Samsung togli Chrome dalle «App in sospensione».
        </span>
      )}
    </div>
  );
}
