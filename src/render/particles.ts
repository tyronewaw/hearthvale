import { Color, IcosahedronGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, MeshLambertMaterial, OctahedronGeometry, Quaternion, Vector3, type Scene } from 'three';
import type { SparkKind } from '../sim/events';
import { Rng } from '../sim/rng';
import { wd, wrap } from '../sim/world';
import { bent } from './bend';
import { worldMat } from './materials';

export type ParticleKind = SparkKind | 'smoke';

interface P {
  kind: ParticleKind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  grow: number;
  grav: number;
  col: Color;
}

const COL: Record<ParticleKind, string> = {
  smoke: '#cfd0d6', heart: '#f07aa0', spark: '#ffe27a', leaf: '#6eaa50', puff: '#ececec', star: '#ffe27a',
  note: '#fff0a0', zzz: '#ffffff', bang: '#d9533c', splash: '#dff4ff',
};
/** Kinds drawn lit (they darken at night); the rest glow. */
const LIT = new Set<ParticleKind>(['smoke', 'puff', 'leaf', 'splash']);
const m4 = new Matrix4(), q4 = new Quaternion(), v3 = new Vector3(), s3 = new Vector3();

/**
 * A small pooled particle system: chimney smoke, plus the sim's sparks (hearts, stars,
 * leaves, splashes …). Positions live on the torus and are drawn at their nearest image.
 */
export class Particles {
  private lit: InstancedMesh;
  private glow: InstancedMesh;
  private ps: P[] = [];
  private R = new Rng(17);

  constructor(scene: Scene, private max = 700) {
    this.lit = new InstancedMesh(new IcosahedronGeometry(1, 0), worldMat(new MeshLambertMaterial({ flatShading: true })), max);
    this.glow = new InstancedMesh(new OctahedronGeometry(1, 0), bent(new MeshBasicMaterial({ fog: true })), max);
    for (const m of [this.lit, this.glow]) {
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
    }
  }

  emit(kind: ParticleKind, x: number, y: number, z: number, n = 1): void {
    const R = this.R;
    for (let i = 0; i < n && this.ps.length < this.max; i++) {
      const a = R.next() * Math.PI * 2, sp = R.next();
      const p: P = {
        kind, x: wrap(x + (R.next() - 0.5) * 0.2), y, z: wrap(z + (R.next() - 0.5) * 0.2), vx: 0, vy: 0, vz: 0,
        life: 1.4, max: 1.4, size: 0.06, grow: 0, grav: 0, col: new Color(COL[kind]),
      };
      if (kind === 'smoke') Object.assign(p, { vy: 0.38, vx: 0.08, life: 3, max: 3, size: 0.045, grow: 0.022 });
      else if (kind === 'heart' || kind === 'note' || kind === 'zzz') Object.assign(p, { vy: 0.8, vx: Math.cos(a) * 0.15, vz: Math.sin(a) * 0.15, size: 0.07 });
      else if (kind === 'spark' || kind === 'star') Object.assign(p, { vy: 1 + sp, vx: Math.cos(a) * 0.8 * sp, vz: Math.sin(a) * 0.8 * sp, grav: 2, life: 1.1, max: 1.1, size: 0.05 });
      else if (kind === 'leaf') Object.assign(p, { vy: 0.6, vx: Math.cos(a) * 0.6, vz: Math.sin(a) * 0.6, grav: 1.2, size: 0.05 });
      else if (kind === 'puff') Object.assign(p, { vy: 0.3, vx: Math.cos(a) * 0.4, vz: Math.sin(a) * 0.4, life: 0.9, max: 0.9, size: 0.09, grow: 0.15 });
      else if (kind === 'splash') Object.assign(p, { vy: 2 + sp * 1.5, vx: Math.cos(a) * 0.7, vz: Math.sin(a) * 0.7, grav: 7, life: 0.8, max: 0.8, size: 0.05 });
      else if (kind === 'bang') Object.assign(p, { vy: 1.2, size: 0.08 });
      this.ps.push(p);
    }
  }

  update(dt: number, fx: number, fz: number): void {
    const out: P[] = [];
    let nl = 0, ng = 0;
    for (const p of this.ps) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy -= p.grav * dt;
      p.x = wrap(p.x + p.vx * dt);
      p.y += p.vy * dt;
      p.z = wrap(p.z + p.vz * dt);
      if (p.kind === 'smoke') p.vx = 0.08 + Math.sin(p.life * 2) * 0.05;
      out.push(p);
      const age = 1 - p.life / p.max;
      const fade = Math.min(1, p.life / (p.max * 0.35));
      const sz = (p.size + p.grow * age * p.max) * fade;
      q4.identity();
      m4.compose(v3.set(fx + wd(fx, p.x), p.y, fz + wd(fz, p.z)), q4, s3.setScalar(Math.max(0.001, sz)));
      const mesh = LIT.has(p.kind) ? this.lit : this.glow, i = LIT.has(p.kind) ? nl++ : ng++;
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, p.col);
    }
    this.ps = out;
    this.lit.count = nl;
    this.glow.count = ng;
    for (const m of [this.lit, this.glow]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}
