"use client";
// Short game sounds synthesised with Web Audio: no files to download, works offline.

export type Sfx = "start" | "ping" | "alert" | "capture" | "mission" | "card" | "whisper";

let ctx: AudioContext | null = null;

export function soundOn() {
  try { return localStorage.getItem("cnh_sound") !== "off"; } catch { return true; }
}
export function setSound(on: boolean) {
  try { localStorage.setItem("cnh_sound", on ? "on" : "off"); } catch {}
}

function audio() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

/** Browsers only allow sound after a tap: call once on the first interaction. */
export function unlockAudio() {
  const a = audio();
  if (!a) return;
  const b = a.createBuffer(1, 1, 22050);
  const s = a.createBufferSource();
  s.buffer = b;
  s.connect(a.destination);
  s.start(0);
}

function tone(a: AudioContext, { freq, to, start = 0, dur, type = "sine", gain = 0.2 }: { freq: number; to?: number; start?: number; dur: number; type?: OscillatorType; gain?: number }) {
  const t = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(a: AudioContext, { start = 0, dur, gain = 0.12, freq = 800 }: { start?: number; dur: number; gain?: number; freq?: number }) {
  const t = a.currentTime + start;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = freq;
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

export function play(name: Sfx) {
  if (!soundOn()) return;
  const a = audio();
  if (!a) return;
  switch (name) {
    case "start": // deep gong
      tone(a, { freq: 98, dur: 2.2, type: "sine", gain: 0.35 });
      tone(a, { freq: 196, dur: 1.6, type: "triangle", gain: 0.12 });
      tone(a, { freq: 293, dur: 1.2, type: "sine", gain: 0.06 });
      break;
    case "ping": // sonar blip with echo
      tone(a, { freq: 1400, to: 1100, dur: 0.25, gain: 0.25 });
      tone(a, { freq: 1400, to: 1100, start: 0.35, dur: 0.25, gain: 0.1 });
      break;
    case "alert": // two-tone warning
      tone(a, { freq: 660, dur: 0.16, type: "square", gain: 0.08 });
      tone(a, { freq: 440, start: 0.18, dur: 0.22, type: "square", gain: 0.08 });
      break;
    case "capture": // falling wail + hiss
      tone(a, { freq: 900, to: 120, dur: 1.1, type: "sawtooth", gain: 0.12 });
      noise(a, { dur: 0.6, gain: 0.08, freq: 1200 });
      break;
    case "mission": // rising arpeggio
      [523, 659, 784, 1047].forEach((f, i) => tone(a, { freq: f, start: i * 0.09, dur: 0.3, type: "triangle", gain: 0.14 }));
      break;
    case "card":
      tone(a, { freq: 300, to: 900, dur: 0.25, type: "triangle", gain: 0.12 });
      break;
    case "whisper":
      noise(a, { dur: 1.2, gain: 0.1, freq: 2500 });
      tone(a, { freq: 220, to: 180, dur: 1.2, gain: 0.04 });
      break;
  }
}
