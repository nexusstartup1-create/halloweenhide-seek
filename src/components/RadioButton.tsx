"use client";
import { useEffect, useRef, useState } from "react";
import { radioFx, squelch } from "./radio";
import { vibrationOn } from "./util";
import { TYPES } from "./Voice";

const MIN_MS = 600;
const MAX_MS = 15_000;
/** Wall clock, read only from event handlers. */
const clockNow = () => Date.now();

const vibrate = (p: number | number[]) => {
  if (vibrationOn()) try { navigator.vibrate?.(p); } catch {}
};

/**
 * Walkie-talkie: hold to talk, release to send to your team. The voice effect (police radio or ghost)
 * is applied when it's played back; the recording itself stays clean.
 */
export function RadioButton({ channel, label, onSent, onError, side = "right" }: {
  channel: string; label: string; onSent: () => void; onError: (msg: string) => void; side?: "left" | "right";
}) {
  const [state, setState] = useState<"idle" | "opening" | "rec" | "sending">("idle");
  const [ms, setMs] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const holding = useRef(false);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = () => {
    if (tick.current) clearInterval(tick.current);
    tick.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    rec.current = null;
  };
  useEffect(() => cleanup, []);

  const begin = async (e: React.PointerEvent) => {
    e.preventDefault();
    if (state !== "idle") return;
    holding.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setState("opening");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      stream.current = s;
      // Released while the microphone was still opening: nothing to send.
      if (!holding.current) {
        cleanup();
        setState("idle");
        return;
      }
      const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
      const r = new MediaRecorder(s, mimeType ? { mimeType, audioBitsPerSecond: 48_000 } : undefined);
      chunks.current = [];
      r.ondataavailable = (ev) => ev.data.size && chunks.current.push(ev.data);
      r.onstop = () => send(r.mimeType || mimeType || "audio/webm");
      rec.current = r;
      squelch("open");
      vibrate(30);
      started.current = clockNow();
      r.start(200);
      setMs(0);
      setState("rec");
      tick.current = setInterval(() => {
        const el = clockNow() - started.current;
        setMs(el);
        if (el >= MAX_MS) end();
      }, 100);
    } catch {
      cleanup();
      setState("idle");
      onError("Microfono non disponibile. Consenti l'accesso al microfono nelle impostazioni del browser.");
    }
  };

  const end = () => {
    holding.current = false;
    const r = rec.current;
    if (r && r.state === "recording") r.stop();
  };

  const send = async (mime: string) => {
    const duration = clockNow() - started.current;
    const type = mime.split(";")[0];
    const blob = new Blob(chunks.current, { type });
    cleanup();
    if (duration < MIN_MS || !blob.size) {
      setState("idle");
      return onError("Tieni premuto mentre parli, poi stacca il dito.");
    }
    squelch("close");
    vibrate([20, 40, 20]);
    setState("sending");
    try {
      const res = await fetch(`/api/messages/audio?channel=${channel}&ms=${duration}&radio=${radioFx()}`, { method: "POST", headers: { "content-type": type }, body: blob });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Messaggio radio non inviato.");
      onSent();
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setState("idle");
    }
  };

  const secs = Math.floor(ms / 1000);
  return (
    <button
      type="button"
      className={`radiobtn ${state} ${side}`}
      onPointerDown={begin}
      onPointerUp={end}
      onPointerCancel={end}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={`Tieni premuto per parlare a ${label}`}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 2v4M7 6h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V8a2 2 0 012-2z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M9 11h6M9 14h6M9 17h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="rl">
        {state === "rec" ? `● ${secs}s / ${MAX_MS / 1000}` : state === "opening" ? "…" : state === "sending" ? "Invio" : "PARLA"}
      </span>
      {state === "rec" && <span className="rtip">Stacca per inviare a {label}</span>}
    </button>
  );
}
