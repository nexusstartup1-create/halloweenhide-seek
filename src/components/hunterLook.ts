"use client";
// "Il Cercatore": the hunter's own look, painted over the base model's textures in the browser
// (no extra downloads). From the reference image: a pale carved-wood mask with two eye holes and
// three slits, a brown leather strap, red wool sleeves (the tunic is simulated separately), dark
// leather gloves, dark trousers and brown boots. Plus a hood resting on the back and a rusty machete.
import * as THREE from "three";
import { blobPath, rng } from "./hunterTextures";

/** Side of the repainted textures (smaller in light mode). Set by dressModel. */
let SIZE = 1024;

/** Copies a glTF texture into a canvas (glTF images are not flipped). */
function toCanvas(tex: THREE.Texture) {
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(tex.image as CanvasImageSource, 0, 0, SIZE, SIZE);
  return { c, g };
}

function fromCanvas(c: HTMLCanvasElement, like: THREE.Texture) {
  const t = new THREE.CanvasTexture(c);
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = like.wrapS;
  t.wrapT = like.wrapT;
  t.anisotropy = 8;
  return t;
}

/** Per-pixel recolour: fn gets r,g,b,luminance and the uv (0..1) and returns the new colour, or null to keep it. */
function recolor(g: CanvasRenderingContext2D, fn: (r: number, gr: number, b: number, l: number, u: number, v: number) => [number, number, number] | null) {
  const img = g.getImageData(0, 0, SIZE, SIZE);
  const d = img.data;
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      const r = d[i], gr = d[i + 1], b = d[i + 2];
      const out = fn(r, gr, b, 0.3 * r + 0.59 * gr + 0.11 * b, x / SIZE, y / SIZE);
      if (out) { d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2]; }
    }
  g.putImageData(img, 0, 0);
}

// Where the mask face sits in the base model's texture atlas, and its eye holes (measured from it).
const MASK = { cx: 0.425, cy: 0.415, r: 0.395 };
const EYES: [number, number][] = [[0.32, 0.437], [0.536, 0.443]];

