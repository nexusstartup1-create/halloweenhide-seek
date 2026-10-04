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

const SEND_EVERY_MS = 15_000;
const SEND_MOVE_M = 15;

/** Watches GPS and reports it to the server (throttled). */
export function useGeo(enabled: boolean) {
  const [fix, setFix] = useState<Fix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const last = useRef<{ at: number; lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const f = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, at: Date.now() };
        setFix(f);
        setError(null);
        const l = last.current;
        const moved = l ? Math.hypot((f.lat - l.lat) * 111000, (f.lng - l.lng) * 79000) : Infinity;
        if (!l || Date.now() - l.at > SEND_EVERY_MS || moved > SEND_MOVE_M) {
          last.current = { at: Date.now(), lat: f.lat, lng: f.lng };
          fetch("/api/location", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ lat: f.lat, lng: f.lng, acc: f.acc }),
          }).catch(() => {});
        }
      },
      (e) => setError(e.code === 1 ? "Posizione negata. Abilitala nelle impostazioni del browser." : "GPS non disponibile, riprovo…"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
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
