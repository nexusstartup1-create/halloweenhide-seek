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

function env() {
  if (typeof window === "undefined") return { ios: false, standalone: false, push: false };
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  const push = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && !!VAPID;
  return { ios, standalone, push };
}

async function subscribePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(VAPID) }));
  await post("/api/push", sub.toJSON());
}

/** "Get your phone ready" card: install the app and turn on notifications. */
export function PhoneSetup({ toast }: { toast: (t: string, bad?: boolean) => void }) {
  const canPrompt = useSyncExternalStore(subscribeInstall, () => !!deferred, () => false);
  const [info, setInfo] = useState({ ios: false, standalone: false, push: false });
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      const e = env();
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
