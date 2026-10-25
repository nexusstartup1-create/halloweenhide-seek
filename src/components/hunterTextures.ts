"use client";
// Canvas texture helpers for the 3D map characters (pumpkin, hunter's glow): seeded randomness,
// normal maps from height maps, grain, irregular blobs, a soft glow.
import * as THREE from "three";
import { shrinkCanvas } from "./device";

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

/**
 * The hunter's red tunic: heavy, worn wool (u wraps round the body, v=1 at the shoulders, 0 at the hem).
 * Twill weave, faded and darker patches, a sewn patch, side seams, a stitched hem, mud and dark old stains
 * low down, frayed threads at the bottom. Colour, height (-> normal) and roughness maps.
 */
export function tunicTextures(size = 1024) {
  const W = 1024, H = 1024;
  const col = canvas(W, H), hgt = canvas(W, H), rough = canvas(W, H);
  const C = col.g, Hh = hgt.g, R = rough.g;
  const r = rng(131);
  C.fillStyle = "#7d0f18"; C.fillRect(0, 0, W, H);
  Hh.fillStyle = "#808080"; Hh.fillRect(0, 0, W, H);
  R.fillStyle = "#e6e6e6"; R.fillRect(0, 0, W, H);

  // Old dye never holds evenly: faded rose patches, deep wine shadows.
  for (let i = 0; i < 60; i++) {
    const x = r() * W, y = r() * H, rad = 40 + r() * 180;
    const gr = C.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, r() < 0.45 ? `rgba(170,60,60,${0.08 + r() * 0.14})` : `rgba(25,0,4,${0.15 + r() * 0.25})`);
    gr.addColorStop(1, "rgba(0,0,0,0)");
    C.fillStyle = gr; C.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // Long vertical folds pressed into the wool.
  for (let i = 0; i < 26; i++) {
    const x = r() * W, w = 8 + r() * 30;
    const gr = C.createLinearGradient(x - w, 0, x + w, 0);
    gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(0.5, `rgba(20,0,4,${0.15 + r() * 0.2})`); gr.addColorStop(1, "rgba(0,0,0,0)");
    C.fillStyle = gr; C.fillRect(x - w, 0, w * 2, H);
    const gh = Hh.createLinearGradient(x - w, 0, x + w, 0);
    gh.addColorStop(0, "rgba(0,0,0,0)"); gh.addColorStop(0.5, "rgba(0,0,0,0.35)"); gh.addColorStop(1, "rgba(0,0,0,0)");
    Hh.fillStyle = gh; Hh.fillRect(x - w, 0, w * 2, H);
  }
  // Side seams (u = 0.25 and 0.75) and the neckline at the top.
  for (const sx of [W * 0.25, W * 0.75]) {
    C.strokeStyle = "rgba(20,0,4,0.7)"; C.lineWidth = 4; C.beginPath(); C.moveTo(sx, 0); C.lineTo(sx, H); C.stroke();
    Hh.strokeStyle = "#000"; Hh.lineWidth = 4; Hh.beginPath(); Hh.moveTo(sx, 0); Hh.lineTo(sx, H); Hh.stroke();
    C.strokeStyle = "rgba(210,170,140,0.5)"; C.lineWidth = 1.2; C.setLineDash([6, 5]);
    for (const d of [-6, 6]) { C.beginPath(); C.moveTo(sx + d, 0); C.lineTo(sx + d, H); C.stroke(); }
    C.setLineDash([]);
  }
  C.fillStyle = "rgba(30,0,5,0.55)"; C.fillRect(0, 0, W, 36);
  Hh.fillStyle = "rgba(255,255,255,0.25)"; Hh.fillRect(0, 0, W, 36);
  // A square patch sewn on the back, a little paler.
  {
    const x = W * 0.46, y = H * 0.36, w = 120, h = 110;
    C.fillStyle = "#6a1a1c"; C.fillRect(x, y, w, h);
    C.strokeStyle = "rgba(20,0,4,0.7)"; C.lineWidth = 3; C.strokeRect(x, y, w, h);
    Hh.fillStyle = "rgba(255,255,255,0.18)"; Hh.fillRect(x, y, w, h);
    C.strokeStyle = "rgba(220,190,150,0.65)"; C.lineWidth = 1.4;
    for (let k = 0; k < 4; k++) {
      const n = 12;
      for (let s = 0; s < n; s++) {
        const t = s / n;
        const [px, py] = k === 0 ? [x + 8 + t * (w - 16), y + 8] : k === 1 ? [x + w - 8, y + 8 + t * (h - 16)] : k === 2 ? [x + 8 + t * (w - 16), y + h - 8] : [x + 8, y + 8 + t * (h - 16)];
        C.beginPath(); C.moveTo(px - 3, py - 3); C.lineTo(px + 3, py + 3); C.moveTo(px + 3, py - 3); C.lineTo(px - 3, py + 3); C.stroke();
      }
    }
  }
  // A second, paler patch low on the front (u ≈ 0.9), like the reference drawing.
  {
    const x = W * 0.86, y = H * 0.62, w = 90, h = 100;
    C.fillStyle = "#9c7b52"; C.fillRect(x, y, w, h);
    C.strokeStyle = "rgba(40,20,5,0.7)"; C.lineWidth = 3; C.strokeRect(x, y, w, h);
    Hh.fillStyle = "rgba(255,255,255,0.2)"; Hh.fillRect(x, y, w, h);
    C.strokeStyle = "rgba(60,30,10,0.6)"; C.lineWidth = 1.4; C.setLineDash([6, 5]); C.strokeRect(x + 7, y + 7, w - 14, h - 14); C.setLineDash([]);
  }
  // Stitched hem band at the bottom.
  C.fillStyle = "rgba(25,0,5,0.45)"; C.fillRect(0, H - 60, W, 60);
  Hh.strokeStyle = "#000"; Hh.lineWidth = 3; Hh.beginPath(); Hh.moveTo(0, H - 60); Hh.lineTo(W, H - 60); Hh.stroke();
  C.strokeStyle = "rgba(210,170,140,0.5)"; C.lineWidth = 1.2; C.setLineDash([7, 5]);
  C.beginPath(); C.moveTo(0, H - 52); C.lineTo(W, H - 52); C.stroke(); C.setLineDash([]);
  // Mud splashed up from the ground, drier and matte.
  const mud = C.createLinearGradient(0, H, 0, H * 0.62);
  mud.addColorStop(0, "rgba(48,30,16,0.85)"); mud.addColorStop(1, "rgba(48,30,16,0)");
  C.fillStyle = mud; C.fillRect(0, H * 0.62, W, H * 0.38);
  for (let i = 0; i < 160; i++) {
    const p = blobPath(r() * W, H * (0.72 + r() * 0.28), 1 + r() * 6, r);
    C.fillStyle = `rgba(60,40,22,${0.35 + r() * 0.45})`; C.fill(p);
    Hh.fillStyle = "rgba(255,255,255,0.25)"; Hh.fill(p);
    R.fillStyle = "#ffffff"; R.fill(p);
  }
  // Old dark stains on the front (u ≈ 0/1): almost black on red, slightly glossy.
  for (let i = 0; i < 12; i++) {
    const x0 = (r() - 0.5) * W * 0.3, x = x0 < 0 ? x0 + W : x0, y = H * (0.25 + r() * 0.5), s = 12 + r() * 40;
    const p = new Path2D();
    p.addPath(blobPath(x, y, s, r));
    for (let k = 0; k < 5; k++) p.addPath(blobPath(x + (r() - 0.5) * s * 3, y + (r() - 0.5) * s * 2.5, s * (0.15 + r() * 0.2), r));
    C.fillStyle = `rgba(30,0,3,${0.6 + r() * 0.3})`; C.fill(p);
    R.fillStyle = "#808080"; R.fill(p);
  }
  // Frayed threads and small tears at the hem.
  for (let i = 0; i < 90; i++) {
    const x = r() * W, l = 8 + r() * 36;
    C.strokeStyle = r() < 0.6 ? "rgba(150,40,45,0.7)" : "rgba(10,0,2,0.9)";
    C.lineWidth = 0.8 + r() * 1.6;
    C.beginPath(); C.moveTo(x, H); C.quadraticCurveTo(x + (r() - 0.5) * 10, H - l / 2, x + (r() - 0.5) * 8, H - l); C.stroke();
  }
  // Twill weave + fine fibres.
  const twill = (x: number, y: number) => ((x + y) % 6 < 3 ? 7 : 0) + (y % 2 ? 2 : 0);
  grain(C, W, H, 16, r, twill);
  grain(Hh, W, H, 12, r, (x, y) => twill(x, y) * 3.5);
  grain(R, W, H, 14, r);
  // Light mode: painted at full size (the details are in pixels), then shrunk for the GPU.
  return { map: texture(shrinkCanvas(col.c, size), true), normal: normalFrom(shrinkCanvas(hgt.c, size), 6), rough: texture(shrinkCanvas(rough.c, size), false) };
}