/** Pale weathered wood, two eye holes, three vertical slits over the mouth; straps turned brown leather. */
function paintMask(tex: THREE.Texture) {
  const { c, g } = toCanvas(tex);
  const r = rng(201);
  const S = SIZE, cx = MASK.cx * S, cy = MASK.cy * S, R = MASK.r * S;
  // Straps and buckles outside the face: brown leather.
  recolor(g, (rr, gg, bb, l, u, v) => {
    const inFace = Math.hypot(u - MASK.cx, v - MASK.cy) < MASK.r;
    if (inFace || l < 14) return null;
    if (l < 110) return [l * 1.25 + 22, l * 0.85 + 10, l * 0.5 + 4];
    return null;
  });
  g.save();
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
  // Wood: warm pale base, darker towards the rim.
  const base = g.createRadialGradient(cx, cy - R * 0.1, R * 0.1, cx, cy, R);
  base.addColorStop(0, "#ddd2b8"); base.addColorStop(0.75, "#cbbd9c"); base.addColorStop(1, "#8f7f60");
  g.fillStyle = base; g.fillRect(cx - R, cy - R, R * 2, R * 2);
  // Grain running down the face, gently wavy.
  for (let i = 0; i < 160; i++) {
    const x = cx - R + r() * R * 2, amp = 4 + r() * 10, ph = r() * 6;
    g.strokeStyle = r() < 0.5 ? `rgba(120,95,60,${0.12 + r() * 0.2})` : `rgba(250,240,220,${0.08 + r() * 0.12})`;
    g.lineWidth = 0.6 + r() * 1.8;
    g.beginPath();
    for (let y = cy - R; y <= cy + R; y += 8) { const px = x + Math.sin(y / 40 + ph) * amp; if (y === cy - R) g.moveTo(px, y); else g.lineTo(px, y); }
    g.stroke();
  }
  // A couple of knots, dirt and scratches.
  for (let i = 0; i < 3; i++) {
    const x = cx + (r() - 0.5) * R * 1.2, y = cy + (r() - 0.5) * R * 1.4;
    for (let k = 0; k < 4; k++) { g.strokeStyle = `rgba(110,85,50,${0.35 - k * 0.07})`; g.lineWidth = 1.5; g.beginPath(); g.ellipse(x, y, 6 + k * 6, 3 + k * 4, 0, 0, Math.PI * 2); g.stroke(); }
  }
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(80,60,35,${0.08 + r() * 0.15})`; g.fill(blobPath(cx + (r() - 0.5) * R * 1.8, cy + (r() - 0.5) * R * 1.8, 3 + r() * 14, r)); }
  for (let i = 0; i < 70; i++) {
    const x = cx + (r() - 0.5) * R * 1.6, y = cy + (r() - 0.5) * R * 1.6, a = r() * Math.PI, l = 8 + r() * 40;
    g.strokeStyle = r() < 0.5 ? "rgba(90,70,45,0.45)" : "rgba(255,250,235,0.5)"; g.lineWidth = 0.6 + r();
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  // Cracks from the rim.
  g.strokeStyle = "rgba(60,42,25,0.8)"; g.lineWidth = 2;
  for (const a0 of [-2.3, 0.4, 1.9]) {
    let x = cx + Math.cos(a0) * R * 0.98, y = cy + Math.sin(a0) * R * 0.98;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 8; k++) { x += -Math.cos(a0) * (10 + r() * 14) + (r() - 0.5) * 12; y += -Math.sin(a0) * (10 + r() * 14) + (r() - 0.5) * 12; g.lineTo(x, y); }
    g.stroke();
  }
  // Eye holes: dark, slightly rounded rectangles with a worn rim.
  for (const [u, v] of EYES) {
    const x = u * S, y = v * S, w = 0.06 * S, h = 0.05 * S;
    g.fillStyle = "rgba(70,50,30,0.6)"; g.beginPath(); g.ellipse(x, y, w * 0.62, h * 0.66, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#0b0705"; g.beginPath(); g.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2); g.fill();
  }
  // Three vertical slits over the mouth. On the model the mask atlas runs bottom-up (its top is the
  // chin), so "below the eyes" is above them here.
  const mx = (EYES[0][0] + EYES[1][0]) / 2 * S, my0 = 0.19 * S, my1 = 0.29 * S;
  for (const dx of [-0.038, 0, 0.038]) {
    const x = mx + dx * S, w = 0.011 * S;
    g.fillStyle = "rgba(70,50,30,0.55)"; g.beginPath(); g.roundRect(x - w, my0 - 4, w * 2, my1 - my0 + 8, w); g.fill();
    g.fillStyle = "#0b0705"; g.beginPath(); g.roundRect(x - w * 0.6, my0, w * 1.2, my1 - my0, w * 0.6); g.fill();
  }
  // Old blood flecked on one cheek.
  for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(90,8,10,${0.5 + r() * 0.4})`; g.fill(blobPath(cx + R * 0.35 + (r() - 0.5) * 60, cy + R * 0.3 + (r() - 0.5) * 70, 1.5 + r() * 5, r)); }
  g.restore();
  return fromCanvas(c, tex);
}

/** Jacket sleeves become red wool (matching the tunic); bare hands become dark leather gloves. */
function paintArms(tex: THREE.Texture) {
  const { c, g } = toCanvas(tex);
  recolor(g, (r, gr, b, l) => {
    if (l < 12) return null; // empty atlas
    const pale = l > 100 && r >= gr - 6; // skin (and the white undershirt)
    if (pale) {
      const k = l / 200;
      return [26 + 40 * k, 22 + 32 * k, 19 + 26 * k];
    }
    if (r > gr + 40) return [55, 6, 9]; // old blood on the cloth
    const k = Math.min(1.25, l / 80);
    return [118 * k + 8, 16 * k + 2, 22 * k + 3];
  });
  return fromCanvas(c, tex);
}

/** Boots turned warm brown leather; trousers a touch greener. */
function paintLegs(tex: THREE.Texture) {
  const { c, g } = toCanvas(tex);
  recolor(g, (r, gr, b, l, u, v) => {
    const bg = Math.abs(r - 128) < 8 && Math.abs(gr - 128) < 8 && Math.abs(b - 128) < 8;
    if (bg) return null;
    const sole = u > 0.44 && u < 0.56 && ((v > 0.12 && v < 0.37) || (v > 0.57 && v < 0.83));
    if (v > 0.71 || sole) return [Math.min(255, l * 1.45 + 20), l * 1.0 + 9, l * 0.6 + 2];
    return [r * 0.9, gr * 1.02, b * 0.88];
  });
  return fromCanvas(c, tex);
}

