"use client";
// The hunter on the 3D map: Jason (a rigged glTF model), bare-handed, animated on its bones.
// While the model downloads (once per session) a dark silhouette stands in.
// Facing +z, standing on y = 0.
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { Cloth, type Capsule } from "./cloth3d";
import { glowTexture, tunicTextures } from "./hunterTextures";
import { dressModel, makeHood, makeMachete, makeMask } from "./hunterLook";

type Disposable = { dispose: () => void };
type Keep = <T extends Disposable>(x: T) => T;

/**
 * Glowing particles (embers, breath): small planes tilted towards the map camera, which always looks
 * north from the south at about 40°. They live in a group that turns with the map, not with the
 * character, so they keep facing the camera.
 */
class Sparks {
  readonly group = new THREE.Group();
  private items: { m: THREE.Mesh; mat: THREE.MeshBasicMaterial; v: THREE.Vector3; life: number; max: number; grow: number }[] = [];
  private next = 0;
  constructor(n: number, tint: THREE.Color, map: THREE.Texture, private sizeM: number, keep: Keep) {
    const geo = keep(new THREE.PlaneGeometry(1, 1));
    for (let i = 0; i < n; i++) {
      const mat = keep(new THREE.MeshBasicMaterial({ map, color: tint, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -0.87;
      m.visible = false;
      this.group.add(m);
      this.items.push({ m, mat, v: new THREE.Vector3(), life: 0, max: 1, grow: 0 });
    }
  }
  emit(at: THREE.Vector3, v: [number, number, number], life: number, grow = 0) {
    const it = this.items[this.next];
    this.next = (this.next + 1) % this.items.length;
    it.m.position.copy(at);
    it.v.set(...v);
    it.life = it.max = life;
    it.grow = grow;
    it.m.visible = true;
  }
  step(dt: number, drag = 0) {
    for (const it of this.items) {
      if (!it.m.visible) continue;
      it.life -= dt;
      if (it.life <= 0) { it.m.visible = false; continue; }
      it.v.multiplyScalar(1 - drag * dt);
      it.m.position.addScaledVector(it.v, dt);
      const f = it.life / it.max;
      it.mat.opacity = f * Math.min(1, (1 - f) * 6);
      it.m.scale.setScalar(this.sizeM * (1 + it.grow * (1 - f)));
    }
  }
}

/**
 * Jason model ("jason" by skull-GamerYT on Sketchfab, CC BY 4.0), compressed with meshopt and WebP
 * (public/models/jason.glb, ~2 MB). Loaded once and shared; until it arrives a silhouette stands in.
 */
let jasonModel: Promise<GLTF> | null = null;
function loadJason(lite: boolean) {
  // Light mode: the same model with 1024 px textures instead of 2048 (a quarter of the graphics memory).
  jasonModel ??= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(lite ? "/models/jason-lite.glb" : "/models/jason.glb");
  return jasonModel;
}

/** Skeleton bones the animation drives (Unreal-style rig in the model). */
const BONES = {
  pelvis: "pelvis_02", spine1: "spine_01_03", spine2: "spine_02_04", spine3: "spine_03_05", neck: "neck_01_050", head: "head_052",
  upperL: "upperarm_l_07", lowerL: "lowerarm_l_08", handL: "hand_l_09", upperR: "upperarm_r_029", lowerR: "lowerarm_r_030", handR: "hand_r_031",
  thighL: "thigh_l_053", calfL: "calf_l_054", footL: "foot_l_056", thighR: "thigh_r_00", calfR: "calf_r_060", footR: "foot_r_062",
} as const;
type BoneKey = keyof typeof BONES;
/** Height of the model in metres before the map's zoom scaling (other characters are about 7). */
const MODEL_H = 10.3;
type Axis = "x" | "y" | "z";

export function makeHunter(keep: Keep, lite = false) {
  const mats: THREE.Material[] = [];
  const glowMap = keep(glowTexture());
  const body = new THREE.Group();

  // Stand-in while the model loads: a dark, faceless silhouette of the same size.
  const figure = new THREE.Group();
  const shade = keep(new THREE.MeshStandardMaterial({ color: "#1b1c1a", roughness: 0.9, transparent: true, opacity: 0.85 }));
  mats.push(shade);
  const trunk = new THREE.Mesh(keep(new THREE.CapsuleGeometry(1.15, MODEL_H - 4.2, 6, 16)), shade);
  trunk.position.y = (MODEL_H - 4.2) / 2 + 1.15 + 0.2;
  trunk.scale.z = 0.7;
  const skull = new THREE.Mesh(keep(new THREE.SphereGeometry(0.7, 20, 14)), shade);
  skull.position.y = MODEL_H - 0.8;
  figure.add(trunk, skull);
  body.add(figure);
  const face = new THREE.Object3D();
  const mouth = new THREE.Object3D();
  mouth.position.set(0, MODEL_H - 0.65, 0.5);
  figure.add(face, mouth);

  // Shadow on the ground.
  const shadow = new THREE.Mesh(keep(new THREE.CircleGeometry(2.7, 28)), keep(new THREE.MeshBasicMaterial({ map: glowMap, color: "#000", transparent: true, opacity: 0.85, depthWrite: false })));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.15;
  body.add(shadow);

  // Breath fogging out of the mask.
  const breath = new Sparks(12, new THREE.Color("#22252a"), glowMap, 0.55, keep);
  let lastT = -1, breathAt = 0;
  const v = new THREE.Vector3();
  // Particles are added by map3d to a group that doesn't turn with the character.
  const fx = new THREE.Group();
  fx.add(breath.group);
  const fxLocal = (o: THREE.Object3D) => fx.worldToLocal(o.getWorldPosition(v));

  // ---- the real model ----
  let aim: THREE.Object3D = face;
  let skel: { bones: Record<BoneKey, THREE.Bone>; rest: Record<BoneKey, THREE.Quaternion>; axes: Record<BoneKey, Record<Axis, THREE.Vector3>>; side: { L: number; R: number; dropL: number; dropR: number } } | null = null;
  let gone = false;
  keep({ dispose: () => { gone = true; } });
  // The red tunic (cloth simulation), built once the skeleton is known.
  let tunic: { cloth: Cloth; ring: THREE.Vector3[]; half: number; prev: { t: THREE.Vector3; q: THREE.Quaternion } | null } | null = null;
  const dq = new THREE.Quaternion();
  /** Turns a bone about one of the character's axes (x: its left/right, y: up, z: forward), on top of what's applied so far. */
  const turnBone = (k: BoneKey, axis: Axis, angle: number) => {
    if (!skel || !angle) return;
    skel.bones[k].quaternion.multiply(dq.setFromAxisAngle(skel.axes[k][axis], angle));
  };
  const pose = (t: number, walking: boolean) => {
    if (!skel) return;
    for (const k of Object.keys(BONES) as BoneKey[]) skel.bones[k].quaternion.copy(skel.rest[k]);
    const { L, R } = skel.side;
    const breathe = Math.sin(t * 1.4);
    const s = walking ? Math.sin(t * 4.5) : 0;
    // Hunched, heavy chest; breathing lifts it.
    turnBone("spine1", "x", walking ? 0.12 : 0.06);
    turnBone("spine2", "x", 0.05 + breathe * 0.015);
    turnBone("spine3", "x", 0.04 - breathe * 0.02);
    turnBone("spine2", "y", walking ? s * 0.08 : 0);
    // Head: stares, turning slowly when standing.
    turnBone("neck", "x", walking ? 0.05 : 0.08);
    turnBone("head", "y", walking ? -s * 0.06 : Math.sin(t * 0.5) * 0.45);
    turnBone("head", "z", walking ? 0 : Math.sin(t * 0.5) * 0.05);
    // Arms hang from the T-pose; they swing against the legs when walking. Machete hand stays lower and ahead.
    // Machete arm held a little forward, out of the tunic.
    turnBone("upperR", "x", walking ? -0.3 - s * 0.2 : -0.32 + Math.sin(t * 1.3) * 0.03);
    turnBone("upperR", "z", -R * skel.side.dropR);
    turnBone("lowerR", "y", -R * (walking ? 0.35 : 0.25));
    turnBone("upperL", "x", walking ? -0.1 + s * 0.35 : -0.08 - Math.sin(t * 1.3) * 0.03);
    turnBone("upperL", "z", -L * skel.side.dropL);
    turnBone("lowerL", "y", -L * (walking ? 0.35 : 0.25));
    // Long strides.
    turnBone("thighL", "x", walking ? -s * 0.45 : 0);
    turnBone("thighR", "x", walking ? s * 0.45 : 0);
    turnBone("calfL", "x", walking ? Math.max(0, s) * 0.6 : 0);
    turnBone("calfR", "x", walking ? Math.max(0, -s) * 0.6 : 0);
    body.position.y = walking ? Math.abs(s) * 0.08 : 0;
  };

  const tmpQ = new THREE.Quaternion(), tmpT = new THREE.Vector3(), tmpS = new THREE.Vector3();
  const pt = (b: THREE.Object3D) => body.worldToLocal(b.getWorldPosition(new THREE.Vector3()));
  /** Moves the tunic one frame: pins to the chest, body colliders, and the body's own motion on the map. */
  const stepTunic = (dt: number, t: number, walking: boolean) => {
    if (!skel || !tunic) return;
    const b = skel.bones, h = tunic.half;
    body.updateWorldMatrix(true, true);
    const ring = tunic.ring.map((p) => body.worldToLocal(b.spine3.localToWorld(p.clone())));
    const cap = (a: THREE.Object3D, c: THREE.Object3D, r: number): Capsule => ({ a: pt(a), b: pt(c), r });
    const colliders: Capsule[] = [
      cap(b.pelvis, b.spine3, h * 1.38),
      // Across the shoulders: the tunic rests on this.
      { a: pt(b.upperL).add(new THREE.Vector3(0, h * 0.18, 0)), b: pt(b.upperR).add(new THREE.Vector3(0, h * 0.18, 0)), r: h * 0.62 },
      cap(b.thighL, b.calfL, h * 0.82), cap(b.thighR, b.calfR, h * 0.82),
      cap(b.calfL, b.footL, h * 0.64), cap(b.calfR, b.footR, h * 0.64),
      cap(b.upperL, b.lowerL, h * 0.5), cap(b.upperR, b.lowerR, h * 0.5),
      cap(b.lowerL, b.handL, h * 0.42), cap(b.lowerR, b.handR, h * 0.42),
    ];
    // Where the body went in the world since last frame, seen from the body: the cloth stays behind.
    body.matrixWorld.decompose(tmpT, tmpQ, tmpS);
    let frame: THREE.Matrix4 | null = null;
    if (tunic.prev) {
      const inv = tmpQ.clone().invert();
      // Cloth resting on the body turns with it (friction): only a share of the turn is left behind,
      // enough for a swing, not enough to wring the tunic round him.
      const rel = new THREE.Quaternion().slerp(inv.clone().multiply(tunic.prev.q), 0.25);
      const move = tunic.prev.t.clone().sub(tmpT).divideScalar(tmpS.x || 1).applyQuaternion(inv);
      if (move.length() > 25) tunic.cloth.reset(); // jumped across the map: start the drape again
      else {
        // GPS steps and stuttering frames can move him a body-width in one frame; real cloth is never
        // left behind by that much at once (it would go straight through him). Cap what's left behind.
        if (move.length() > 0.12) move.setLength(0.12);
        frame = new THREE.Matrix4().makeRotationFromQuaternion(rel).setPosition(move);
      }
    }
    tunic.prev = { t: tmpT.clone(), q: tmpQ.clone() };
    // Night breeze, plus the side-to-side sway of each stride when walking.
    const wind = new THREE.Vector3(Math.sin(t * 0.7) * 3 + Math.sin(t * 2.3) * 1.2 + (walking ? Math.sin(t * 4.5) * 6 : 0), 0, Math.cos(t * 0.5) * 2);
    // The body's vertical axis: halfway between the hips, under the chest.
    const hips = pt(b.pelvis), chestP = pt(b.spine3);
    tunic.cloth.step(dt, ring, colliders, frame, wind, { x: (hips.x + chestP.x) / 2, z: (hips.z + chestP.z) / 2 });
  };

  loadJason(lite).then((gltf) => {
    if (gone) return;
    const model = cloneSkinned(gltf.scene);
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.frustumCulled = false;
      // The mask is the only single-sided material and its faces come out turned inwards: draw both sides,
      // and keep only a light gloss (no environment map here to reflect).
      const mat = m.material as THREE.MeshPhysicalMaterial;
      mat.side = THREE.DoubleSide;
      if (mat.clearcoat) { mat.clearcoat = 0.3; mat.clearcoatRoughness = 0.3; }
      // Sharp textures at grazing angles (the map camera looks down at a slant), deeper fabric relief,
      // and soft environment reflections (applied by map3d, see envDirty below).
      for (const t of [mat.map, mat.normalMap]) if (t) { t.anisotropy = 8; t.needsUpdate = true; }
      if (mat.normalMap) mat.normalScale.setScalar(/Cloth/.test(mat.name) ? 1.4 : 1.15);
      mat.userData.env = mat.clearcoat ? 0.3 : 0.12;
    });
    // Il Cercatore: wooden mask, red sleeves, gloves, brown boots (painted over the base model).
    dressModel(model, keep, lite ? 512 : 1024);
    const box = new THREE.Box3().setFromObject(model);
    const k = MODEL_H / (box.max.y - box.min.y);
    model.scale.setScalar(k);
    model.position.set(-((box.min.x + box.max.x) / 2) * k, -box.min.y * k, -((box.min.z + box.max.z) / 2) * k);
    body.add(model);
    body.updateWorldMatrix(true, true);

    const bones = {} as Record<BoneKey, THREE.Bone>;
    for (const [key, name] of Object.entries(BONES) as [BoneKey, string][]) {
      const b = model.getObjectByName(name) as THREE.Bone | undefined;
      if (!b) throw new Error(`bone ${name}`);
      bones[key] = b;
    }
    const bodyQ = body.getWorldQuaternion(new THREE.Quaternion()).invert();
    const rest = {} as Record<BoneKey, THREE.Quaternion>;
    const axes = {} as Record<BoneKey, Record<Axis, THREE.Vector3>>;
    for (const key of Object.keys(bones) as BoneKey[]) {
      rest[key] = bones[key].quaternion.clone();
      // The character's axes seen from inside this bone (its rest orientation relative to the body).
      const w = bodyQ.clone().multiply(bones[key].getWorldQuaternion(new THREE.Quaternion())).invert();
      axes[key] = { x: new THREE.Vector3(1, 0, 0).applyQuaternion(w), y: new THREE.Vector3(0, 1, 0).applyQuaternion(w), z: new THREE.Vector3(0, 0, 1).applyQuaternion(w) };
    }
    const at = (b: THREE.Object3D) => body.worldToLocal(b.getWorldPosition(new THREE.Vector3()));
    // Which side each arm is on, and how far below horizontal it rests, so it can be dropped to hang.
    const armInfo = (up: THREE.Bone, low: THREE.Bone) => {
      const d = at(low).sub(at(up));
      return { side: Math.sign(d.x) || 1, below: Math.atan2(-d.y, Math.abs(d.x)) };
    };
    const l = armInfo(bones.upperL, bones.lowerL), r = armInfo(bones.upperR, bones.lowerR);
    skel = { bones, rest, axes, side: { L: l.side, R: r.side, dropL: 1.3 - l.below, dropR: 1.3 - r.below } };
    pose(0, false);
    body.updateWorldMatrix(true, true);

    // The breath at the mouth.
    const headP = at(bones.head);
    body.add(mouth);
    // Mouth: just under the top of the model, in front of the face.
    mouth.position.set(headP.x, MODEL_H - 0.65, headP.z + 0.5);
    mouth.rotation.set(0, 0, 0);
    mouth.scale.setScalar(1);
    body.updateWorldMatrix(true, true);
    bones.head.attach(mouth);
    aim = mouth;

    // ---- red tunic hanging from the shoulders ----
    const uL = at(bones.upperL), uR = at(bones.upperR), chest = at(bones.spine3), neckP = at(bones.neck);
    const half = uL.distanceTo(uR) / 2;
    const cx = (uL.x + uR.x) / 2;
    // Neckline round the base of the neck, then over the shoulders, then down to the shins.
    const ringY = neckP.y + half * 0.05, shoulderY = (uL.y + uR.y) / 2 + half * 0.25, hemY = MODEL_H * 0.17;
    const neck = { x: half * 0.62, z: half * 0.55 }, shoulder = { x: half * 1.55, z: half * 1.12 };
    const COLS = 32, ROWS = 22;
    const restAt = (c: number, r: number) => {
      const a = (c / COLS) * Math.PI * 2, k = r / (ROWS - 1);
      let rx: number, rz: number, y: number;
      if (k <= 0.16) {
        const t = Math.sqrt(k / 0.16);
        rx = neck.x + (shoulder.x - neck.x) * t; rz = neck.z + (shoulder.z - neck.z) * t; y = ringY + (shoulderY - ringY) * (k / 0.16);
      } else {
        const t = (k - 0.16) / 0.84, flare = 1 + 0.28 * Math.pow(t, 0.8);
        rx = shoulder.x * flare; rz = shoulder.z * flare; y = shoulderY + (hemY - shoulderY) * t;
      }
      return new THREE.Vector3(cx + Math.sin(a) * rx, y, (chest.z + neckP.z) / 2 + Math.cos(a) * rz);
    };
    // The top ring rides on the upper chest bone, so it follows the hunch, the breathing and the twist.
    const ring = Array.from({ length: COLS }, (_, c) => bones.spine3.worldToLocal(body.localToWorld(restAt(c, 0))));
    const tex = tunicTextures(lite ? 512 : 1024);
    for (const t of [tex.map, tex.normal, tex.rough]) keep(t);
    const wool = keep(new THREE.MeshPhysicalMaterial({
      map: tex.map, normalMap: tex.normal, normalScale: new THREE.Vector2(1.1, 1.1), roughnessMap: tex.rough, roughness: 1,
      sheen: 0.6, sheenRoughness: 0.7, sheenColor: new THREE.Color("#5a0a12"), side: THREE.DoubleSide,
    }));
    wool.userData.env = 0.08;
    const cloth = new Cloth(COLS, ROWS, restAt, wool, 0.45);
    keep(cloth);
    body.add(cloth.mesh);
    tunic = { cloth, ring, half, prev: null };

    // Hood pushed down onto the upper back, riding on the chest bone.
    const hood = makeHood(wool, half * 0.95, keep);
    body.add(hood);
    hood.position.set(cx, ringY - half * 0.25, (chest.z + neckP.z) / 2 - half * 0.15);
    body.updateWorldMatrix(true, true);
    bones.spine3.attach(hood);

    // The carved wooden mask replaces the base model's hockey mask (which has holes cut in its mesh):
    // hide the old one and fit the new one to the head, riding on the head bone.
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && /Misc/.test((m.material as THREE.Material).name)) m.visible = false;
    });
    {
      const headP = at(bones.head), u = MODEL_H / 10.3;
      const mask = makeMask(1.05 * u, 1.38 * u, 0.62 * u, keep);
      body.add(mask);
      mask.position.set(headP.x, headP.y + 0.3 * u, headP.z + 0.44 * u);
      body.updateWorldMatrix(true, true);
      bones.head.attach(mask);
    }

