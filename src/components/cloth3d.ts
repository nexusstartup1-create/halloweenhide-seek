"use client";
// Cloth simulation for the hunter's tunic: a tube of particles (Verlet integration) hanging from a ring
// pinned to the shoulders, held together by stretch, shear and bend constraints, pushed out of the
// body by capsule colliders (torso, legs, arms). Positions live in the character's own frame; when the
// character moves or turns on the map, the cloth keeps its world position for that frame, so it lags,
// swings and settles like real fabric.
import * as THREE from "three";

export interface Capsule { a: THREE.Vector3; b: THREE.Vector3; r: number }

interface Link { i: number; j: number; rest: number; k: number }

const GRAVITY = 45; // units/s² (the character is ~10 units tall: about 5 units per metre)
const DAMP = 0.985;
const ITER = 5;

export class Cloth {
  readonly mesh: THREE.Mesh;
  private pos: Float32Array;
  private prev: Float32Array;
  private links: Link[] = [];
  private pinned: Uint8Array;
  private rest: Float32Array;
  private geo: THREE.BufferGeometry;
  private ready = false;

  /**
   * `cols` particles round the ring, `rows` down to the hem.
   * `ring(row0)` gives the pinned top ring each frame; the cloth is laid out once from `layout`.
   */
  constructor(
    readonly cols: number,
    readonly rows: number,
    private layout: (c: number, r: number) => THREE.Vector3,
    material: THREE.Material,
    hemRagged = 0.25,
  ) {
    const n = cols * rows;
    this.pos = new Float32Array(n * 3);
    this.prev = new Float32Array(n * 3);
    this.pinned = new Uint8Array(n);
    this.rest = new Float32Array(n * 3);
    for (let c = 0; c < cols; c++) this.pinned[c] = 1;

    // Render mesh: one extra column so the texture wraps without a seam.
    const vc = (cols + 1) * rows;
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(vc * 3), 3));
    const uv = new Float32Array(vc * 2);
    for (let r = 0; r < rows; r++)
      for (let c = 0; c <= cols; c++) {
        const i = r * (cols + 1) + c;
        uv[i * 2] = c / cols;
        uv[i * 2 + 1] = 1 - r / (rows - 1);
      }
    this.geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    const idx: number[] = [];
    for (let r = 0; r < rows - 1; r++)
      for (let c = 0; c < cols; c++) {
        const a = r * (cols + 1) + c, b = a + 1, d = a + cols + 1, e = d + 1;
        idx.push(a, d, b, b, d, e);
      }
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
    this.reset();

    // Constraints, with rest lengths from the initial layout.
    const id = (c: number, r: number) => r * cols + ((c + cols) % cols);
    const add = (i: number, j: number, k: number, scale = 1) => {
      const dx = this.pos[i * 3] - this.pos[j * 3], dy = this.pos[i * 3 + 1] - this.pos[j * 3 + 1], dz = this.pos[i * 3 + 2] - this.pos[j * 3 + 2];
      this.links.push({ i, j, rest: Math.hypot(dx, dy, dz) * scale, k });
    };
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        add(id(c, r), id(c + 1, r), 1); // around
        if (r + 1 < rows) {
          // down; the last row is a little shorter or longer per column: a ragged hem
          add(id(c, r), id(c, r + 1), 1, r + 1 === rows - 1 ? 1 - hemRagged * rnd() : 1);
          add(id(c, r), id(c + 1, r + 1), 0.5); // shear
          add(id(c + 1, r), id(c, r + 1), 0.5);
        }
        if (r + 2 < rows) add(id(c, r), id(c, r + 2), 0.25); // bend
        add(id(c, r), id(c + 2, r), 0.25);
      }
  }

  /** Lays the cloth out again in its rest shape (first frame, or after a teleport). */
  reset() {
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++) {
        const p = this.layout(c, r), i = (r * this.cols + c) * 3;
        this.pos[i] = this.prev[i] = this.rest[i] = p.x;
        this.pos[i + 1] = this.prev[i + 1] = this.rest[i + 1] = p.y;
        this.pos[i + 2] = this.prev[i + 2] = this.rest[i + 2] = p.z;
      }
    this.ready = false;
  }

  /**
   * One frame. `ring` are the pinned top positions this frame; `frame` moves every particle by the
   * character's own motion since last frame (so the cloth keeps its place in the world and lags behind).
   */
  step(dt: number, ring: THREE.Vector3[], colliders: Capsule[], frame: THREE.Matrix4 | null, wind: THREE.Vector3, axis: { x: number; z: number }, restPull = 0.03) {
    const P = this.pos, Q = this.prev, n = this.cols * this.rows;
    if (frame) {
      const v = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        if (this.pinned[i]) continue;
        v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).applyMatrix4(frame);
        P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z;
        v.set(Q[i * 3], Q[i * 3 + 1], Q[i * 3 + 2]).applyMatrix4(frame);
        Q[i * 3] = v.x; Q[i * 3 + 1] = v.y; Q[i * 3 + 2] = v.z;
      }
    }
    const sub = 2, h = Math.min(dt, 1 / 30) / sub;
    for (let s = 0; s < sub; s++) {
      // Verlet: move by last velocity, plus gravity and a little wind.
      for (let i = 0; i < n; i++) {
        if (this.pinned[i]) continue;
        const o = i * 3;
        for (let k = 0; k < 3; k++) {
          const cur = P[o + k];
          const acc = k === 1 ? -GRAVITY : 0;
          P[o + k] = cur + (cur - Q[o + k]) * DAMP + (acc + wind.getComponent(k)) * h * h;
          Q[o + k] = cur;
        }
      }
      // Pinned ring follows the shoulders.
      for (let c = 0; c < this.cols; c++) {
        const p = ring[c], o = c * 3;
        P[o] = Q[o] = p.x; P[o + 1] = Q[o + 1] = p.y; P[o + 2] = Q[o + 2] = p.z;
      }
      // A gentle pull back towards the rest drape: the cloth swings and lags, but never stays twisted
      // round the body after a sharp turn.
      for (let i = 0; i < n; i++) {
        if (this.pinned[i]) continue;
        const o = i * 3;
        P[o] += (this.rest[o] - P[o]) * restPull;
        P[o + 1] += (this.rest[o + 1] - P[o + 1]) * restPull * 0.3;
        P[o + 2] += (this.rest[o + 2] - P[o + 2]) * restPull;
      }
      for (let it = 0; it < ITER; it++) {
        for (const l of this.links) {
          const a = l.i * 3, b = l.j * 3;
          const dx = P[b] - P[a], dy = P[b + 1] - P[a + 1], dz = P[b + 2] - P[a + 2];
          const d = Math.hypot(dx, dy, dz) || 1e-6;
          // Cloth stretches a little, resists more when pulled long than when bunched up.
          const diff = ((d - l.rest) / d) * l.k * (d > l.rest ? 0.5 : 0.25);
          const wa = this.pinned[l.i] ? 0 : this.pinned[l.j] ? 2 : 1;
          const wb = this.pinned[l.j] ? 0 : this.pinned[l.i] ? 2 : 1;
          P[a] += dx * diff * wa; P[a + 1] += dy * diff * wa; P[a + 2] += dz * diff * wa;
          P[b] -= dx * diff * wb; P[b + 1] -= dy * diff * wb; P[b + 2] -= dz * diff * wb;
        }
        this.collide(colliders, axis);
      }
    }
    this.ready = true;
    this.sync();
  }

  /**
   * Pushes particles out of the body. A particle deep inside a limb (a fast-swinging leg went through it)
   * is pushed outwards from the body's vertical axis, never out of the far side: no cloth tunnelling
   * from the front of the legs to the back.
   */
  private collide(colliders: Capsule[], axis: { x: number; z: number }) {
    const P = this.pos, n = this.cols * this.rows;
    const ab = new THREE.Vector3(), ap = new THREE.Vector3(), q = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      if (this.pinned[i]) continue;
      p.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
      for (const c of colliders) {
        ab.subVectors(c.b, c.a);
        const t = Math.max(0, Math.min(1, ap.subVectors(p, c.a).dot(ab) / (ab.lengthSq() || 1)));
        q.copy(c.a).addScaledVector(ab, t);
        const d = p.distanceTo(q);
        if (d >= c.r) continue;
        const out = p.clone().sub(q);
        const fromAxis = new THREE.Vector3(p.x - axis.x, 0, p.z - axis.z);
        if (d < c.r * 0.6 || out.dot(fromAxis) < 0) {
          // Deep inside, or about to exit on the inner side: go out the way that leads away from the body.
          if (fromAxis.lengthSq() < 1e-6) fromAxis.set(0, 0, 1);
          fromAxis.normalize();
          const along = new THREE.Vector3(q.x - axis.x, 0, q.z - axis.z).dot(fromAxis);
          p.set(axis.x + fromAxis.x * (Math.max(0, along) + c.r), p.y, axis.z + fromAxis.z * (Math.max(0, along) + c.r));
        } else {
          p.copy(q).addScaledVector(out, c.r / (d || 1e-6));
        }
      }
      // Never through the ground.
      if (p.y < 0.05) p.y = 0.05;
      P[i * 3] = p.x; P[i * 3 + 1] = p.y; P[i * 3 + 2] = p.z;
    }
  }

  private sync() {
    const out = this.geo.attributes.position as THREE.BufferAttribute;
    const P = this.pos;
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c <= this.cols; c++) {
        const src = (r * this.cols + (c % this.cols)) * 3;
        out.setXYZ(r * (this.cols + 1) + c, P[src], P[src + 1], P[src + 2]);
      }
    out.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
  }

  get isReady() { return this.ready; }

  dispose() {
    this.geo.dispose();
  }
}
