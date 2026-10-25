"use client";
// 3D layer on the MapLibre map, drawn with three.js:
// - missions: a light beam, a floating spinning gem and pulse rings that show the 40 m area;
// - people: a little character for your role (jack-o'-lantern, Jason, ghost)
//   that glides between GPS fixes and turns where you walk; your partner gets a cyan beam and a
//   dashed line to you, and fades when their position gets old;
// - fugitive zones (hunters): a "heat" disc that cools from red to blue as the fix gets old.
// Positions are in metres from an origin at the centre of the zone (x east, y up, z south).
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { makeHunter } from "./hunter3d";
import { makePumpkin } from "./pumpkin3d";
import type { CustomLayerInterface, Map as MLMap, MercatorCoordinate as MC } from "maplibre-gl";

export type Look = "fugitive" | "hunter" | "ghost";
export interface Quest3D { id: string; lat: number; lng: number; radiusM: number; done: boolean; flash: boolean; reward: "ZOMBIE" | "GHOST_SHIELD" | "ECO" | null; abandoned: boolean }
/** `acc`: GPS accuracy in metres (you only). `fixAt`: when the position was taken, ms (partner only). */
export interface Person3D { id: string; lat: number; lng: number; kind: "me" | "partner"; look: Look; acc?: number; fixAt?: number }

/** A partner position older than this is drawn faded. */
const STALE_S = 120;
/** Characters keep roughly this height on screen, in CSS pixels, whatever the zoom. */
const PERSON_PX = 52;
const PERSON_M = 7;
export interface Zone3D { lat: number; lng: number; radiusM: number; ageS: number }

const COLORS = {
  quest: new THREE.Color("#ff6a00"),
  flash: new THREE.Color("#ff2848"),
  zombie: new THREE.Color("#6dff7a"),
  reward: new THREE.Color("#b48cff"),
  abandoned: new THREE.Color("#c9b8ff"),
  done: new THREE.Color("#5a5a62"),
  me: new THREE.Color("#ffffff"),
  partner: new THREE.Color("#3ee0ff"),
  hunter: new THREE.Color("#ff3040"),
  ghost: new THREE.Color("#7dffb0"),
};

type Disposable = { dispose: () => void };

/** Ghost: a dome on a sheet, with a wavy hem. Open at the bottom. */
function ghostGeometry(r: number, h: number) {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(0.001, r * Math.sin(a)), h - r + r * Math.cos(a)));
  }
  for (let i = 1; i <= 6; i++) pts.push(new THREE.Vector2(r * (1 + 0.08 * i), h - r - ((h - r) * i) / 6));
  const geo = new THREE.LatheGeometry(pts, 36);
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    if (v.y < 0.01) p.setY(i, Math.sin(Math.atan2(v.z, v.x) * 6) * r * 0.22);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Flat shape on the front of a character (eyes, mouth). Faces +z. */
function face(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

/** Animated dashes along a strip, flowing from start to end. */
function dashMaterial(color: THREE.Color) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: color.clone() }, uTime: { value: 0 }, uLen: { value: 1 }, uAlpha: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uTime; uniform float uLen; uniform float uAlpha; varying vec2 vUv;
      void main() {
        float dash = step(0.45, fract(vUv.x * uLen / 9.0 - uTime * 0.8));
        float ends = smoothstep(0.0, 0.08, vUv.x) * (1.0 - smoothstep(0.92, 1.0, vUv.x));
        float core = 1.0 - abs(vUv.y - 0.5) * 2.0;
        gl_FragColor = vec4(uColor, dash * ends * core * 0.8 * uAlpha);
      }`,
  });
}

/** Shortest turn from angle a to b. */
function turn(a: number, b: number) {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

/** Additive light beam: bright at the bottom, fading upwards, with a slow shimmer. */
function beamMaterial(color: THREE.Color) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: color.clone() }, uTime: { value: 0 }, uPower: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uTime; uniform float uPower; varying vec2 vUv;
      void main() {
        float fade = pow(1.0 - vUv.y, 1.6);
        float edge = 1.0 - abs(vUv.x - 0.5) * 2.0;
        float shimmer = 0.75 + 0.25 * sin(vUv.y * 30.0 - uTime * 4.0);
        gl_FragColor = vec4(uColor, fade * edge * shimmer * 0.85 * uPower);
      }`,
  });
}

