"use client";
// A realistic jack-o'-lantern for the fugitives on the 3D map: ribbed, uneven pumpkin with waxy skin,
// a twisted stem and a curled tendril, and a face carved through to a candle-lit inside.
// Textures are painted on canvases at runtime. Facing +z, standing on y = 0, about 5.5 units tall.
import * as THREE from "three";
import { blobPath, canvas, glowTexture, grain, normalFrom, rng, texture } from "./hunterTextures";
import { shrinkCanvas } from "./device";

type Disposable = { dispose: () => void };
type Keep = <T extends Disposable>(x: T) => T;

const RIBS = 10;
const R = 2.8;
/** Vertical squash of the sphere. */
const SQ = 0.8;

/** Unit-sphere point on the front (nx, ny) -> canvas pixel, for SphereGeometry UVs (u = 0.25 faces +z). */
function frontUV(nx: number, ny: number, W: number, H: number): [number, number] {
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  const theta = Math.acos(Math.max(-1, Math.min(1, ny)));
  return [(Math.atan2(nz, -nx) / (Math.PI * 2)) * W, (theta / Math.PI) * H];
}

/** The carved face, as polygons in front-of-sphere coordinates (nx, ny). */
function carving(): [number, number][][] {
  const tri = (cx: number, cy: number, w: number, h: number, up = true): [number, number][] =>
    up ? [[cx - w, cy - h / 2], [cx + w, cy - h / 2], [cx + w * 0.1, cy + h / 2]] : [[cx - w, cy + h / 2], [cx + w, cy + h / 2], [cx, cy - h / 2]];
  // Grin with teeth: upper lip zig-zags down between two teeth, lower lip curves.
  const mouth: [number, number][] = [];
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const x = -0.58 + (1.16 * i) / n;
    const base = -0.16 - 0.1 * (1 - (x / 0.58) ** 2);
    const tooth = i === 3 || i === 6 ? -0.12 : 0;
    mouth.push([x, base + tooth + (i % 2 ? 0.02 : 0)]);
  }
  for (let i = n; i >= 0; i--) {
    const x = -0.58 + (1.16 * i) / n;
    const low = -0.2 - 0.32 * (1 - (x / 0.62) ** 2);
    const tooth = i === 5 ? 0.12 : 0;
    mouth.push([x * 0.96, low + tooth]);
  }
  // Raised: the map camera looks down at the pumpkin, so the face sits in its upper half.
  const up = (poly: [number, number][]): [number, number][] => poly.map(([x, y]) => [x, y + 0.2]);
  return [tri(-0.33, 0.24, 0.17, 0.26), tri(0.33, 0.24, 0.17, 0.26), tri(0, 0.02, 0.08, 0.13, false), mouth].map(up);
}

