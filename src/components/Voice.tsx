"use client";
import { useEffect, useRef, useState } from "react";
import { playRadio, type RadioFx } from "./radio";

const MAX_MS = 60_000;
// mp4/AAC first: it plays everywhere, iPhones included. Chrome on Android falls back to WebM/Opus.
export const TYPES = ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];

const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function canRecord() {
  return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

/** Recording bar shown in place of the text field: red dot, timer, cancel and send. Max one minute. */
export function VoiceRecorder({ channel, onDone, onCancel, onError }: {
  channel: string; onDone: () => void; onCancel: () => void; onError: (msg: string) => void;
}) {
  const [ms, setMs] = useState(0);
  const [sending, setSending] = useState(false);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const discard = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let tick: ReturnType<typeof setInterval>;
    let ping: ReturnType<typeof setInterval>;
    const typing = () =>
      fetch("/api/typing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ channel, audio: true }) }).catch(() => {});

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
        const r = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 48_000 } : undefined);
        r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
        r.onstop = async () => {
          stream?.getTracks().forEach((t) => t.stop());
          if (discard.current) return;
          const duration = Date.now() - started.current;
          const type = (r.mimeType || mimeType || "audio/webm").split(";")[0];
          const blob = new Blob(chunks.current, { type });
          if (duration < 700 || !blob.size) return onCancel();
          setSending(true);
          try {
            const res = await fetch(`/api/messages/audio?channel=${channel}&ms=${duration}`, { method: "POST", headers: { "content-type": type }, body: blob });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Audio non inviato. Riprova.");
            onDone();
          } catch (e) {
            onError((e as Error).message);
            onCancel();
          }
        };
        rec.current = r;
        started.current = Date.now();
        r.start(250);
        typing();
        ping = setInterval(typing, 2500);
        tick = setInterval(() => {
          const elapsed = Date.now() - started.current;
          setMs(elapsed);
          if (elapsed >= MAX_MS && r.state === "recording") r.stop();
        }, 200);
      } catch {
        onError("Microfono non disponibile. Consenti l'accesso al microfono nelle impostazioni del browser.");
        onCancel();
      }
    })();

    return () => {
      clearInterval(tick);
      clearInterval(ping);
      if (rec.current?.state === "recording") {
        discard.current = true;
        rec.current.stop();
      }
      stream?.getTracks().forEach((t) => t.stop());
    };
    // Starts once when the bar appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stop = (send: boolean) => {
    discard.current = !send;
    if (rec.current?.state === "recording") rec.current.stop();
    if (!send) onCancel();
  };

  return (
    <div className="recbar">
      <button type="button" className="iconbtn" onClick={() => stop(false)} aria-label="Annulla audio" disabled={sending}>
        <svg viewBox="0 0 24 24"><path d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <span className="recdot" aria-hidden="true" />
      <span className="rectime num">{sending ? "Invio…" : mmss(ms)}</span>
      <span className="muted small rechint">{sending ? "" : `max ${MAX_MS / 1000} s`}</span>
      <button type="button" className="sendbtn" onClick={() => stop(true)} aria-label="Invia audio" disabled={sending}>
        <svg viewBox="0 0 24 24"><path d="M4 12l16-8-6 16-2-6z" fill="currentColor" /></svg>
      </button>
    </div>
  );
}

/** Voice message bubble: play/pause, progress and duration. */
export function VoiceBubble({ id, ms, radio }: { id: number; ms: number | null; radio?: RadioFx | null }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(ms ?? 0);
  const [err, setErr] = useState(false);

  useEffect(() => () => audio.current?.pause(), []);

  const toggle = async () => {
    // Radio messages replay with their effect (no pause: it's a transmission).
    if (radio) {
      if (playing) return;
      return playRadio(id, radio, setPlaying);
    }
    if (!audio.current) {
      const a = new Audio(`/api/audio/${id}`);
      a.preload = "auto";
      a.ontimeupdate = () => setPos(a.currentTime * 1000);
      a.onloadedmetadata = () => Number.isFinite(a.duration) && a.duration > 0 && setDur(a.duration * 1000);
      a.onended = () => { setPlaying(false); setPos(0); };
      a.onpause = () => setPlaying(false);
      a.onplay = () => setPlaying(true);
      a.onerror = () => { setErr(true); setPlaying(false); };
      audio.current = a;
    }
    if (playing) audio.current.pause();
    else await audio.current.play().catch(() => setErr(true));
  };

  const frac = dur ? Math.min(1, pos / dur) : 0;
  return (
    <span className="voice">
      <button type="button" className="playbtn" onClick={toggle} aria-label={playing ? "Pausa" : "Ascolta"}>
        {playing ? (
          <svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" /></svg>
        ) : (
          <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
        )}
      </button>
      <span className="wave" aria-hidden="true">
        {Array.from({ length: 22 }, (_, i) => (
          <i key={i} className={i / 22 < frac ? "on" : ""} style={{ height: `${30 + ((i * 37) % 70)}%` }} />
        ))}
      </span>
      <span className="vtime num">{err ? "Non riproducibile" : radio ? (playing ? "in onda…" : `📻 ${mmss(dur)}`) : mmss(playing || pos ? pos : dur)}</span>
    </span>
  );
}
