"use client";
import { useEffect, useRef, useState } from "react";
import type { Fix } from "./types";

/** Server-corrected clock, ticking every second. */
export function useNow(offset: number) {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(t);
  }, [offset]);
  return now;
}

const SEND_EVERY_MS = 5_000;
const SEND_MOVE_M = 8;
// A fix this rough (cell towers / Wi-Fi) is ignored while a good GPS fix is still fresh.
const COARSE_M = 150;
const GOOD_M = 60;
const GOOD_FRESH_MS = 45_000;
// Faster than this between two fixes is a GPS jump, not someone running.
const MAX_SPEED_MS = 40;
// Walking/running pace the smoothing allows for (m/s).
const WALK_Q = 4;
// Android Chrome sometimes stops delivering fixes (screen off, app switch): restart the watch.
const STALL_MS = 25_000;
// After this long with only rough fixes, the phone is probably on "approximate location".
const APPROX_AFTER_MS = 30_000;
const APPROX_M = 500;

const metres = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
  Math.hypot((a.lat - b.lat) * 111_320, (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180));

/**
 * Watches GPS and reports it to the server (throttled). Tuned for Android Chrome:
 * drops coarse network fixes and GPS jumps, smooths jitter (simple Kalman filter
 * weighted by accuracy), restarts a stalled watch, and spots "approximate location".
 */
export function useGeo(enabled: boolean) {
  const [fix, setFix] = useState<Fix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const last = useRef<{ at: number; lat: number; lng: number; acc: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!("geolocation" in navigator)) return;
    let watchId: number | null = null;
    let lastFixAt = 0;
    let lastGoodAt = 0;
    let firstFixAt = 0;
    let bestAcc = Infinity;
    // Kalman state: position, variance (m²), time of last update.
    let k: { lat: number; lng: number; v: number; t: number } | null = null;

    const send = (f: Fix) => {
      const l = last.current;
      const moved = l ? metres(f, l) : Infinity;
      const sharper = l ? f.acc < l.acc * 0.5 : true;
      if (!l || Date.now() - l.at > SEND_EVERY_MS || moved > SEND_MOVE_M || sharper) {
        last.current = { at: Date.now(), lat: f.lat, lng: f.lng, acc: f.acc };
        fetch("/api/location", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ lat: f.lat, lng: f.lng, acc: f.acc }),
        }).catch(() => {});
      }
    };

    const onFix = (p: GeolocationPosition) => {
      const now = Date.now();
      const m = { lat: p.coords.latitude, lng: p.coords.longitude };
      const acc = Math.max(3, p.coords.accuracy || 9999);
      lastFixAt = now;
      if (!firstFixAt) firstFixAt = now;
      bestAcc = Math.min(bestAcc, acc);

      // Rough network fix while GPS was fine a moment ago: keep the GPS one.
      if (acc > COARSE_M && now - lastGoodAt < GOOD_FRESH_MS) return;
      if (acc <= GOOD_M) lastGoodAt = now;

      // Long gap: start the filter over instead of dragging an old position along.
      if (k && now - k.t > 60_000) k = null;
      if (k) {
        const dt = Math.max(0.001, (now - k.t) / 1000);
        // Impossible jump with a mediocre fix: skip it.
        if (acc > 25 && metres(m, k) / dt > MAX_SPEED_MS) return;
        k.v += dt * WALK_Q * WALK_Q;
        const gain = k.v / (k.v + acc * acc);
        k.lat += gain * (m.lat - k.lat);
        k.lng += gain * (m.lng - k.lng);
        k.v = (1 - gain) * k.v;
        k.t = now;
      } else {
        k = { lat: m.lat, lng: m.lng, v: acc * acc, t: now };
      }

      const f: Fix = { lat: k.lat, lng: k.lng, acc: Math.sqrt(k.v), at: now };
      setFix(f);
      setError(
        now - firstFixAt > APPROX_AFTER_MS && bestAcc >= APPROX_M
          ? "Posizione approssimativa: su Android apri Impostazioni → App → Chrome → Autorizzazioni → Posizione e attiva \"Usa posizione precisa\"."
          : null,
      );
      send(f);
    };

    const onError = (e: GeolocationPositionError) => {
      if (e.code === 1) return setError("Posizione negata. Abilitala nelle impostazioni del browser.");
      // Timeouts are normal indoors; only complain when there's no recent fix at all.
      if (Date.now() - lastFixAt > STALL_MS) setError("GPS debole, riprovo… All'aperto prende meglio.");
    };

    const start = () => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      watchId = navigator.geolocation.watchPosition(onFix, onError, { enableHighAccuracy: true, maximumAge: 2000, timeout: 15_000 });
    };
    start();

    // Restart when the app comes back and whenever fixes stop arriving.
    const onVis = () => document.visibilityState === "visible" && Date.now() - lastFixAt > 5_000 && start();
    document.addEventListener("visibilitychange", onVis);
    const watchdog = setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - lastFixAt > STALL_MS) start();
    }, 10_000);

    return () => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(watchdog);
    };
  }, [enabled]);

  const unsupported = enabled && typeof navigator !== "undefined" && !("geolocation" in navigator);
  return { fix, error: unsupported ? "Questo telefono non dà la posizione al browser." : error };
}

/** Keeps the screen on while the app is visible. Needs one user tap on some browsers. */
export function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        if (document.visibilityState === "visible" && "wakeLock" in navigator) lock = await navigator.wakeLock.request("screen");
      } catch {}
    };
    request();
    const onVis = () => document.visibilityState === "visible" && request();
    document.addEventListener("visibilitychange", onVis);
    document.addEventListener("pointerdown", request, { once: true });
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      lock?.release().catch(() => {});
    };
  }, []);
}