/** Lattice value noise from a hash (no tables), smooth, roughly in [0,1]. */
function vnoise(x: number, y: number, seed: number) {
  const h = (i: number, j: number) => {
    const s = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
  return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
}
function fbm(x: number, y: number, seed: number, oct = 4) {
  let v = 0, a = 0.5, f = 1, t = 0;
  for (let i = 0; i < oct; i++) { v += vnoise(x * f, y * f, seed + i * 13) * a; t += a; a *= 0.5; f *= 2; }
  return v / t;
}

/** Shared by every pumpkin: painted once (it takes a moment), only the glow colour differs per pumpkin. */
let pumpkinTex: ReturnType<typeof paintPumpkin> | null = null;
function pumpkinTextures(lite: boolean) {
  pumpkinTex ??= paintPumpkin(lite ? 1024 : 2048);
  return pumpkinTex;
}

function paintPumpkin(maxSide = 2048) {
  const W = 2048, H = 1024;
  const col = canvas(W, H), hgt = canvas(W, H), emi = canvas(W, H), rough = canvas(W, H);
  const C = col.g, Hh = hgt.g, E = emi.g, Ro = rough.g;
  const r = rng(91);

  // ---- skin, pixel by pixel ----
  const ci = C.createImageData(W, H), hi = Hh.createImageData(W, H), ri = Ro.createImageData(W, H);
  const cd = ci.data, hd = hi.data, rd = ri.data;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  for (let y = 0; y < H; y++) {
    const v = y / H; // 0 top (stem) .. 1 bottom
    const pole = Math.min(v, 1 - v) * 2; // 0 at the poles, 1 at the equator
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const lobeF = Math.abs(Math.sin(u * Math.PI * RIBS)); // 1 lobe centre, 0 groove
      // Broad colour variation (wraps in u so there's no seam).
      const big = fbm(Math.cos(u * Math.PI * 2) * 3 + 10, Math.sin(u * Math.PI * 2) * 3 + v * 4, 1);
      const mid = fbm(u * 40, v * 14, 2, 3);
      // Fibres running pole to pole: noise stretched along v.
      const fib = vnoise(u * 900, v * 6, 3) * 0.6 + vnoise(u * 2200, v * 10, 4) * 0.4;
      // Base: deep orange -> golden on the lobes, darker red-brown in the grooves.
      let R = lerp(212, 246, big), G = lerp(86, 132, big * 0.8 + mid * 0.2), B = lerp(10, 30, mid);
      const lit = Math.pow(lobeF, 1.5);
      R = lerp(R * 0.62, R * 1.04, lit); G = lerp(G * 0.5, G * 1.08, lit); B = lerp(B * 0.6, B, lit);
      // Fibre streaks.
      const s = (fib - 0.5) * 0.16;
      R *= 1 + s; G *= 1 + s * 1.3; B *= 1 + s;
      // Green-brown near the stem, pale cream where it rested on the ground.
      const top = Math.max(0, 1 - v / 0.14);
      R = lerp(R, 110, top * 0.75); G = lerp(G, 92, top * 0.75); B = lerp(B, 30, top * 0.75);
      const ground = Math.max(0, (v - 0.82) / 0.18) * (0.6 + 0.4 * mid);
      R = lerp(R, 214, ground * 0.8); G = lerp(G, 186, ground * 0.8); B = lerp(B, 110, ground * 0.8);
      const i = (y * W + x) * 4;
      cd[i] = R; cd[i + 1] = G; cd[i + 2] = B; cd[i + 3] = 255;
      // Height: lobes up, grooves down, fibres and fine bumpiness.
      const hgtV = 128 + (lobeF - 0.5) * 70 + (fib - 0.5) * 22 + (vnoise(u * 300, v * 150, 5) - 0.5) * 18;
      hd[i] = hd[i + 1] = hd[i + 2] = hgtV; hd[i + 3] = 255;
      // Waxy on the lobes, a touch drier in the grooves and near the poles.
      const rg = 95 + (1 - lobeF) * 50 + (1 - pole) * 30 + (mid - 0.5) * 30;
      rd[i] = rd[i + 1] = rd[i + 2] = rg; rd[i + 3] = 255;
    }
  }
  C.putImageData(ci, 0, 0); Hh.putImageData(hi, 0, 0); Ro.putImageData(ri, 0, 0);
  E.fillStyle = "#000"; E.fillRect(0, 0, W, H);

  // Pores: tiny dark pits.
  for (let i = 0; i < 9000; i++) {
    const x = r() * W, y = H * (0.08 + r() * 0.86), rad = 0.5 + r() * 1.1;
    C.fillStyle = `rgba(110,40,0,${0.25 + r() * 0.25})`; C.beginPath(); C.arc(x, y, rad, 0, Math.PI * 2); C.fill();
    Hh.fillStyle = "rgba(0,0,0,0.5)"; Hh.beginPath(); Hh.arc(x, y, rad, 0, Math.PI * 2); Hh.fill();
  }
  // Few small pale flecks.
  for (let i = 0; i < 700; i++) {
    const x = r() * W, y = H * (0.1 + r() * 0.8);
    C.fillStyle = `rgba(255,214,140,${0.18 + r() * 0.25})`;
    C.fillRect(x, y, 1 + r() * 1.5, 2 + r() * 4);
  }
  // Corky blemishes: rough tan patches, raised and matte.
  for (let i = 0; i < 9; i++) {
    const cx = r() * W, cy = H * (0.3 + r() * 0.55);
    for (let k = 0; k < 40; k++) {
      const p = blobPath(cx + (r() - 0.5) * 40, cy + (r() - 0.5) * 26, 2 + r() * 6, r);
      C.fillStyle = `rgba(${150 + r() * 40},${105 + r() * 30},${55 + r() * 20},0.7)`; C.fill(p);
      Hh.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.3})`; Hh.fill(p);
      Ro.fillStyle = "#e8e8e8"; Ro.fill(p);
    }
  }
  // Healed scratches: thin, pale and raised.
  for (let i = 0; i < 10; i++) {
    const x = r() * W, y = H * (0.25 + r() * 0.5), l = 20 + r() * 50, a = (r() - 0.5) * 2;
    const p = new Path2D();
    p.moveTo(x, y); p.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (r() - 0.5) * 8, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    C.strokeStyle = "rgba(200,160,100,0.75)"; C.lineWidth = 1.5 + r() * 1.5; C.stroke(p);
    Hh.strokeStyle = "rgba(255,255,255,0.6)"; Hh.lineWidth = 3; Hh.stroke(p);
    Ro.strokeStyle = "#e0e0e0"; Ro.lineWidth = 3; Ro.stroke(p);
  }

  // ---- carved face ----
  const polys = carving();
  const path = (poly: [number, number][], dy = 0, k = 1) => {
    const cx = poly.reduce((a, q) => a + q[0], 0) / poly.length, cy = poly.reduce((a, q) => a + q[1], 0) / poly.length;
    const p = new Path2D();
    poly.forEach(([x, y], i) => {
      const [px, py] = frontUV(cx + (x - cx) * k, cy + (y - cy) * k + dy, W, H);
      if (i) p.lineTo(px, py); else p.moveTo(px, py);
    });
    p.closePath();
    return p;
  };
  // Light through the thin skin around the holes.
  E.save();
  E.filter = "blur(18px)";
  E.fillStyle = "rgba(255,255,255,0.22)";
  for (const poly of polys) E.fill(path(poly, 0, 1.25));
  E.restore();
  for (const poly of polys) {
    const hole = path(poly), inner = path(poly, -0.04, 0.92);
    // Cut wall: pale flesh with fibres, sooty at the top where the candle smoke goes.
    C.save(); C.clip(hole);
    const [bx, by] = frontUV(poly[0][0], poly[0][1], W, H);
    const wall = C.createLinearGradient(bx, by - 80, bx, by + 80);
    wall.addColorStop(0, "#f6d08a"); wall.addColorStop(1, "#e8a24a");
    C.fillStyle = wall; C.fill(hole);
    for (let k = 0; k < 120; k++) {
      const x = bx + (r() - 0.5) * 500, y = by + (r() - 0.5) * 200;
      C.strokeStyle = `rgba(${200 + r() * 55},${150 + r() * 60},70,0.5)`; C.lineWidth = 0.8;
      C.beginPath(); C.moveTo(x, y); C.lineTo(x + (r() - 0.5) * 4, y + 6 + r() * 10); C.stroke();
    }
    C.restore();
    C.strokeStyle = "rgba(70,25,0,0.95)"; C.lineWidth = 3; C.stroke(hole);
    // Soot along the top of the cut wall.
    C.save(); C.clip(hole); C.globalCompositeOperation = "multiply";
    C.fillStyle = "rgba(90,60,40,0.55)"; C.fill(path(poly, 0.045, 1.02)); C.restore();
    // The glowing inside, with dark pulp strands hanging across it; the wall around it glows less.
    C.fillStyle = "#ffd36a"; C.fill(inner);
    E.fillStyle = "#4a3418"; E.fill(hole);
    E.save(); E.clip(inner);
    E.fillStyle = "#ffffff"; E.fill(inner);
    for (let k = 0; k < 40; k++) {
      const x = bx + (r() - 0.5) * 520, y = by + (r() - 0.5) * 240, l = 10 + r() * 40;
      E.strokeStyle = `rgba(80,50,20,${0.25 + r() * 0.35})`; E.lineWidth = 1 + r() * 2;
      E.beginPath(); E.moveTo(x, y); E.quadraticCurveTo(x + (r() - 0.5) * 20, y + l / 2, x + (r() - 0.5) * 10, y + l); E.stroke();
    }
    E.restore();
    Hh.fillStyle = "#000"; Hh.fill(hole);
    Ro.fillStyle = "#f0f0f0"; Ro.fill(hole);
  }
  grain(C, W, H, 6, r);
  const fit = (c: HTMLCanvasElement) => shrinkCanvas(c, maxSide);
  return { map: texture(fit(col.c), true), normal: normalFrom(fit(hgt.c), 4), emissive: texture(fit(emi.c), true), rough: texture(fit(rough.c), false) };
}

/** Ribbed, slightly lopsided pumpkin with dimples at both poles. Ribs follow the texture's u. */
function pumpkinGeometry() {
  const geo = new THREE.SphereGeometry(R, 80, 48);
  const p = geo.attributes.position, uv = geo.attributes.uv;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const u = uv.getX(i), ny = v.y / R;
    const side = Math.sqrt(Math.max(0, 1 - ny * ny));
    // Rounded lobes between the grooves, a little uneven from rib to rib.
    const f = Math.abs(Math.sin(u * Math.PI * RIBS));
    const lobe = 1 - 0.11 * Math.pow(1 - f, 2.2) + 0.025 * Math.sin(u * Math.PI * 2 * 3 + 1.3);
    // Pull the poles in to make the dimples where the stem and the base sit.
    const dimple = 0.24 * Math.exp(-((side / 0.32) ** 2));
    const y = v.y * SQ - Math.sign(ny) * dimple * R * 0.9;
    p.setXYZ(i, v.x * lobe, y + 0.04 * R * Math.sin(u * Math.PI * 2), v.z * lobe);
  }
  geo.computeVertexNormals();
  return geo;
}

function stemTexture() {
  const W = 128, H = 256;
  const { c, g } = canvas(W, H);
  const r = rng(93);
  const gr = g.createLinearGradient(0, H, 0, 0);
  gr.addColorStop(0, "#3d4a1c"); gr.addColorStop(0.5, "#6a6a34"); gr.addColorStop(1, "#8a7a50");
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // Fibres.
  for (let i = 0; i < 120; i++) {
    const x = r() * W;
    g.strokeStyle = r() < 0.5 ? `rgba(30,30,10,${0.3 + r() * 0.4})` : `rgba(200,190,140,${0.2 + r() * 0.3})`;
    g.lineWidth = 0.6 + r() * 1.4;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (r() - 0.5) * 10, H); g.stroke();
  }
  grain(g, W, H, 16, r);
  return { map: texture(c, true), normal: normalFrom(c, 3) };
}

export function makePumpkin(eyeColor: THREE.Color, keep: Keep, lite = false) {
  const mats: THREE.Material[] = [];
  const body = new THREE.Group();
  const tex = pumpkinTextures(lite);
  const st = stemTexture();
  const glowMap = glowTexture();
  // The pumpkin textures are shared by all pumpkins and kept for the session (not disposed here).
  for (const t of [st.map, st.normal, glowMap]) keep(t);

  // Waxy skin; the carved parts glow in the candle colour (yellow for you, cyan for your partner).
  const skin = keep(new THREE.MeshPhysicalMaterial({
    map: tex.map, normalMap: tex.normal, normalScale: new THREE.Vector2(1.2, 1.2), roughnessMap: tex.rough, roughness: 0.75,
    clearcoat: 0.35, clearcoatRoughness: 0.4, emissiveMap: tex.emissive, emissive: eyeColor.clone(), emissiveIntensity: 1.6, transparent: true,
  }));
  skin.userData.env = 0.2;
  mats.push(skin);
  const pumpkin = new THREE.Mesh(keep(pumpkinGeometry()), skin);
  // The lowest ring sits just above the bottom dimple.
  pumpkin.position.y = R * SQ * 0.95;
  body.add(pumpkin);
  const topY = pumpkin.position.y + R * SQ - 0.24 * R * 0.9;

  // Twisted, curved stem with ridges, flaring where it meets the pumpkin.
  const stemGeo = keep(new THREE.CylinderGeometry(0.2, 0.36, 1.25, 10, 8));
  {
    const sp = stemGeo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < sp.count; i++) {
      v.fromBufferAttribute(sp, i);
      const t = (v.y + 0.625) / 1.25; // 0 at the base, 1 at the cut end
      const a = Math.atan2(v.z, v.x) + t * 0.9; // twist
      const rad = Math.hypot(v.x, v.z) * (1 + 0.12 * Math.cos(a * 5)) * (1 + (1 - t) ** 4 * 0.6);
      sp.setXYZ(i, Math.cos(a) * rad + t * t * 0.35, v.y, Math.sin(a) * rad);
    }
    stemGeo.computeVertexNormals();
  }
  const stemMat = keep(new THREE.MeshStandardMaterial({ map: st.map, normalMap: st.normal, roughness: 0.85, transparent: true }));
  stemMat.userData.env = 0.08;
  mats.push(stemMat);
  const stem = new THREE.Mesh(stemGeo, stemMat);
  stem.position.set(0, topY + 0.5, 0);
  stem.rotation.z = -0.15;
  body.add(stem);
  // Dry, curled tendril.
  const curve = new THREE.CatmullRomCurve3(Array.from({ length: 24 }, (_, i) => {
    const t = i / 23, a = t * Math.PI * 5;
    return new THREE.Vector3(-0.2 - t * 0.9 + Math.cos(a) * 0.18 * t, 0.15 + Math.sin(a) * 0.18 * t + t * 0.2, Math.sin(a * 0.5) * 0.15);
  }));
  const vine = new THREE.Mesh(keep(new THREE.TubeGeometry(curve, 60, 0.035, 5)), stemMat);
  vine.position.set(0, topY + 0.1, 0);
  body.add(vine);

  // Candle glow spilling out of the face.
  const haloMat = keep(new THREE.MeshBasicMaterial({ map: glowMap, color: eyeColor, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const halo = new THREE.Mesh(keep(new THREE.PlaneGeometry(R * 2.2, R * 1.8)), haloMat);
  halo.position.set(0, pumpkin.position.y + 0.6, R * 1.0);
  body.add(halo);

  const update = (t: number) => {
    // Candle flicker.
    const f = 0.8 + 0.2 * Math.sin(t * 11) * Math.sin(t * 4.3 + 1) + 0.05 * Math.sin(t * 23);
    skin.emissiveIntensity = 1.3 + 0.7 * f;
    haloMat.opacity = 0.18 + 0.14 * f;
  };
  return { body, mats, update };
}
