import {
  BoxGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry, InstancedMesh, Matrix4, MeshBasicMaterial,
  MeshLambertMaterial, PlaneGeometry, Quaternion, Vector3, type BufferGeometry, type Camera, type Material, type Scene,
} from 'three';
import type { RoleId } from '../sim/defs';
import { isWater } from '../sim/terrain';
import { wd, type State, type Vill } from '../sim/world';
import { bendDrop, bent } from './bend';
import { blendGeo } from './blendmodels';
import { Kit } from './kit';
import { worldMat } from './materials';
import { TRIBE_BLUE, TRIBE_RED } from './models';
import { WATER_Y, surfaceY } from './scale';
import villagerParts from '../assets/models/villager.json';

const SKIN = ['#c98d5e', '#a8704a', '#e0b088', '#8a5a3a'].map((c) => new Color(c));
const HAIR = ['#2a1a12', '#5a3420', '#1e1e2a', '#7a4b2a'].map((c) => new Color(c));
const BLUE = TRIBE_BLUE.map((c) => new Color(c)), RED = TRIBE_RED.map((c) => new Color(c));
/** Job accents on top of the tribe blue (sash/belt colour). */
const BELT: Record<RoleId, Color> = {
  settler: new Color('#6b4426'), farmer: new Color('#c9a35a'), forester: new Color('#4f8a3c'),
  fisher: new Color('#3a9a9a'), builder: new Color('#d9783a'), priest: new Color('#f2eee2'),
};
type Hat = 'farmer' | 'forester' | 'fisher' | 'builder' | 'priest';
const HATS: Hat[] = ['farmer', 'forester', 'fisher', 'builder', 'priest'];

/** A villager the renderer should draw (sim villagers, plus ones in the hand). */
export interface Figure {
  v: Vill;
  /** Torus position. */
  x: number;
  z: number;
  /** Explicit height (held/flying); otherwise stands on the ground. */
  y?: number;
  pose?: 'held' | 'fly';
  /** Body rotation while flying (physics); the figure tumbles about its middle. */
  q?: { x: number; y: number; z: number; w: number };
}

/** Height of a flying villager's tumbling centre above their feet (matches the physics capsule). */
const FLY_CENTRE = 0.25;

function pivoted(g: BufferGeometry, dy: number): BufferGeometry {
  g.translate(0, dy, 0);
  return g;
}

function hatGeo(h: Hat): BufferGeometry {
  const k = new Kit();
  if (h === 'farmer') {
    k.add(new CylinderGeometry(0.15, 0.15, 0.015, 10), '#e8c66a');
    k.add(new ConeGeometry(0.08, 0.08, 8), '#d9b450', { pos: [0, 0.04, 0] });
  } else if (h === 'forester') {
    k.add(new BoxGeometry(0.16, 0.05, 0.15), '#3d6b30', { pos: [0, 0.01, 0] });
    k.add(new BoxGeometry(0.16, 0.012, 0.07), '#2f5426', { pos: [0, -0.01, 0.09] });
  } else if (h === 'fisher') k.add(new ConeGeometry(0.13, 0.1, 8), '#3a8a8a', { pos: [0, 0.04, 0] });
  else if (h === 'builder') k.add(new BoxGeometry(0.162, 0.03, 0.152), '#d9783a', { pos: [0, -0.02, 0] });
  else {
    k.add(new ConeGeometry(0.02, 0.14, 4), '#d9533c', { pos: [-0.04, 0.06, -0.02], rot: [0, 0, 0.3] });
    k.add(new ConeGeometry(0.02, 0.18, 4), '#f2b632', { pos: [0, 0.08, -0.03] });
    k.add(new ConeGeometry(0.02, 0.14, 4), '#4f8fd1', { pos: [0.04, 0.06, -0.02], rot: [0, 0, -0.3] });
  }
  return k.build();
}