/** Ring that expands from the centre and fades out; `phase` staggers several rings. */
function ringMaterial(color: THREE.Color) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: color.clone() }, uProgress: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uProgress; varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float ring = smoothstep(uProgress - 0.12, uProgress, d) * (1.0 - smoothstep(uProgress, uProgress + 0.03, d));
        gl_FragColor = vec4(uColor, ring * (1.0 - uProgress) * 1.4);
      }`,
  });
}

/** Soft disc: fixed area of a mission, or a fugitive zone with heat noise. */
function discMaterial(color: THREE.Color, heat: boolean) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: color.clone() }, uTime: { value: 0 }, uAlpha: { value: 0.25 }, uHeat: { value: heat ? 1 : 0 } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uTime; uniform float uAlpha; uniform float uHeat; varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
      void main() {
        vec2 c = vUv - 0.5; float d = length(c) * 2.0;
        if (d > 1.0) discard;
        float body = (1.0 - d * d);
        float n = uHeat > 0.5 ? noise(c * 6.0 + vec2(uTime * 0.6, -uTime * 0.4)) : 0.5;
        float ripple = uHeat > 0.5 ? 0.5 + 0.5 * sin(d * 18.0 + uTime * 3.0) : 1.0;
        float edge = smoothstep(0.86, 0.98, d) * (1.0 - smoothstep(0.98, 1.0, d));
        float a = body * (0.55 + 0.6 * n) * mix(1.0, 0.7 + 0.3 * ripple, uHeat) + edge * 0.9;
        gl_FragColor = vec4(uColor, a * uAlpha);
      }`,
  });
}

/** `marker`: the part that keeps a readable size when zoomed out (areas and rings stay in real metres). */
interface Entity {
  group: THREE.Group; marker?: THREE.Object3D; update: (t: number) => void; dispose: () => void; key: string;
  /** People: new GPS fix (the character glides there instead of jumping). */
  place?: (p: Person3D, at: THREE.Vector3) => void;
}

export class Map3D {
  private map: MLMap;
  private ml: typeof import("maplibre-gl");
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private renderer: THREE.WebGLRenderer | null = null;
  private origin: MC;
  private scale: number;
  private transform: THREE.Matrix4;
  private quests = new Map<string, Entity>();
  private people = new Map<string, Entity>();
  private zones: Entity[] = [];
  private partnerId: string | null = null;
  private env: THREE.Texture | null = null;
  private partnerFixAt: number | undefined;
  private tether: { mesh: THREE.Mesh; mat: THREE.ShaderMaterial } | null = null;
  private start = performance.now();
  private still: boolean;
  private nextFrame: ReturnType<typeof setTimeout> | null = null;
  readonly layer: CustomLayerInterface;

