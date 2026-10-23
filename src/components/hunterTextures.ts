"use client";
// Canvas texture helpers for the 3D map characters (pumpkin, hunter's glow): seeded randomness,
// normal maps from height maps, grain, irregular blobs, a soft glow.
import * as THREE from "three";

/** Same pseudo-random sequence every time, so every hunter looks the same. */
export function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

type Ctx = CanvasRenderingContext2D;

export function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, g: c.getContext("2d", { willReadFrequently: true })! };
}

export function texture(c: HTMLCanvasElement, color: boolean) {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function paint(w: number, h: number, draw: (g: Ctx, w: number, h: number) => void, color = true) {
  const { c, g } = canvas(w, h);
  draw(g, w, h);
  return texture(c, color);
}

/** Normal map from a greyscale height canvas. */
export function normalFrom(src: HTMLCanvasElement, strength: number) {
  const w = src.width, h = src.height;
  const hd = src.getContext("2d")!.getImageData(0, 0, w, h).data;
  const { c, g } = canvas(w, h);
  const out = g.createImageData(w, h);
  const at = (x: number, y: number) => hd[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      out.data[i] = (-dx / len * 0.5 + 0.5) * 255;
      out.data[i + 1] = (dy / len * 0.5 + 0.5) * 255;
      out.data[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  g.putImageData(out, 0, 0);
  return texture(c, false);
}

/** Per-pixel noise (±amount), with an optional pattern subtracted (weave). */
export function grain(g: Ctx, w: number, h: number, amount: number, r: () => number, pattern?: (x: number, y: number) => number) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const n = (r() - 0.5) * amount - (pattern ? pattern(x, y) : 0);
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
  g.putImageData(img, 0, 0);
}

/** Irregular round shape. */
export function blobPath(x: number, y: number, rad: number, r: () => number) {
  const p = new Path2D();
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const k = rad * (0.6 + r() * 0.6);
    if (i) p.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k);
    else p.moveTo(x + Math.cos(a) * k, y + Math.sin(a) * k);
  }
  p.closePath();
  return p;
}

/** Soft round glow for eyes, flame and the lantern. */
export function glowTexture() {
  return paint(64, 64, (g, W) => {
    const gr = g.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.25, "rgba(255,255,255,0.6)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, W, W);
  });
}
