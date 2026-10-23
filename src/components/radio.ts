"use client";
// Walkie-talkie playback: the recording is stored clean, the effect is applied here with Web Audio.
import { audioContext, soundOn } from "./sound";

export type RadioFx = "police" | "ghost";

export function radioFx(): RadioFx {
  try { return localStorage.getItem("cnh_radio_fx") === "ghost" ? "ghost" : "police"; } catch { return "police"; }
}
export function setRadioFx(fx: RadioFx) {
  try { localStorage.setItem("cnh_radio_fx", fx); } catch {}
}
/** Teammates' radio messages play by themselves as they arrive (on by default). */
export function radioAuto() {
  try { return localStorage.getItem("cnh_radio_auto") !== "off"; } catch { return true; }
}
export function setRadioAuto(on: boolean) {
  try { localStorage.setItem("cnh_radio_auto", on ? "on" : "off"); } catch {}
}

function noiseBuffer(a: AudioContext, seconds: number) {
  const b = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * seconds)), a.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function distortion(amount: number) {
  const n = 1024, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

/** Short static burst plus a tone: the click you hear when someone keys the radio. */
export function squelch(kind: "open" | "close", fx: RadioFx = radioFx()) {
  if (!soundOn()) return;
  const a = audioContext();
  if (!a) return;
  const t = a.currentTime;
  const n = a.createBufferSource();
  n.buffer = noiseBuffer(a, 0.12);
  const bp = a.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = fx === "ghost" ? 900 : 2400;
  const ng = a.createGain();
  ng.gain.setValueAtTime(0.18, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  n.connect(bp).connect(ng).connect(a.destination);
  n.start(t);
  const o = a.createOscillator();
  const og = a.createGain();
  o.type = fx === "ghost" ? "sine" : "square";
  const f = fx === "ghost" ? (kind === "open" ? 220 : 160) : kind === "open" ? 1250 : 1650;
  o.frequency.setValueAtTime(f, t + 0.05);
  if (kind === "close") o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.2);
  og.gain.setValueAtTime(0.0001, t + 0.05);
  og.gain.exponentialRampToValueAtTime(fx === "ghost" ? 0.15 : 0.06, t + 0.07);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  o.connect(og).connect(a.destination);
  o.start(t + 0.05);
  o.stop(t + 0.3);
}

let queue: Promise<void> = Promise.resolve();

/** Plays a stored voice message through the radio or ghost effect. Calls queue up, one at a time. */
export function playRadio(id: number, fx: RadioFx, onState?: (playing: boolean) => void) {
  queue = queue.then(() => playNow(id, fx, onState)).catch(() => onState?.(false));
  return queue;
}

async function playNow(id: number, fx: RadioFx, onState?: (playing: boolean) => void) {
  const a = audioContext();
  const res = await fetch(`/api/audio/${id}`);
  if (!res.ok) throw new Error("audio");
  const bytes = await res.arrayBuffer();
  let buf: AudioBuffer | null = null;
  try { buf = a ? await a.decodeAudioData(bytes.slice(0)) : null; } catch { buf = null; }
  onState?.(true);
  if (!a || !buf) {
    // Format the browser can't decode for Web Audio: play it plain.
    const el = new Audio(URL.createObjectURL(new Blob([bytes])));
    await new Promise<void>((done) => { el.onended = () => done(); el.onerror = () => done(); el.play().catch(() => done()); });
    onState?.(false);
    return;
  }
  squelch("open", fx);
  await new Promise((r) => setTimeout(r, 220));
  const t = a.currentTime;
  const src = a.createBufferSource();
  src.buffer = buf;
  const out = a.createGain();
  out.gain.value = 1;
  out.connect(a.destination);
  let dur = buf.duration;

  if (fx === "police") {
    const hp = a.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 450;
    const lp = a.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2900;
    const ws = a.createWaveShaper(); ws.curve = distortion(60); ws.oversample = "2x";
    const comp = a.createDynamicsCompressor();
    src.connect(hp).connect(lp).connect(ws).connect(comp).connect(out);
    // Hiss under the voice.
    const hiss = a.createBufferSource();
    hiss.buffer = noiseBuffer(a, dur + 0.2);
    const hbp = a.createBiquadFilter(); hbp.type = "bandpass"; hbp.frequency.value = 3000;
    const hg = a.createGain(); hg.gain.value = 0.035;
    hiss.connect(hbp).connect(hg).connect(out);
    hiss.start(t);
  } else {
    // Ghost: deeper and slower, muffled, with a long echo.
    src.playbackRate.value = 0.8;
    dur = buf.duration / 0.8;
    const lp = a.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2200;
    const dry = a.createGain(); dry.gain.value = 0.85;
    const delay = a.createDelay(1); delay.delayTime.value = 0.3;
    const fb = a.createGain(); fb.gain.value = 0.45;
    const wet = a.createGain(); wet.gain.value = 0.5;
    src.connect(lp);
    lp.connect(dry).connect(out);
    lp.connect(delay);
    delay.connect(fb).connect(delay);
    delay.connect(wet).connect(out);
    dur += 1.2;
  }
  src.start(t);
  await new Promise((r) => setTimeout(r, dur * 1000 + 100));
  squelch("close", fx);
  await new Promise((r) => setTimeout(r, 300));
  onState?.(false);
}
