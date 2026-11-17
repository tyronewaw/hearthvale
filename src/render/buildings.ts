import {
  AdditiveBlending, BoxGeometry, CanvasTexture, Color, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial,
  PlaneGeometry, PointLight, Quaternion, Vector3, type BufferGeometry, type Scene,
} from 'three';
import { STRUCT_KINDS, type StructKind } from '../sim/defs';
import { hash2 } from '../sim/rng';
import { NEW_SIZE, sizeOf } from '../sim/village';
import { N, tdist, wd, wrap, type State } from '../sim/world';
import { bent } from './bend';
import { castsShadow, tintable, worldMat } from './materials';
import { TRIBE_BLUE, TRIBE_RED, crystalGeo, flameGeo, frameGeo, homeModels, siteGeo, structModels, totemGeo, tuftGeo, type Model } from './models';
import type { Particles } from './particles';
import { surfaceY } from './scale';

const CROP = ['#96d06c', '#62a446', '#e4c65c', null];
const SOIL = ['#88623e', '#88623e', '#8a6440', '#d6d4dc'];
const m4 = new Matrix4(), l4 = new Matrix4(), q4 = new Quaternion(), v3 = new Vector3(), s3 = new Vector3(), up = new Vector3(0, 1, 0);
const WHITE = new Color('#ffffff'), RED_CRYSTAL = new Color('#ff8a6a');
const tmpC = new Color(), BLUE_C = new Color(TRIBE_BLUE[0]), RED_C = new Color(TRIBE_RED[0]);
/** Homes further than this (horizontally) from the camera use the simpler far models. */
const FAR = 30;
/** Seconds a new home takes to rise from its frame. */
const RISE = 1.4;
const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

function poolTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!, g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,190,110,0.9)');
  g.addColorStop(0.5, 'rgba(255,170,80,0.35)');
  g.addColorStop(1, 'rgba(255,160,70,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

function im(scene: Scene, geo: BufferGeometry, mat: MeshLambertMaterial | MeshBasicMaterial, cap: number, shadow: boolean): InstancedMesh {
  const m = new InstancedMesh(geo, mat, cap);
  m.frustumCulled = false;
  m.count = 0;
  m.receiveShadow = true;
  if (shadow) castsShadow(m);
  scene.add(m);
  return m;
}

/** Big (2×2) buildings are drawn this much larger than the one-tile models. */
const BIG = 1.55;
const scaleFor = (sz: number) => (sz >= 2 ? BIG : 1);

/**
 * World placement of a building whose footprint (side sz tiles) starts at tile (x, y), at
 * its nearest image to the focus: centred on the footprint and scaled to fit it.
 */
function place(S: State, x: number, y: number, fx: number, fz: number, yaw: number, sy = 1, out = m4, sz = 1): Matrix4 {
  const cx = x + sz / 2, cz = y + sz / 2, k = scaleFor(sz);
  q4.setFromAxisAngle(up, yaw);
  return out.compose(v3.set(fx + wd(fx, cx), surfaceY(S, wrap(cx), wrap(cz)), fz + wd(fz, cz)), q4, s3.set(k, sy * k, k));
}

/**
 * Every building in the village, drawn as instanced, vertex-coloured models (a dozen draw
 * calls for any size of village), with night glows, fires, crops, smoke and the build ghost.
 */
export class Buildings {
  private homeM: Model[] = homeModels();
  /** Simpler homes for far away (more than FAR units from the camera). */
  private homeFarM: Model[] = homeModels(true);
  private structM: Record<StructKind, Model> = structModels();
  private homes: InstancedMesh[];
  private structs: Record<StructKind, InstancedMesh>;
  private homesFar: InstancedMesh[];
  /** Building sites: stakes and a wood pile, then a timber frame while the walls go up. */
  private sites: InstancedMesh;
  private frames: InstancedMesh;
  /** When each home was first seen (for rising) and its level (for level-up puffs). */
  private seen = new Map<number, { t: number; lv: number }>();
  private started = false;
  private glow: InstancedMesh;
  private glowMat: MeshBasicMaterial;
  private pools: InstancedMesh;
  private poolMat: MeshBasicMaterial;
  private flames: InstancedMesh;
  private crystals: InstancedMesh;
  private soil: InstancedMesh;
  private tufts: InstancedMesh;
  private totem: Mesh;
  private ghost: Mesh;
  private ghostMat: MeshLambertMaterial;
  private ghostKind: StructKind | null = null;
  private fireLight = new PointLight('#ffaa55', 0, 7, 1.6);
  private smokeT = new Map<number, number>();

  constructor(scene: Scene, private particles: Particles) {
    // Smooth where the model is (Blender-made huts), faceted where its normals are (kit boxes).
    const mat = worldMat(new MeshLambertMaterial({ vertexColors: true }));
    // buildings: one draw call per model, with paint, cloth and flags in the tribe's colour
    const tmat = tintable(worldMat(new MeshLambertMaterial({ vertexColors: true })));
    this.homes = this.homeM.map((m) => im(scene, m.geo, tmat, N * N / 8, true));
    this.homesFar = this.homeFarM.map((m) => im(scene, m.geo, tmat, N * N / 8, true));
    this.structs = Object.fromEntries(STRUCT_KINDS.map((k) => [k, im(scene, this.structM[k].geo, tmat, 256, true)])) as Record<StructKind, InstancedMesh>;
    this.sites = im(scene, siteGeo(), mat, 256, false);
    this.frames = im(scene, frameGeo(), mat, 512, true);

    this.glowMat = bent(new MeshBasicMaterial({ color: '#ffcf70', transparent: true, opacity: 0, depthWrite: false }));
    this.glow = im(scene, new PlaneGeometry(1, 1), this.glowMat, N * N / 2, false);
    this.glow.renderOrder = 2;
    const pg = new PlaneGeometry(1, 1);
    pg.rotateX(-Math.PI / 2);
    this.poolMat = bent(new MeshBasicMaterial({ map: poolTexture(), transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending }));
    this.pools = im(scene, pg, this.poolMat, N * N / 4, false);
    this.pools.renderOrder = 2;
    this.flames = im(scene, flameGeo(), bent(new MeshBasicMaterial({ vertexColors: true })), 64, false);
    this.crystals = im(scene, crystalGeo(), bent(new MeshBasicMaterial({ vertexColors: true })), 64, false);
    this.soil = im(scene, new BoxGeometry(0.86, 0.03, 0.86), worldMat(new MeshLambertMaterial({ flatShading: true })), N * N / 2, false);
    this.tufts = im(scene, tuftGeo(), worldMat(new MeshLambertMaterial({ vertexColors: true, flatShading: true })), N * N * 2, false);
    this.totem = new Mesh(totemGeo(), mat);
    castsShadow(this.totem);
    this.totem.frustumCulled = false;
    scene.add(this.totem);
    this.ghostMat = worldMat(new MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false }));
    this.ghost = new Mesh(this.structM.farm.geo, this.ghostMat);
    this.ghost.frustumCulled = false;
    this.ghost.visible = false;
    scene.add(this.ghost, this.fireLight);
  }

  /** Show a translucent preview of a building (or hide it with kind = null). */
  setGhost(kind: StructKind | null, S: State, tile: [number, number] | null, ok: boolean, fx: number, fz: number): void {
    this.ghost.visible = !!kind && !!tile;
    if (!kind || !tile) return;
    if (kind !== this.ghostKind) {
      this.ghost.geometry = this.structM[kind].geo;
      this.ghostKind = kind;
    }
    place(S, tile[0], tile[1], fx, fz, 0, 1, this.ghost.matrix, NEW_SIZE);
    this.ghost.matrixAutoUpdate = false;
    this.ghost.matrixWorldNeedsUpdate = true;
    this.ghostMat.color.set(ok ? '#9bf07a' : '#ff6a50');
  }

  update(S: State, crops: Set<number>, fx: number, fz: number, time: number, dt: number, night: number, season: number, camX = fx, camZ = fz): void {
    const counts = new Array(6).fill(0), far = new Array(6).fill(0);
    let ng = 0, np = 0, nf = 0, nc = 0, nsite = 0, nfr = 0;
    const now = time, first = !this.started; // real seconds (dt is capped per frame, so slow frames would stall it)
    this.started = true;
    const sc: Record<string, number> = {};
    const view = 70; // only emit smoke near the camera
    const addGlows = (model: Model, base: Matrix4) => {
      for (const [x, y, z, yaw, w, h] of model.glows) {
        q4.setFromAxisAngle(up, yaw);
        l4.compose(v3.set(x, y, z), q4, s3.set(w, h, 1));
        this.glow.setMatrixAt(ng++, l4.premultiply(base));
      }
    };
    const smoke = (id: number, model: Model, base: Matrix4, x: number, y: number) => {
      if (!model.smoke || tdist(x, y, fx, fz) > view) return;
      let t = (this.smokeT.get(id) ?? (hash2(id, 7) % 100) / 50) - dt;
      if (t <= 0) {
        t = 1.4 + (hash2(id, Math.floor(time)) % 200) / 100;
        v3.set(...model.smoke).applyMatrix4(base);
        this.particles.emit('smoke', v3.x, v3.y, v3.z, 1);
      }
      this.smokeT.set(id, t);
    };

    // Each home: rising inside a timber frame when it's new, a puff of dust when it grows.
    const alive = new Set<number>();
    for (const b of S.homes) {
      alive.add(b.id);
      const model = this.homeM[b.lv]!, yaw = ((hash2(b.id, 3) % 4) * Math.PI) / 2 + ((hash2(b.id, 5) % 40) - 20) / 100;
      let rec = this.seen.get(b.id);
      if (!rec) this.seen.set(b.id, (rec = { t: first ? -99 : now, lv: b.lv }));
      const rise = smooth((now - rec.t) / RISE);
      const base = place(S, b.x, b.y, fx, fz, yaw, Math.max(0.04, rise)).clone();
      if (rec.lv !== b.lv) {
        if (b.lv > rec.lv && tdist(b.x, b.y, fx, fz) < view) {
          v3.setFromMatrixPosition(base);
          this.particles.emit('puff', v3.x, v3.y + 0.2, v3.z, 8);
        }
        rec.lv = b.lv;
      }
      if (rise < 1) {
        l4.compose(v3.setFromMatrixPosition(base), q4.setFromAxisAngle(up, yaw), s3.set(model.r * 0.85, model.h * 0.9, model.r * 0.85));
        this.frames.setMatrixAt(nfr++, l4);
      }
      const isFar = Math.hypot(base.elements[12] - camX, base.elements[14] - camZ) > FAR;
      const n = isFar ? far[b.lv]++ : counts[b.lv]++, M = (isFar ? this.homesFar : this.homes)[b.lv]!;
      M.setMatrixAt(n, base);
      M.setColorAt(n, b.tribe === 1 ? tmpC.copy(RED_C).lerp(BLUE_C, b.bel / 100) : BLUE_C);
      if (night > 0.05 && rise >= 1) addGlows(model, base);
      if (night > 0.05 && np < this.pools.instanceMatrix.count) {
        l4.compose(v3.set(base.elements[12], base.elements[13] + 0.03, base.elements[14]), q4.identity(), s3.setScalar(model.r * 3));
        this.pools.setMatrixAt(np++, l4);
      }
      if (rise >= 1) smoke(b.id, model, base, b.x + 0.5, b.y + 0.5);
    }
    if (this.seen.size > alive.size + 64) for (const id of [...this.seen.keys()]) if (!alive.has(id)) this.seen.delete(id);

    let nearHearth: Vector3 | null = null, hd = 1e9;
    for (const s of S.structs) {
      const model = this.structM[s.k], building = s.prog < 1, sz = sizeOf(s);
      const yaw = ((hash2(s.id, 3) % 4) * Math.PI) / 2;
      // Sites go up in stages: stakes and a wood pile (from 0), a timber frame (from 20%),
      // then the building itself rising inside the frame (from 55%).
      const up01 = building ? smooth((s.prog - 0.55) / 0.45) : 1;
      if (building) {
        const at = place(S, s.x, s.y, fx, fz, yaw, 1, m4, sz).clone(), k = scaleFor(sz);
        l4.compose(v3.setFromMatrixPosition(at), q4.setFromAxisAngle(up, yaw), s3.set(model.r * k, 1, model.r * k));
        this.sites.setMatrixAt(nsite++, l4);
        if (s.prog >= 0.2) {
          const grow = smooth((s.prog - 0.2) / 0.15);
          l4.compose(v3.setFromMatrixPosition(at), q4.setFromAxisAngle(up, yaw), s3.set(model.r * 0.9 * k, Math.max(0.05, model.h * grow * k), model.r * 0.9 * k));
          this.frames.setMatrixAt(nfr++, l4);
        }
        if (up01 <= 0) continue;
      }
      const base = place(S, s.x, s.y, fx, fz, yaw, Math.max(0.04, up01), m4, sz).clone();
      const i = (sc[s.k] = (sc[s.k] ?? 0) + 1) - 1;
      this.structs[s.k].setMatrixAt(i, base);
      this.structs[s.k].setColorAt(i, s.tribe === 1 ? RED_C : BLUE_C);
      if (building) continue;
      if (night > 0.05) addGlows(model, base);
      if (model.fire) {
        const fl = 1 + Math.sin(time * 13 + s.id) * 0.12 + Math.sin(time * 7.3) * 0.08;
        l4.compose(v3.set(...model.fire), q4.identity(), s3.set(fl, fl * (1.1 + Math.sin(time * 9) * 0.15), fl)).premultiply(base);
        this.flames.setMatrixAt(nf++, l4);
        const p = new Vector3().setFromMatrixPosition(l4);
        const d = Math.hypot(p.x - fx, p.z - fz);
        if (d < hd) {
          hd = d;
          nearHearth = p;
        }
        if (night > 0.05 && np < this.pools.instanceMatrix.count) {
          l4.compose(v3.set(p.x, p.y + 0.04, p.z), q4.identity(), s3.setScalar(3.4));
          this.pools.setMatrixAt(np++, l4);
        }
      }
      if (s.k === 'shrine') {
        q4.setFromAxisAngle(up, time * 0.8);
        const c = model.crystal ?? [0, 0.42, 0];
        l4.compose(v3.set(c[0], c[1] + Math.sin(time * 2 + s.id) * 0.04, c[2]), q4, s3.setScalar(1)).premultiply(base);
        this.crystals.setMatrixAt(nc, l4);
        this.crystals.setColorAt(nc++, s.tribe === 1 ? RED_CRYSTAL : WHITE); // the Red shrine glows warm
      }
    }
    const flush = (m: InstancedMesh, n: number) => {
      m.count = n;
      m.visible = n > 0; // an empty instanced mesh still costs a draw call
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    };
    this.homes.forEach((m, i) => flush(m, counts[i]));
    this.homesFar.forEach((m, i) => flush(m, far[i]));
    for (const k of STRUCT_KINDS) {
      flush(this.structs[k], sc[k] ?? 0);
    }
    for (const [m, n] of [[this.sites, nsite], [this.frames, nfr], [this.glow, ng], [this.pools, np], [this.flames, nf], [this.crystals, nc]] as const) flush(m, n);
    if (this.crystals.instanceColor) this.crystals.instanceColor.needsUpdate = true;
    this.glowMat.opacity = Math.min(1, night * 1.2);
    this.poolMat.opacity = night * 0.55;
    if (nearHearth) {
      this.fireLight.position.set(nearHearth.x, nearHearth.y + 0.6, nearHearth.z);
      this.fireLight.intensity = (0.3 + night * 3.2) * (1 + Math.sin(time * 11) * 0.08);
    } else this.fireLight.intensity = 0;

    // Crops: a soil bed and rows of tufts on each field around a working farm.
    let ns = 0, nt = 0;
    const tuftCol = CROP[season], soilCol = tmpC.set(SOIL[season]!);
    for (const t of crops) {
      const x = t % N, y = (t / N) | 0, cx = x + 0.5, cz = y + 0.5, wx = fx + wd(fx, cx), wz = fz + wd(fz, cz), gy = surfaceY(S, cx, cz);
      l4.compose(v3.set(wx, gy + 0.012, wz), q4.identity(), s3.setScalar(1));
      this.soil.setMatrixAt(ns, l4);
      this.soil.setColorAt(ns++, soilCol);
      if (!tuftCol) continue;
      const c = new Color(tuftCol), hs = hash2(x, y);
      for (let r = 0; r < 3; r++)
        for (let k = 0; k < 3; k++) {
          const sz = 0.8 + ((hs >>> (r * 3 + k)) % 5) / 10;
          l4.compose(v3.set(wx - 0.28 + k * 0.28, gy + 0.02, wz - 0.28 + r * 0.28), q4.identity(), s3.setScalar(sz));
          this.tufts.setMatrixAt(nt, l4);
          this.tufts.setColorAt(nt++, c);
        }
    }
    this.soil.count = ns;
    this.tufts.count = nt;
    for (const m of [this.soil, this.tufts]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }

    // Totem
    this.totem.visible = !!S.totem;
    if (S.totem) {
      const [tx, ty] = S.totem;
      this.totem.position.set(fx + wd(fx, tx), surfaceY(S, tx, ty), fz + wd(fz, ty));
    }
  }
}