function toolGeo(h: Hat): BufferGeometry {
  const k = new Kit(), handle = '#7a4b2a';
  if (h === 'farmer') {
    k.add(new BoxGeometry(0.018, 0.32, 0.018), handle, { pos: [0, -0.06, 0] });
    k.add(new BoxGeometry(0.07, 0.02, 0.05), '#9aa7b5', { pos: [0, -0.22, 0.02] });
  } else if (h === 'forester' || h === 'builder') {
    k.add(new BoxGeometry(0.018, 0.26, 0.018), handle, { pos: [0, -0.06, 0] });
    k.add(new BoxGeometry(h === 'forester' ? 0.08 : 0.06, 0.05, 0.04), '#aab4be', { pos: [0.02, -0.18, 0] });
  } else if (h === 'fisher') {
    k.add(new BoxGeometry(0.012, 0.6, 0.012), handle, { pos: [0, 0.1, 0.12], rot: [0.7, 0, 0] });
  } else {
    k.add(new BoxGeometry(0.02, 0.5, 0.02), '#c9a35a', { pos: [0, 0.05, 0] });
    k.add(new ConeGeometry(0.035, 0.06, 5), '#ffe27a', { pos: [0, 0.32, 0] });
  }
  return k.build();
}

function blobTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const x = c.getContext('2d')!, g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(20,30,20,0.45)');
  g.addColorStop(1, 'rgba(20,30,20,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 32, 32);
  return new CanvasTexture(c);
}

const B = new Matrix4(), L = new Matrix4(), A = new Matrix4(), q4 = new Quaternion(), qa = new Quaternion(), v3 = new Vector3(), s3 = new Vector3();
const X = new Vector3(1, 0, 0), Y = new Vector3(0, 1, 0), Z = new Vector3(0, 0, 1);
const one = new Vector3(1, 1, 1);

/** Villagers nearer the camera than this get the rounded Blender-made bodies (up to FINE_CAP of them). */
const FINE_R = 16, FINE_CAP = 300;

/** One villager's body parts: simple boxes, or the rounded close-up ones. */
interface Body {
  legs: InstancedMesh;
  arms: InstancedMesh;
  torso: InstancedMesh;
  belt: InstancedMesh;
  head: InstancedMesh;
  hair: InstancedMesh;
}

/**
 * The tribe: chunky low-poly people, instanced per body part (legs, arms, torso, belt,
 * head, hair, hats and tools), animated procedurally on the CPU. Everyone wears tribe blue;
 * jobs show as belts, hats and tools. Only villagers near the camera are drawn; the nearest
 * get rounded bodies made in Blender (scripts/blender/villager.py), the rest simple boxes.
 */
export class Villagers {
  private box: Body;
  private fine: Body;
  private hats: Record<Hat, InstancedMesh>;
  private tools: Record<Hat, InstancedMesh>;
  private blobs: InstancedMesh;
  /** Last drawn villagers with their world positions (for picking). */
  drawn: { v: Vill; p: Vector3 }[] = [];