/** Applies the look to the loaded model's materials (by their names in the base model). */
export function dressModel(model: THREE.Object3D, keep: <T extends { dispose: () => void }>(x: T) => T, size = 1024) {
  SIZE = size;
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.MeshStandardMaterial;
    if (!mat.map || mat.userData.dressed) return;
    const old = mat.map;
    if (/Misc/.test(mat.name)) {
      mat.map = keep(paintMask(old));
      // The base mask's relief (rivet holes, chevrons) no longer matches the drawing.
      if (mat.normalMap) mat.normalScale.setScalar(0.2);
      mat.roughness = 0.8;
      (mat as THREE.MeshPhysicalMaterial).clearcoat = 0;
    } else if (/Arms/.test(mat.name)) mat.map = keep(paintArms(old));
    else if (/Cloth/.test(mat.name)) mat.map = keep(paintLegs(old));
    else return;
    mat.userData.dressed = true;
    mat.needsUpdate = true;
  });
}

/** Rusty machete, blade hanging along -y from the grip at the origin. About 1 unit long before scaling. */
export function makeMachete(keep: <T extends { dispose: () => void }>(x: T) => T) {
  const g = new THREE.Group();
  const c = document.createElement("canvas");
  c.width = 64; c.height = 512;
  const x = c.getContext("2d")!;
  const r = rng(77);
  const steel = x.createLinearGradient(0, 0, 64, 0);
  steel.addColorStop(0, "#5d6168"); steel.addColorStop(0.7, "#8b9097"); steel.addColorStop(1, "#d9dde2");
  x.fillStyle = steel; x.fillRect(0, 0, 64, 512);
  for (let i = 0; i < 80; i++) { x.fillStyle = `rgba(${110 + r() * 40},${50 + r() * 20},18,${0.3 + r() * 0.5})`; x.fill(blobPath(r() * 64, r() * 512, 2 + r() * 8, r)); }
  const red = x.createLinearGradient(0, 300, 0, 512);
  red.addColorStop(0, "rgba(90,0,8,0)"); red.addColorStop(1, "rgba(70,0,6,0.85)");
  x.fillStyle = red; x.fillRect(0, 300, 64, 212);
  const map = keep(new THREE.CanvasTexture(c));
  map.colorSpace = THREE.SRGBColorSpace;
  const shape = new THREE.Shape();
  shape.moveTo(-0.07, 0); shape.lineTo(0.07, 0); shape.lineTo(0.1, -0.8); shape.quadraticCurveTo(0.1, -0.98, -0.02, -1.0); shape.lineTo(-0.07, -0.86); shape.closePath();
  const geo = keep(new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false }));
  const uv = geo.attributes.uv, p = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) + 0.07) / 0.17, 1 + p.getY(i));
  const blade = new THREE.Mesh(geo, keep(new THREE.MeshStandardMaterial({ map, metalness: 0.7, roughness: 0.4 })));
  blade.rotation.y = Math.PI / 2;
  blade.position.y = -0.14;
  const grip = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.035, 0.04, 0.26, 8)), keep(new THREE.MeshStandardMaterial({ color: "#3a2717", roughness: 0.85 })));
  g.add(blade, grip);
  return g;
}

/** A wool hood lying folded on the back, below the neck. Built round the origin; place it on the upper back. */
export function makeHood(material: THREE.Material, size: number, keep: <T extends { dispose: () => void }>(x: T) => T) {
  // Back half of a squashed sphere shell: reads as a hood pushed down onto the shoulders.
  const geo = keep(new THREE.SphereGeometry(size, 24, 14, Math.PI * 1.15, Math.PI * 0.7, Math.PI * 0.18, Math.PI * 0.5));
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    // Soft folds.
    const ang = Math.atan2(p.getZ(i), p.getX(i));
    const k = 1 + 0.06 * Math.sin(ang * 7 + p.getY(i) * 3);
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * 0.75, p.getZ(i) * k);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}

