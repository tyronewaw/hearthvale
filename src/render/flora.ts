import {
  BufferGeometry, Color, ConeGeometry, CylinderGeometry, DodecahedronGeometry, IcosahedronGeometry, InstancedMesh,
  Matrix4, MeshLambertMaterial, OctahedronGeometry, Quaternion, Vector3, type Scene,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash2 } from '../sim/rng';
import { CHUNK, CHUNKS, N, idx, wd, type State } from '../sim/world';
import { castsShadow, worldMat } from './materials';
import type { Quality } from './quality';
import { surfaceY } from './scale';

/** Canopy colours per season (spring, summer, autumn, winter), after the prototype's LEAF/PINE. */
const LEAF = [
  ['#5fa65a', '#6db35f', '#86c46a', '#f4a9c6'], // spring, with the odd blossom tree
  ['#4f9450', '#3f8446', '#5a9e52', '#4a8c4c'],
  ['#cf7a35', '#e09a3c', '#c8552f', '#d9b04a'],
  ['#d6e1ec', '#e8eef6', '#c7d6e6', '#dfe7f1'],
].map((s) => s.map((c) => new Color(c)));
const PINE = [
  ['#2f6e4f', '#2a6447', '#3a7a58'],
  ['#2f6e4f', '#2a6447', '#3a7a58'],
  ['#2f6e4f', '#33704f', '#3a7a58'],
  ['#5f8a7c', '#6e968a', '#557f71'],
].map((s) => s.map((c) => new Color(c)));
const FLOWERS = ['#f48cac', '#fadc5a', '#fafaf0', '#b896e8'].map((c) => new Color(c));
const ROCK = ['#9a9284', '#8d8578', '#a8a092'].map((c) => new Color(c));

function canopyLeafy(): BufferGeometry {
  const a = new IcosahedronGeometry(0.42, 0);
  a.scale(1, 0.9, 1);
  a.translate(0, 0.78, 0);
  const b = new IcosahedronGeometry(0.28, 0);
  b.translate(0.2, 0.62, 0.12);
  return mergeGeometries([a, b])!;
}
function canopyPine(): BufferGeometry {
  const parts = [
    [0.4, 0.5, 0.45],
    [0.31, 0.44, 0.78],
    [0.2, 0.38, 1.06],
  ].map(([r, h, y]) => {
    const c = new ConeGeometry(r, h, 7);
    c.translate(0, y!, 0);
    return c.toNonIndexed();
  });
  return mergeGeometries(parts)!;
}
function canopyBush(): BufferGeometry {
  const d = new DodecahedronGeometry(0.3, 0);
  d.scale(1.15, 0.85, 1.15);
  d.translate(0, 0.3, 0);
  return d;
}
function trunk(h: number): BufferGeometry {
  const c = new CylinderGeometry(0.055, 0.08, h, 5);
  c.translate(0, h / 2, 0);
  return c;
}

interface Kind {
  canopy: InstancedMesh;
  trunk: InstancedMesh;
  /** Far-away version: a simple canopy, no trunk. */
  far: InstancedMesh;
}

/** Trees further than this from the camera (horizontally) use the simple model. */
const LOD_DIST = 28;

function farCanopy(kind: number): BufferGeometry {
  if (kind === 1) return new ConeGeometry(0.36, 1.0, 5).translate(0, 0.62, 0);
  const g = new OctahedronGeometry(kind === 0 ? 0.42 : 0.3, 0);
  return kind === 0 ? g.scale(1, 0.95, 1).translate(0, 0.72, 0) : g.scale(1.1, 0.8, 1.1).translate(0, 0.3, 0);
}

const m4 = new Matrix4(), q4 = new Quaternion(), v3 = new Vector3(), s3 = new Vector3(), up = new Vector3(0, 1, 0);

/**
 * Trees, flowers and rocks as instanced meshes. Instances are laid out at their chunk's
 * nearest image to the camera focus (the same rule as the terrain), and only re-laid when
 * that layout changes, the flora changes or the season turns.
 */
export class Flora {
  private kinds: Kind[] = [];
  private flowers: InstancedMesh;
  private rocks: InstancedMesh;
  private layoutKey = '';
  private dirty = true;
  private season = -1;

  constructor(private S: State, scene: Scene, private q: Quality) {
    const cap = (N * N) / 3;
    const leafMat = worldMat(new MeshLambertMaterial({ flatShading: true }));
    const barkMat = worldMat(new MeshLambertMaterial({ color: '#7a4b2a', flatShading: true }));
    const trunks = [trunk(0.5), trunk(0.3), trunk(0.12)];
    [canopyLeafy(), canopyPine(), canopyBush()].forEach((g, i) => {
      const canopy = new InstancedMesh(g, leafMat, cap);
      const tr = new InstancedMesh(trunks[i]!, barkMat, cap);
      const far = new InstancedMesh(farCanopy(i), leafMat, cap);
      for (const m of [canopy, tr, far]) {
        m.frustumCulled = false;
        m.receiveShadow = true;
        castsShadow(m);
        m.count = 0;
        scene.add(m);
      }
      this.kinds.push({ canopy, trunk: tr, far });
    });
    this.flowers = new InstancedMesh(new OctahedronGeometry(0.07, 0), worldMat(new MeshLambertMaterial()), N * N);
    this.rocks = new InstancedMesh(new DodecahedronGeometry(0.22, 0), worldMat(new MeshLambertMaterial({ flatShading: true })), N * N / 4);
    for (const m of [this.flowers, this.rocks]) {
      m.frustumCulled = false;
      m.receiveShadow = true;
      m.count = 0;
      scene.add(m);
    }
    castsShadow(this.rocks);
  }