  constructor(scene: Scene, private cap = 900) {
    const lam = () => worldMat(new MeshLambertMaterial({ flatShading: true }));
    const vc = worldMat(new MeshLambertMaterial({ flatShading: true, vertexColors: true }));
    const mk = (g: BufferGeometry, n: number, mat: Material = lam()) => {
      const m = new InstancedMesh(g, mat, n);
      m.frustumCulled = false;
      m.count = 0;
      m.receiveShadow = true;
      scene.add(m);
      return m;
    };
    this.box = {
      legs: mk(pivoted(new BoxGeometry(0.065, 0.17, 0.075), -0.085), cap * 2),
      arms: mk(pivoted(new BoxGeometry(0.055, 0.17, 0.06), -0.08), cap * 2),
      torso: mk(new BoxGeometry(0.18, 0.2, 0.13), cap),
      belt: mk(new BoxGeometry(0.188, 0.04, 0.138), cap),
      head: mk(new BoxGeometry(0.15, 0.145, 0.145), cap),
      hair: mk(new BoxGeometry(0.158, 0.055, 0.152), cap),
    };
    // smooth-shaded, vertex-coloured (white, with dark eyes, feet and hems) times each villager's colours
    const soft = worldMat(new MeshLambertMaterial({ vertexColors: true }));
    const fc = Math.min(cap, FINE_CAP), P = villagerParts;
    this.fine = {
      legs: mk(blendGeo(P.legs), fc * 2, soft), arms: mk(blendGeo(P.arms), fc * 2, soft), torso: mk(blendGeo(P.torso), fc, soft),
      belt: mk(blendGeo(P.belt), fc, soft), head: mk(blendGeo(P.head), fc, soft), hair: mk(blendGeo(P.hair), fc, soft),
    };
    this.hats = Object.fromEntries(HATS.map((h) => [h, mk(hatGeo(h), cap, vc)])) as Record<Hat, InstancedMesh>;
    this.tools = Object.fromEntries(HATS.map((h) => [h, mk(toolGeo(h), cap, vc)])) as Record<Hat, InstancedMesh>;
    const pg = new PlaneGeometry(0.42, 0.42);
    pg.rotateX(-Math.PI / 2);
    this.blobs = mk(pg, cap, bent(new MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false })));
    this.blobs.receiveShadow = false;
  }

  /**
   * Lay out every visible villager. `alpha` interpolates between the last two sim ticks;
   * `extra` adds figures the sim isn't walking (the one in the hand).
   */
  update(S: State, fx: number, fz: number, time: number, alpha: number, radius: number, extra: Figure[], cam?: Vector3): void {
    const figs: Figure[] = [];
    const r2 = radius * radius;
    for (const v of S.vills) {
      const x = v.px + wd(v.px, v.x) * alpha, z = v.py + wd(v.py, v.y) * alpha;
      const dx = wd(fx, x), dz = wd(fz, z);
      if (dx * dx + dz * dz > r2) continue;
      figs.push({ v, x, z });
    }
    // nearest first, so the cap drops the far ones
    if (figs.length > this.cap) {
      figs.sort((a, b) => Math.hypot(wd(fx, a.x), wd(fz, a.z)) - Math.hypot(wd(fx, b.x), wd(fz, b.z)));
      figs.length = this.cap;
    }
    figs.push(...extra);

    let n = 0, nb = 0, nf = 0;
    const hatN: Record<Hat, number> = { farmer: 0, forester: 0, fisher: 0, builder: 0, priest: 0 };
    this.drawn = [];
    for (const f of figs) {
      if (n >= this.cap) break;
      const v = f.v, wx = fx + wd(fx, f.x), wz = fz + wd(fz, f.z);
      const wet = f.y === undefined && isWater(S, Math.floor(f.x), Math.floor(f.z));
      const ground = surfaceY(S, f.x, f.z);
      const ph = time * 9 + v.id * 1.7;
      const held = f.pose === 'held' || f.pose === 'fly';
      const walking = v.mv && !held && !wet;
      const sit = !held && !wet && (v.st === 'sit' || v.st === 'rest') && !v.mv;
      const work = v.st === 'work' && !held;
      let y = f.y ?? (wet ? WATER_Y - 0.36 + Math.sin(ph * 0.4) * 0.02 : ground);
      if (walking) y += Math.abs(Math.sin(ph)) * 0.025;
      if (sit) y -= 0.12;
      const yaw = held ? time * 0.6 : Math.PI / 2 - v.face;
      const wob = v.dizzy > 0.4 ? Math.sin(time * 10 + v.id) * 0.25 : 0;
      if (f.q) {
        // tumbling through the air: rotate about the body's middle
        B.compose(v3.set(wx, y, wz), q4.set(f.q.x, f.q.y, f.q.z, f.q.w), one).multiply(L.makeTranslation(0, -FLY_CENTRE, 0));
      } else {
        q4.setFromAxisAngle(Y, yaw);
        if (wob) q4.multiply(qa.setFromAxisAngle(Z, wob));
        if (held) q4.multiply(qa.setFromAxisAngle(X, Math.sin(time * 6) * 0.25));
        B.compose(v3.set(wx, y, wz), q4, one);
      }
      this.drawn.push({ v, p: new Vector3(wx, y + 0.3 - bendDrop(wx, wz), wz) });

      const skin = SKIN[v.sk % 4]!, blue = (v.tribe === 1 ? RED : BLUE)[v.c % 4]!;
      const near = !!cam && nf < this.fine.head.instanceMatrix.count && cam.distanceToSquared(v3.set(wx, y, wz)) < FINE_R * FINE_R;
      const body = near ? this.fine : this.box, i = near ? nf++ : nb++;
      // legs
      const swing = walking ? Math.sin(ph) * 0.7 : f.pose === 'fly' ? Math.sin(time * 14 + v.id) * 0.8 : held ? Math.sin(time * 8 + v.id) * 0.5 : sit ? -1.4 : 0;
      for (const side of [-1, 1]) {
        L.compose(v3.set(side * 0.048, 0.17, 0), qa.setFromAxisAngle(X, sit ? swing : swing * side), one).premultiply(B);
        body.legs.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), L);
        body.legs.setColorAt(i * 2 + (side > 0 ? 1 : 0), skin);
      }
      // body
      L.compose(v3.set(0, 0.27, 0), qa.identity(), one).premultiply(B);
      body.torso.setMatrixAt(i, L);
      body.torso.setColorAt(i, blue);
      L.compose(v3.set(0, 0.185, 0), qa.identity(), one).premultiply(B);
      body.belt.setMatrixAt(i, L);
      body.belt.setColorAt(i, BELT[v.role]);
      L.compose(v3.set(0, 0.45, 0), qa.identity(), one).premultiply(B);
      body.head.setMatrixAt(i, L);
      body.head.setColorAt(i, skin);
      L.compose(v3.set(0, 0.52, -0.005), qa.identity(), one).premultiply(B);
      body.hair.setMatrixAt(i, L);
      body.hair.setColorAt(i, HAIR[v.c % 4]!);
      // arms: walk swing, work chop, wave, paddle, or up in the air when held
      for (const side of [-1, 1]) {
        let ax = walking ? -Math.sin(ph) * 0.6 * side : 0, az = 0;
        if (f.pose === 'fly') ax = -2.6 + Math.sin(time * 16 + side * 2) * 0.7;
        else if (held) ax = -2.8 + Math.sin(time * 7 + side) * 0.3;
        else if (wet) ax = -1.2 + Math.sin(ph * 0.8 + side * 1.6) * 0.8;
        else if (work && side > 0) ax = v.role === 'priest' ? -2.6 : v.role === 'fisher' ? -0.9 : -1.2 - Math.abs(Math.sin(time * 5 + v.id)) * 1.4;
        else if (work && v.role === 'priest') ax = -2.6;
        else if (v.wave > 0 && side > 0) {
          ax = -2.7;
          az = Math.sin(time * 12) * 0.35;
        } else az = side * 0.12;
        q4.setFromAxisAngle(X, ax).multiply(qa.setFromAxisAngle(Z, az * -side));
        L.compose(v3.set(side * 0.118, 0.36, 0), q4, one).premultiply(B);
        body.arms.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), L);
        body.arms.setColorAt(i * 2 + (side > 0 ? 1 : 0), skin);
        if (side > 0 && v.role !== 'settler') {
          const h = v.role as Hat, arm = A.copy(L);
          L.compose(v3.set(0, -0.15, 0.02), qa.identity(), one).premultiply(arm);
          this.tools[h].setMatrixAt(hatN[h], L);
        }
      }
      if (v.role !== 'settler') {
        const h = v.role as Hat;
        L.compose(v3.set(0, 0.55, 0), qa.identity(), one).premultiply(B);
        this.hats[h].setMatrixAt(hatN[h]++, L);
      }
      // blob shadow on the ground
      if (!wet) {
        const sz = held ? 0.7 : 1;
        L.compose(v3.set(wx, ground + 0.02, wz), qa.identity(), s3.setScalar(sz));
        this.blobs.setMatrixAt(n, L);
      } else this.blobs.setMatrixAt(n, L.makeScale(0, 0, 0));
      n++;
    }
    this.blobs.count = n;
    for (const [b, c] of [[this.box, nb], [this.fine, nf]] as const) {
      b.torso.count = b.belt.count = b.head.count = b.hair.count = c;
      b.legs.count = b.arms.count = c * 2;
    }
    for (const h of HATS) {
      this.hats[h].count = hatN[h];
      this.tools[h].count = hatN[h];
    }
    for (const m of [...Object.values(this.box), ...Object.values(this.fine), this.blobs, ...Object.values(this.hats), ...Object.values(this.tools)]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  /** Nearest drawn villager to a screen point, within `px` pixels. */
  pick(camera: Camera, ndcX: number, ndcY: number, w: number, h: number, px = 18): Vill | null {
    let best: Vill | null = null, bd = px;
    for (const d of this.drawn) {
      v3.copy(d.p).project(camera);
      if (v3.z > 1) continue;
      const dist = Math.hypot(((v3.x - ndcX) * w) / 2, ((v3.y - ndcY) * h) / 2);
      if (dist < bd) {
        bd = dist;
        best = d.v;
      }
    }
    return best;
  }
}