/** Wood texture for the new mask: canvas top is the forehead. Eyes, three mouth slits, grain, cracks. */
function maskWood() {
  const S = 512;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  const r = rng(303);
  const base = g.createRadialGradient(S / 2, S * 0.45, S * 0.05, S / 2, S / 2, S * 0.62);
  base.addColorStop(0, "#e2d7bd"); base.addColorStop(0.7, "#cdbf9f"); base.addColorStop(1, "#8a7a5a");
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 120; i++) {
    const x = r() * S, amp = 3 + r() * 8, ph = r() * 6;
    g.strokeStyle = r() < 0.5 ? `rgba(120,95,60,${0.12 + r() * 0.2})` : `rgba(255,245,225,${0.08 + r() * 0.12})`;
    g.lineWidth = 0.5 + r() * 1.5;
    g.beginPath();
    for (let y = 0; y <= S; y += 6) { const px = x + Math.sin(y / 30 + ph) * amp; if (!y) g.moveTo(px, y); else g.lineTo(px, y); }
    g.stroke();
  }
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(80,60,35,${0.08 + r() * 0.15})`; g.fill(blobPath(r() * S, r() * S, 2 + r() * 10, r)); }
  for (let i = 0; i < 50; i++) {
    const x = r() * S, y = r() * S, a = r() * Math.PI, l = 6 + r() * 30;
    g.strokeStyle = r() < 0.5 ? "rgba(90,70,45,0.45)" : "rgba(255,250,235,0.5)"; g.lineWidth = 0.6 + r();
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  g.strokeStyle = "rgba(60,42,25,0.8)"; g.lineWidth = 1.6;
  g.beginPath(); let x = S * 0.12, y = S * 0.3; g.moveTo(x, y);
  for (let k = 0; k < 7; k++) { x += 8 + r() * 10; y += (r() - 0.4) * 14; g.lineTo(x, y); }
  g.stroke();
  // Eyes: narrow, slightly slanted holes.
  for (const [ex, tilt] of [[0.33, 0.12], [0.67, -0.12]] as const) {
    g.fillStyle = "rgba(70,50,30,0.55)"; g.beginPath(); g.ellipse(ex * S, 0.4 * S, 34, 22, tilt, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#070403"; g.beginPath(); g.ellipse(ex * S, 0.4 * S, 27, 16, tilt, 0, Math.PI * 2); g.fill();
  }
  // Three vertical slits over the mouth.
  for (const dx of [-30, 0, 30]) {
    g.fillStyle = "rgba(70,50,30,0.5)"; g.beginPath(); g.roundRect(S / 2 + dx - 8, S * 0.66 - 4, 16, S * 0.15 + 8, 8); g.fill();
    g.fillStyle = "#070403"; g.beginPath(); g.roundRect(S / 2 + dx - 5, S * 0.66, 10, S * 0.15, 5); g.fill();
  }
  for (let i = 0; i < 10; i++) { g.fillStyle = `rgba(90,8,10,${0.5 + r() * 0.4})`; g.fill(blobPath(S * 0.7 + (r() - 0.5) * 40, S * 0.6 + (r() - 0.5) * 50, 1.5 + r() * 4, r)); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/**
 * The carved wooden mask with its strap, sized to a face `w` wide and `h` tall, `d` deep from the front
 * of the head to its centre. Faces +z, centred on the origin (the centre of the head).
 */
export function makeMask(w: number, h: number, d: number, keep: <T extends { dispose: () => void }>(x: T) => T) {
  const g = new THREE.Group();
  // Front of a squashed sphere, slightly flattened over the face; planar UVs from the front.
  const geo = keep(new THREE.SphereGeometry(1, 40, 28, Math.PI * 1.08, Math.PI * 0.84, Math.PI * 0.08, Math.PI * 0.84));
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // Flip front/back: this phi range is the -z side; the mask faces +z.
    const nx = x * (w / 2), ny = y * (h / 2) * (y < 0 ? 1 - 0.18 * -y : 1), nz = -z * d;
    p.setXYZ(i, nx, ny, nz);
    uv.setXY(i, 0.5 + x / 2, 0.5 + y / 2);
  }
  geo.computeVertexNormals();
  const wood = keep(new THREE.MeshStandardMaterial({ map: keep(maskWood()), roughness: 0.85, side: THREE.DoubleSide }));
  g.add(new THREE.Mesh(geo, wood));
  // Brown leather strap round the head and one over the top.
  const leather = keep(new THREE.MeshStandardMaterial({ color: "#5a3a22", roughness: 0.7 }));
  const around = new THREE.Mesh(keep(new THREE.TorusGeometry(1, 0.035, 6, 32, Math.PI * 1.15)), leather);
  around.rotation.set(Math.PI / 2, 0, Math.PI * 0.92);
  around.scale.set(w * 0.53, d * 1.0, 1);
  around.position.y = h * 0.12;
  const over = new THREE.Mesh(keep(new THREE.TorusGeometry(1, 0.035, 6, 32, Math.PI)), leather);
  over.rotation.set(0, Math.PI / 2, 0);
  // Hugs the crown: from the top of the mask back over the skull.
  over.scale.set(d * 0.8, h * 0.36, 1);
  over.position.set(0, h * 0.2, -d * 0.55);
  g.add(around, over);
  return g;
}