  setState(S: State): void {
    this.S = S;
    this.dirty = true;
  }

  markDirty(): void {
    this.dirty = true;
  }

  setSeason(se: number): void {
    if (se !== this.season) {
      this.season = se;
      this.dirty = true;
    }
  }

  /**
   * Lay out the instances in visible chunks. Re-laid only when the chunk images flip (the
   * focus crosses a line at 8 + 16k), the visible set changes, the camera moves to another
   * LOD cell, or the flora or season changes.
   */
  update(fx: number, fz: number, vis: Uint8Array, camX: number, camZ: number): void {
    let mask = '';
    for (let i = 0; i < vis.length; i += 16) {
      let w = 0;
      for (let j = 0; j < 16; j++) w = (w << 1) | (vis[i + j] ? 1 : 0);
      mask += w.toString(36) + '.';
    }
    const key = `${Math.floor((fx - CHUNK / 2) / CHUNK)},${Math.floor((fz - CHUNK / 2) / CHUNK)}|${mask}|${Math.round(camX / 4)},${Math.round(camZ / 4)}`;
    if (!this.dirty && key === this.layoutKey) return;
    this.dirty = false;
    this.layoutKey = key;
    this.rebuild(fx, fz, vis, camX, camZ);
  }

  private rebuild(fx: number, fz: number, vis: Uint8Array, camX: number, camZ: number): void {
    const S = this.S, se = Math.max(0, this.season);
    const counts = [0, 0, 0], farCounts = [0, 0, 0];
    let nf = 0, nr = 0;
    const half = CHUNK / 2;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const t = idx(x, y), tree = S.tree[t]!, flower = S.flower[t]!, rock = S.rock[t]!;
        if (!tree && !flower && !rock) continue;
        if (!vis[((y / CHUNK) | 0) * CHUNKS + ((x / CHUNK) | 0)]) continue;
        // place with the tile's chunk, exactly as the terrain does
        const ccx = x - (x % CHUNK) + half, ccz = y - (y % CHUNK) + half;
        const ox = fx + wd(fx, ccx) - ccx, oz = fz + wd(fz, ccz) - ccz;
        const h = hash2(x, y);
        if (tree) {
          const k = tree - 1, K = this.kinds[k]!;
          const px = x + 0.5 + ((h % 37) / 37 - 0.5) * 0.36, pz = y + 0.5 + (((h >>> 6) % 37) / 37 - 0.5) * 0.36;
          const sc = 0.85 + ((h >>> 12) % 31) / 100;
          q4.setFromAxisAngle(up, ((h >>> 3) % 628) / 100);
          m4.compose(v3.set(ox + px, surfaceY(S, px, pz) - 0.04, oz + pz), q4, s3.set(sc, sc * (0.92 + ((h >>> 17) % 17) / 100), sc));
          const pal = k === 1 ? PINE[se]! : LEAF[se]!;
          // blossom (index 3 of spring) is rare
          const ci = k !== 1 && se === 0 ? ((h >>> 9) % 23 === 0 ? 3 : (h >>> 9) % 3) : (h >>> 9) % pal.length;
          if (Math.hypot(ox + px - camX, oz + pz - camZ) > LOD_DIST) {
            const i = farCounts[k]!++;
            K.far.setMatrixAt(i, m4);
            K.far.setColorAt(i, pal[ci]!);
          } else {
            const i = counts[k]!++;
            K.canopy.setMatrixAt(i, m4);
            K.trunk.setMatrixAt(i, m4);
            K.canopy.setColorAt(i, pal[ci]!);
          }
        }
        if (flower && se !== 3 && ((h >>> 20) % 100) / 100 < this.q.flowers) {
          for (let j = 0; j < 3; j++) {
            const hj = hash2(x * 7 + j, y * 13 + j * 3);
            const px = x + 0.2 + ((hj % 61) / 61) * 0.6, pz = y + 0.2 + (((hj >>> 7) % 61) / 61) * 0.6;
            m4.makeTranslation(ox + px, surfaceY(S, px, pz) + 0.05, oz + pz);
            this.flowers.setMatrixAt(nf, m4);
            this.flowers.setColorAt(nf, FLOWERS[(flower - 1 + (j >> 1)) % 4]!);
            nf++;
          }
        }
        if (rock) {
          const sc = 0.7 + rock * 0.35;
          const px = x + 0.5 + ((h % 29) / 29 - 0.5) * 0.3, pz = y + 0.5 + (((h >>> 5) % 29) / 29 - 0.5) * 0.3;
          q4.setFromAxisAngle(v3.set(((h >>> 2) % 7) - 3, 4, ((h >>> 4) % 7) - 3).normalize(), ((h >>> 8) % 628) / 100);
          m4.compose(v3.set(ox + px, surfaceY(S, px, pz) + 0.05 * sc, oz + pz), q4, s3.set(sc * 1.2, sc * (0.65 + ((h >>> 14) % 30) / 100), sc));
          this.rocks.setMatrixAt(nr, m4);
          this.rocks.setColorAt(nr, se === 3 ? ROCK[2]! : ROCK[h % 3]!);
          nr++;
        }
      }
    this.kinds.forEach((K, k) => {
      for (const m of [K.canopy, K.trunk]) {
        m.count = counts[k]!;
        m.instanceMatrix.needsUpdate = true;
      }
      K.far.count = farCounts[k]!;
      K.far.instanceMatrix.needsUpdate = true;
      for (const m of [K.canopy, K.far]) if (m.instanceColor) m.instanceColor.needsUpdate = true;
    });
    this.flowers.count = nf;
    this.rocks.count = nr;
    for (const m of [this.flowers, this.rocks]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}