  constructor(map: MLMap, ml: typeof import("maplibre-gl"), center: [number, number], readonly lite = false) {
    this.map = map;
    this.ml = ml;
    this.still = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.origin = ml.MercatorCoordinate.fromLngLat(center, 0);
    this.scale = this.origin.meterInMercatorCoordinateUnits();
    this.transform = new THREE.Matrix4()
      .makeTranslation(this.origin.x, this.origin.y, this.origin.z ?? 0)
      .scale(new THREE.Vector3(this.scale, -this.scale, this.scale))
      .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(30, 80, 40);
    this.scene.add(sun);

    this.layer = {
      id: "fx3d",
      type: "custom",
      renderingMode: "3d",
      onAdd: (_map, gl) => {
        this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
        this.renderer.autoClear = false;
      },
      render: (_gl, args) => {
        if (!this.renderer) return;
        const t = this.still ? 0 : (performance.now() - this.start) / 1000;
        // Markers are in real metres; zoomed out they'd be specks, so they grow to keep a readable size.
        const k = Math.max(1, Math.pow(2, (16 - this.map.getZoom()) * 0.8));
        for (const e of this.quests.values()) { e.update(t); e.marker?.scale.setScalar(k); }
        // Characters keep about PERSON_PX on screen (512 px tiles: metres per pixel at this zoom).
        const mpp = (78271.517 * Math.cos((this.map.getCenter().lat * Math.PI) / 180)) / Math.pow(2, this.map.getZoom());
        const kp = Math.max(1, (PERSON_PX * mpp) / PERSON_M);
        for (const e of this.people.values()) { e.update(t); e.marker?.scale.setScalar(kp); }
        for (const e of this.zones) e.update(t);
        this.updateTether(t, kp);
        const m = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]);
        this.camera.projectionMatrix = m.multiply(this.transform);
        this.renderer.resetState();
        if (!this.env && !this.lite) {
          // Soft studio light for reflections on the hunter's mask and skin. Made once, here
          // (not in onAdd) because it renders offscreen and the map resets its GL state after this hook.
          const pm = new THREE.PMREMGenerator(this.renderer);
          this.env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
          pm.dispose();
          this.applyEnv(this.scene);
          this.renderer.resetState();
        }
        this.renderer.render(this.scene, this.camera);
        // Animate at a capped frame rate (lighter on battery and graphics memory than every frame).
        if (!this.still && !this.nextFrame) {
          this.nextFrame = setTimeout(() => { this.nextFrame = null; this.map.triggerRepaint(); }, this.lite ? 50 : 28);
        }
      },
      onRemove: () => this.dispose(),
    };
  }

  /** Gives the environment reflections to the materials that asked for them (userData.env = strength). */
  private applyEnv(root: THREE.Object3D) {
    const env = this.env;
    if (!env) return;
    root.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (!mat || typeof mat.userData?.env !== "number" || mat.envMap === env) return;
      mat.envMap = env;
      mat.envMapIntensity = mat.userData.env;
      mat.needsUpdate = true;
    });
  }

  /** lat/lng -> local metres (x east, z south). */
  private local(lat: number, lng: number) {
    const mc = this.ml.MercatorCoordinate.fromLngLat([lng, lat], 0);
    return new THREE.Vector3((mc.x - this.origin.x) / this.scale, 0, (mc.y - this.origin.y) / this.scale);
  }

  private flat(geo: THREE.BufferGeometry, mat: THREE.Material, y = 0.4) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    mesh.renderOrder = 1;
    return mesh;
  }

  private questEntity(q: Quest3D): Entity {
    const color = q.done ? COLORS.done : q.flash ? COLORS.flash : q.reward === "ZOMBIE" ? COLORS.zombie : q.reward ? COLORS.reward : q.abandoned ? COLORS.abandoned : COLORS.quest;
    const g = new THREE.Group();
    g.position.copy(this.local(q.lat, q.lng));
    const disposables: { dispose: () => void }[] = [];
    const keep = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x);

    // The 40 m area where the proof counts.
    const area = keep(discMaterial(color, false));
    area.uniforms.uAlpha.value = q.done ? 0.06 : 0.12;
    g.add(this.flat(keep(new THREE.PlaneGeometry(q.radiusM * 2, q.radiusM * 2)), area, 0.3));

    // Floating gem (pumpkin-orange octahedron with a lit wireframe).
    const gemSize = q.done ? 3 : 6;
    const gem = new THREE.Mesh(
      keep(new THREE.OctahedronGeometry(gemSize, 0)),
      keep(new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: q.done ? 0.2 : 0.9, metalness: 0.3, roughness: 0.35, transparent: true, opacity: q.done ? 0.6 : 0.95 })),
    );
    const wire = new THREE.LineSegments(keep(new THREE.EdgesGeometry(gem.geometry)), keep(new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: q.done ? 0.2 : 0.7 })));
    gem.add(wire);
    gem.position.y = q.done ? 6 : 16;
    const marker = new THREE.Group();
    marker.add(gem);
    g.add(marker);

    const rings: THREE.ShaderMaterial[] = [];
    let beam: THREE.ShaderMaterial | null = null;
    if (!q.done) {
      beam = keep(beamMaterial(color));
      const beamMesh = new THREE.Mesh(keep(new THREE.CylinderGeometry(2.2, 3.2, 90, 16, 1, true)), beam);
      beamMesh.position.y = 45;
      marker.add(beamMesh);
      for (let i = 0; i < 3; i++) {
        const r = keep(ringMaterial(color));
        rings.push(r);
        g.add(this.flat(keep(new THREE.PlaneGeometry(q.radiusM * 2.2, q.radiusM * 2.2)), r, 0.5 + i * 0.05));
      }
    }
    const speed = q.flash ? 1.8 : 1;
    const seed = (q.lat * 1000 + q.lng * 1000) % 7;
    return {
      key: `${q.done}|${q.flash}|${q.reward}|${q.abandoned}|${q.radiusM}`,
      group: g,
      marker,
      update: (t) => {
        const tt = t * speed + seed;
        gem.rotation.y = tt * 1.2;
        gem.position.y = (q.done ? 6 : 16) + Math.sin(tt * 1.6) * (q.done ? 0.5 : 1.8);
        if (beam) {
          beam.uniforms.uTime.value = tt;
          beam.uniforms.uPower.value = q.flash ? 0.75 + 0.25 * Math.sin(tt * 8) : 1;
        }
        rings.forEach((r, i) => (r.uniforms.uProgress.value = (tt * 0.45 + i / rings.length) % 1));
      },
      dispose: () => disposables.forEach((d) => d.dispose()),
    };
  }

  /** The little character for a role, facing +z, standing on y = 0. `mats` fade when the fix is old. */
  private character(look: Look, eyeColor: THREE.Color, keep: <T extends Disposable>(x: T) => T) {
    const body = new THREE.Group();
    const mats: THREE.Material[] = [];
    const std = (o: THREE.MeshStandardMaterialParameters) => {
      const m = keep(new THREE.MeshStandardMaterial({ transparent: true, ...o }));
      mats.push(m);
      return m;
    };
    let update: (t: number, walking: boolean) => void = () => {};
    let fx: THREE.Object3D | null = null;

    if (look === "fugitive") {
      // Carved jack-o'-lantern lit from inside (pumpkin3d.ts).
      const pk = makePumpkin(eyeColor, keep, this.lite);
      body.add(pk.body);
      mats.push(...pk.mats);
      update = pk.update;
    } else if (look === "hunter") {
      const h = makeHunter(keep, this.lite);
      body.add(h.body);
      mats.push(...h.mats);
      update = h.update;
      fx = h.fx;
    } else {
      // Floating sheet ghost.
      const r = 2.2, h = 5.5;
      const sheet = new THREE.Mesh(keep(ghostGeometry(r, h)), std({ color: "#eafff2", emissive: COLORS.ghost, emissiveIntensity: 0.45, roughness: 0.4, opacity: 0.85, side: THREE.DoubleSide }));
      const dark = keep(new THREE.MeshBasicMaterial({ color: "#0d1016", side: THREE.DoubleSide }));
      const eye = keep(new THREE.CircleGeometry(0.4, 16));
      const eyeL = face(eye, dark, -0.75, h - r * 0.8, 2.12);
      const eyeR = face(eye, dark, 0.75, h - r * 0.8, 2.12);
      eyeL.scale.y = eyeR.scale.y = 1.5;
      const mouth = face(keep(new THREE.CircleGeometry(0.32, 16)), dark, 0, h - r * 1.35, 2.5);
      const ghost = new THREE.Group();
      ghost.add(sheet, eyeL, eyeR, mouth);
      body.add(ghost);
      update = (t) => {
        ghost.position.y = 1.2 + Math.sin(t * 2.1) * 0.6;
        ghost.rotation.z = Math.sin(t * 1.4) * 0.08;
      };
    }
    return { body, mats, update, fx };
  }

  private personEntity(p: Person3D): Entity {
    const me = p.kind === "me";
    const color = !me ? COLORS.partner : p.look === "hunter" ? COLORS.hunter : p.look === "ghost" ? COLORS.ghost : COLORS.me;
    const g = new THREE.Group();
    g.position.copy(this.local(p.lat, p.lng));
    const disposables: Disposable[] = [];
    const keep = <T extends Disposable>(x: T) => (disposables.push(x), x);

    const marker = new THREE.Group();
    const facing = new THREE.Group();
    marker.add(facing);
    g.add(marker);

    // Character. The partner's lantern burns cyan so you tell them apart at a glance.
    const eyeColor = p.look === "hunter" ? new THREE.Color("#ff1a2a") : me ? new THREE.Color("#ffd23a") : COLORS.partner;
    const ch = this.character(p.look, eyeColor, keep);
    facing.add(ch.body);
    if (ch.fx) this.applyEnv(ch.fx);
    this.applyEnv(ch.body);
    // Effects that must not turn with the character (they face the camera).
    if (ch.fx) marker.add(ch.fx);

    // Pool of light under the feet, scaled with the character. Hunters get a shadow instead.
    const hunter = p.look === "hunter";
    const pool = keep(discMaterial(color, false));
    pool.uniforms.uAlpha.value = 0.5;
    if (!hunter) marker.add(this.flat(keep(new THREE.PlaneGeometry(13, 13)), pool, 0.6));

    // Walking direction: a chevron in front (white for the hunter). Hidden until you've moved.
    const ahead = new THREE.Group();
    {
      const s = new THREE.Shape();
      s.moveTo(0, 1.8); s.lineTo(1.6, -0.7); s.lineTo(0, 0.1); s.lineTo(-1.6, -0.7); s.closePath();
      const chev = new THREE.Mesh(keep(new THREE.ShapeGeometry(s)), keep(new THREE.MeshBasicMaterial({ color: hunter ? COLORS.me : color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
      chev.rotation.x = Math.PI / 2;
      chev.position.set(0, 0.7, hunter ? 7.5 : 6.2);
      ahead.add(chev);
    }
    ahead.visible = false;
    facing.add(ahead);

    // Sonar rings, and for you the GPS accuracy (how sure the phone is of where you are).
    const sonar = [keep(ringMaterial(color)), keep(ringMaterial(color))];
    if (!hunter) sonar.forEach((m, i) => g.add(this.flat(keep(new THREE.PlaneGeometry(60, 60)), m, 0.7 + i * 0.05)));
    let accDisc: THREE.Mesh | null = null;
    if (me) {
      const acc = keep(discMaterial(COLORS.me, false));
      acc.uniforms.uAlpha.value = 0.07;
      accDisc = this.flat(keep(new THREE.PlaneGeometry(2, 2)), acc, 0.25);
      g.add(accDisc);
    }

    let beam: THREE.ShaderMaterial | null = null;
    if (!me) {
      beam = keep(beamMaterial(color));
      const b = new THREE.Mesh(keep(new THREE.CylinderGeometry(1.4, 2.2, 60, 12, 1, true)), beam);
      b.position.y = 30;
      marker.add(b);
    }

    // Hunters leave bloody footprints that fade after ~25 s.
    const prints: { m: THREE.Mesh; mat: THREE.MeshBasicMaterial; age: number }[] = [];
    if (p.look === "hunter") {
      const sole = new THREE.Shape();
      sole.absellipse(0, 0.22, 0.22, 0.36, 0, Math.PI * 2, false, 0);
      const heel = new THREE.Shape();
      heel.absellipse(0, -0.4, 0.17, 0.16, 0, Math.PI * 2, false, 0);
      const geo = keep(new THREE.ShapeGeometry([sole, heel]));
      for (let i = 0; i < 18; i++) {
        const mat = keep(new THREE.MeshBasicMaterial({ color: "#5a0008", transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
        const m = this.flat(geo, mat, 0.35);
        m.rotation.order = "YXZ";
        m.visible = false;
        this.scene.add(m);
        prints.push({ m, mat, age: 99 });
      }
    }
    let stepAt = 0, stepSide = 1, nextPrint = 0;

    const target = g.position.clone();
    let heading = 0;
    let fixAt = p.fixAt;
    let lastT = -1;
    const baseOpacity = ch.mats.map((m) => m.opacity);
    const place = (q: Person3D, at: THREE.Vector3) => {
      const d = at.clone().sub(target);
      if (d.lengthSq() > 9) {
        heading = Math.atan2(d.x, d.z);
        ahead.visible = true;
      }
      target.copy(at);
      fixAt = q.fixAt;
      if (accDisc) {
        accDisc.scale.setScalar(Math.min(150, Math.max(5, q.acc ?? 0)));
        accDisc.visible = (q.acc ?? 0) > 12;
      }
    };
    place(p, target);

    return {
      key: `${p.kind}|${p.look}`,
      group: g,
      marker,
      place,
      update: (t) => {
        const dt = lastT < 0 ? 0 : Math.min(0.25, t - lastT);
        lastT = t;
        // Glide to the new fix (or jump if it's far, e.g. the first fix after a long gap).
        if (this.still || g.position.distanceTo(target) > 400) g.position.copy(target);
        else g.position.lerp(target, 1 - Math.exp(-dt * 2.2));
        const walking = g.position.distanceTo(target) > 0.6;
        if (prints.length && dt > 0) {
          if (walking && t > stepAt) {
            stepAt = t + 0.45;
            stepSide = -stepSide;
            const k = marker.scale.x;
            const pr = prints[nextPrint];
            nextPrint = (nextPrint + 1) % prints.length;
            const h = facing.rotation.y;
            pr.m.position.set(g.position.x + Math.cos(h) * 0.5 * k * stepSide, 0.35, g.position.z - Math.sin(h) * 0.5 * k * stepSide);
            pr.m.rotation.y = h + Math.PI;
            pr.m.scale.setScalar(Math.min(3, k));
            pr.m.visible = true;
            pr.age = 0;
          }
          for (const pr of prints) {
            if (!pr.m.visible) continue;
            pr.age += dt;
            pr.mat.opacity = Math.max(0, 0.8 * (1 - pr.age / 25));
            if (pr.age > 25) pr.m.visible = false;
          }
        }
        facing.rotation.y = this.still ? heading : facing.rotation.y + turn(facing.rotation.y, heading) * Math.min(1, dt * 6);
        ch.body.position.y = walking ? Math.abs(Math.sin(t * (p.look === "hunter" ? 6 : 9))) * (p.look === "hunter" ? 0.2 : 0.7) : 0;
        ch.update(t, walking);
        // Parts loaded later (the Jason model) get their reflections once the environment exists.
        if (ch.body.userData.envDirty && this.env) {
          this.applyEnv(ch.body);
          ch.body.userData.envDirty = false;
        }

        // An old partner fix: faded, no beam, no sonar.
        const old = !me && fixAt != null && (Date.now() - fixAt) / 1000 > STALE_S;
        const f = old ? 0.3 : 1;
        ch.mats.forEach((m, i) => (m.opacity = baseOpacity[i] * f));
        pool.uniforms.uAlpha.value = 0.5 * f;
        sonar.forEach((m, i) => (m.uniforms.uProgress.value = old ? 1 : (t * 0.5 + i * 0.5) % 1));
        if (beam) {
          beam.uniforms.uTime.value = t;
          beam.uniforms.uPower.value = old ? 0.15 : 1;
        }
      },
      dispose: () => {
        for (const pr of prints) this.scene.remove(pr.m);
        disposables.forEach((d) => d.dispose());
      },
    };
  }

  private zoneEntity(z: Zone3D): Entity {
    // Fresh fix: red-hot. Cooling through orange to a faint blue after ~3 minutes.
    const k = Math.min(1, Math.max(0, z.ageS / 180));
    const color = new THREE.Color("#ff2030").lerp(new THREE.Color("#ff8a1f"), Math.min(1, k * 2)).lerp(new THREE.Color("#3a6bff"), Math.max(0, k * 2 - 1));
    const g = new THREE.Group();
    g.position.copy(this.local(z.lat, z.lng));
    const mat = discMaterial(color, true);
    mat.uniforms.uAlpha.value = 0.55 - k * 0.3;
    const geo = new THREE.PlaneGeometry(z.radiusM * 2, z.radiusM * 2);
    g.add(this.flat(geo, mat, 0.2));
    return { key: "", group: g, update: (t) => (mat.uniforms.uTime.value = t), dispose: () => { geo.dispose(); mat.dispose(); } };
  }

  private sync<T extends { id: string; lat: number; lng: number }>(store: Map<string, Entity>, items: T[], make: (x: T) => Entity, keyOf: (x: T) => string) {
    const seen = new Set<string>();
    for (const it of items) {
      seen.add(it.id);
      const cur = store.get(it.id);
      if (cur && cur.key === keyOf(it)) {
        // Same look: just move it (keeps the animation phase; people glide there).
        const at = this.local(it.lat, it.lng);
        if (cur.place) cur.place(it as unknown as Person3D, at);
        else cur.group.position.copy(at);
        continue;
      }
      if (cur) { this.scene.remove(cur.group); cur.dispose(); }
      const e = make(it);
      store.set(it.id, e);
      this.scene.add(e.group);
    }
    for (const [id, e] of store) if (!seen.has(id)) { this.scene.remove(e.group); e.dispose(); store.delete(id); }
  }

  setQuests(list: Quest3D[]) {
    this.sync(this.quests, list, (q) => this.questEntity(q), (q) => `${q.done}|${q.flash}|${q.reward}|${q.abandoned}|${q.radiusM}`);
    this.map.triggerRepaint();
  }

  setPeople(list: Person3D[]) {
    this.sync(this.people, list, (p) => this.personEntity(p), (p) => `${p.kind}|${p.look}`);
    this.partnerId = list.find((p) => p.kind === "partner")?.id ?? null;
    this.partnerFixAt = list.find((p) => p.kind === "partner")?.fixAt;
    this.map.triggerRepaint();
  }

  /** Dashed cyan line from you to your partner, flowing towards them. */
  private updateTether(t: number, k: number) {
    const me = this.people.get("me");
    const mate = this.partnerId ? this.people.get(this.partnerId) : undefined;
    const len = me && mate ? me.group.position.distanceTo(mate.group.position) : 0;
    if (!me || !mate || len < 20) {
      if (this.tether) this.tether.mesh.visible = false;
      return;
    }
    if (!this.tether) {
      const mat = dashMaterial(COLORS.partner);
      const mesh = this.flat(new THREE.PlaneGeometry(1, 1), mat, 0.55);
      mesh.rotation.order = "YXZ";
      this.scene.add(mesh);
      this.tether = { mesh, mat };
    }
    const { mesh, mat } = this.tether;
    const a = me.group.position, b = mate.group.position;
    mesh.visible = true;
    mesh.position.set((a.x + b.x) / 2, 0.55, (a.z + b.z) / 2);
    mesh.rotation.y = Math.atan2(-(b.z - a.z), b.x - a.x);
    mesh.scale.set(len, Math.min(8, 2.2 * k), 1);
    mat.uniforms.uTime.value = t;
    mat.uniforms.uLen.value = len;
    const old = this.partnerFixAt != null && (Date.now() - this.partnerFixAt) / 1000 > STALE_S;
    mat.uniforms.uAlpha.value = old ? 0.3 : 1;
  }

  setZones(list: Zone3D[]) {
    for (const e of this.zones) { this.scene.remove(e.group); e.dispose(); }
    this.zones = list.map((z) => this.zoneEntity(z));
    for (const e of this.zones) this.scene.add(e.group);
    this.map.triggerRepaint();
  }

  dispose() {
    if (this.nextFrame) clearTimeout(this.nextFrame);
    for (const e of [...this.quests.values(), ...this.people.values(), ...this.zones]) e.dispose();
    this.quests.clear();
    this.people.clear();
    this.zones = [];
    if (this.tether) { this.tether.mesh.geometry.dispose(); this.tether.mat.dispose(); this.tether = null; }
    this.env?.dispose();
    this.env = null;
    this.renderer?.dispose();
    this.renderer = null;
  }
}