    // Machete in the right hand, blade hanging forward and down.
    const machete = makeMachete(keep);
    body.add(machete);
    machete.position.copy(at(bones.handR));
    // Tilted forward and down, so the blade comes out in front of the tunic as in the drawing.
    machete.rotation.set(-0.95, 1.35, 0);
    machete.scale.set(MODEL_H * 0.3, MODEL_H * 0.26, MODEL_H * 0.3);
    body.updateWorldMatrix(true, true);
    bones.handR.attach(machete);
    // Let it settle into its drape before it's seen.
    for (let i = 0; i < 90; i++) stepTunic(1 / 60, 0, false);

    // The map's camera confuses three.js frustum culling: always draw the add-ons.
    body.traverse((o) => { o.frustumCulled = false; });
    figure.visible = false;
    body.userData.envDirty = true;
  }).catch((e) => console.warn("jason model:", e));

  const update = (t: number, walking: boolean) => {
    const dt = lastT < 0 ? 0 : Math.min(0.1, t - lastT);
    lastT = t;
    if (dt > 0 && t > breathAt) {
      breathAt = t + 2.6 + Math.random();
      const at = fxLocal(mouth).clone();
      // Breath goes the way the mask is looking.
      const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(aim.getWorldQuaternion(new THREE.Quaternion()));
      for (let i = 0; i < 4; i++)
        breath.emit(at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, 0)),
          [dir.x * (0.7 + Math.random() * 0.5) + (Math.random() - 0.5) * 0.3, 0.3 + Math.random() * 0.3, dir.z * (0.7 + Math.random() * 0.5)], 1.4 + Math.random() * 0.6, 2.2);
    }
    breath.step(dt, 1.2);
    if (skel) {
      pose(t, walking);
      if (dt > 0) stepTunic(dt, t, walking);
    }
    else body.position.y = walking ? Math.abs(Math.sin(t * 4.5)) * 0.08 : 0;
  };
  return { body, mats, update, fx };
}
