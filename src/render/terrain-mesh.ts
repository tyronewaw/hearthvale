import { BufferAttribute, BufferGeometry, Color, Group, Mesh, MeshLambertMaterial, SRGBColorSpace } from 'three';
import { hash2 } from '../sim/rng';
import { CHUNK, CHUNKS, idx, wd, type State } from '../sim/world';
import { worldMat } from './materials';
import { yOf } from './scale';

type RGB = readonly [number, number, number];

interface Palette {
  sand: RGB;
  meadow: RGB; // flat land: where homes and fields can go
  g1: RGB;
  g2: RGB;
  g3: RGB;
  rock: RGB;
  snow: RGB;
  seabed: RGB;
}

/**
 * One palette per season (spring, summer, autumn, winter), after the prototype's `pal(s)`
 * but spread further apart so height reads clearly in 3D.
 */
const PALS: readonly Palette[] = [
  { sand: [232, 206, 148], meadow: [168, 214, 108], g1: [128, 196, 92], g2: [96, 166, 78], g3: [86, 134, 82], rock: [150, 136, 120], snow: [247, 249, 255], seabed: [96, 150, 150] },
  { sand: [236, 208, 146], meadow: [176, 206, 96], g1: [116, 182, 74], g2: [88, 152, 66], g3: [80, 124, 72], rock: [150, 136, 120], snow: [247, 249, 255], seabed: [96, 150, 150] },
  { sand: [228, 200, 146], meadow: [208, 190, 104], g1: [194, 172, 94], g2: [170, 146, 80], g3: [150, 114, 76], rock: [146, 130, 116], snow: [247, 249, 255], seabed: [96, 146, 146] },
  { sand: [222, 214, 198], meadow: [240, 244, 250], g1: [232, 238, 246], g2: [220, 228, 240], g3: [206, 214, 230], rock: [190, 196, 212], snow: [250, 252, 255], seabed: [92, 140, 150] },
];

const TRIS_PER_CHUNK = CHUNK * CHUNK * 2;
const VERTS_PER_CHUNK = TRIS_PER_CHUNK * 3;
const tmp = new Color();

function triColour(PAL: Palette, ha: number, hb: number, hc: number): RGB {
  if (!(ha | hb | hc)) return PAL.seabed;
  if (!ha || !hb || !hc) return PAL.sand;
  const av = (ha + hb + hc) / 3;
  if (ha === hb && hb === hc && av < 6.4) return PAL.meadow;
  return av < 2.4 ? PAL.g1 : av < 4.4 ? PAL.g2 : av < 6.4 ? PAL.g3 : av < 8 ? PAL.rock : PAL.snow;
}

/**
 * The planet's ground: CHUNKS×CHUNKS meshes of CHUNK×CHUNK tiles, flat-shaded with one
 * colour per triangle. Each chunk is drawn at its nearest image to the camera focus, so the
 * world wraps seamlessly in both directions.
 */
export class TerrainMesh {
  readonly group = new Group();
  readonly material = worldMat(new MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  private chunks: Mesh[] = [];
  /** Lowest and highest world y in each chunk (for culling). */
  readonly yMin = new Float32Array(CHUNKS * CHUNKS);
  readonly yMax = new Float32Array(CHUNKS * CHUNKS);
  private pal: Palette = PALS[0]!;

  constructor(private S: State) {
    this.group.name = 'terrain';
    for (let c = 0; c < CHUNKS * CHUNKS; c++) {
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array(VERTS_PER_CHUNK * 3), 3));
      g.setAttribute('normal', new BufferAttribute(new Float32Array(VERTS_PER_CHUNK * 3), 3));
      g.setAttribute('color', new BufferAttribute(new Float32Array(VERTS_PER_CHUNK * 3), 3));
      const m = new Mesh(g, this.material);
      m.matrixAutoUpdate = false;
      // Receive only: casting would redraw all 64 chunks in every shadow pass, and the
      // faceted shading already shows the relief.
      m.receiveShadow = true;
      // The bend moves far geometry down into view, so unbent bounds would cull it wrongly.
      m.frustumCulled = false;
      m.userData.chunk = c;
      this.chunks.push(m);
      this.group.add(m);
      this.rebuild(c);
    }
  }

  setState(S: State): void {
    this.S = S;
    this.rebuildAll();
  }

  /** Recolour for a season (0 spring … 3 winter). */
  setSeason(se: number): void {
    const p = PALS[se] ?? PALS[0]!;
    if (p === this.pal) return;
    this.pal = p;
    this.rebuildAll();
  }

  rebuildAll(): void {
    for (let c = 0; c < this.chunks.length; c++) this.rebuild(c);
  }

  /** Rewrite one chunk's vertices from the heightmap. */
  rebuild(c: number): void {
    const mesh = this.chunks[c]!, g = mesh.geometry;
    const pos = g.getAttribute('position') as BufferAttribute;
    const nor = g.getAttribute('normal') as BufferAttribute;
    const col = g.getAttribute('color') as BufferAttribute;
    const P = pos.array as Float32Array, NR = nor.array as Float32Array, C = col.array as Float32Array;
    const cx = (c % CHUNKS) * CHUNK, cz = ((c / CHUNKS) | 0) * CHUNK, H = this.S.h;
    let o = 0;
    const put = (lx: number, h: number, lz: number) => {
      P[o] = lx;
      P[o + 1] = yOf(h);
      P[o + 2] = lz;
      o += 3;
    };
    const tri = (x: number, z: number, h: number[], order: readonly [number, number, number], salt: number) => {
      const start = o;
      for (const k of order) put(x + (k === 1 || k === 2 ? 1 : 0), h[k]!, z + (k >= 2 ? 1 : 0));
      // face normal
      const ax = P[start]!, ay = P[start + 1]!, az = P[start + 2]!;
      const ux = P[start + 3]! - ax, uy = P[start + 4]! - ay, uz = P[start + 5]! - az;
      const vx = P[start + 6]! - ax, vy = P[start + 7]! - ay, vz = P[start + 8]! - az;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      const rgb = triColour(this.pal, h[order[0]]!, h[order[1]]!, h[order[2]]!);
      // A little per-face variation keeps the low-poly look hand-made, not noisy.
      const q = hash2(cx + x + salt * 7919, cz + z) % 17;
      const m = q === 0 ? 0.95 : q === 1 ? 1.04 : 1;
      tmp.setRGB((rgb[0] * m) / 255, (rgb[1] * m) / 255, (rgb[2] * m) / 255, SRGBColorSpace);
      for (let i = 0; i < 3; i++) {
        NR[start + i * 3] = nx;
        NR[start + i * 3 + 1] = ny;
        NR[start + i * 3 + 2] = nz;
        C[start + i * 3] = tmp.r;
        C[start + i * 3 + 1] = tmp.g;
        C[start + i * 3 + 2] = tmp.b;
      }
    };
    const h = [0, 0, 0, 0];
    for (let z = 0; z < CHUNK; z++)
      for (let x = 0; x < CHUNK; x++) {
        const tx = cx + x, tz = cz + z;
        // corners: 0 = (x,z)  1 = (x+1,z)  2 = (x+1,z+1)  3 = (x,z+1)
        h[0] = H[idx(tx, tz)]!;
        h[1] = H[idx(tx + 1, tz)]!;
        h[2] = H[idx(tx + 1, tz + 1)]!;
        h[3] = H[idx(tx, tz + 1)]!;
        // Split along B–D, (x+1,z)→(x,z+1), the same diagonal Rapier's heightfield uses,
        // so physics bodies rest exactly on the drawn surface. Counter-clockwise from above.
        tri(x, z, h, [0, 3, 1], 0);
        tri(x, z, h, [1, 3, 2], 1);
      }
    let lo = 1e9, hi = -1e9;
    for (let i = 1; i < P.length; i += 3) {
      if (P[i]! < lo) lo = P[i]!;
      if (P[i]! > hi) hi = P[i]!;
    }
    this.yMin[c] = lo;
    this.yMax[c] = hi;
    pos.needsUpdate = nor.needsUpdate = col.needsUpdate = true;
    g.computeBoundingSphere();
    g.computeBoundingBox();
  }

  /** Place every chunk at its nearest image to the focus (fx, fz in [0, N)); hide culled ones. */
  place(fx: number, fz: number, vis?: Uint8Array): void {
    for (const m of this.chunks) {
      const c = m.userData.chunk as number;
      m.visible = !vis || !!vis[c];
      const cx = (c % CHUNKS) * CHUNK, cz = ((c / CHUNKS) | 0) * CHUNK, half = CHUNK / 2;
      const ox = fx + wd(fx, cx + half) - half, oz = fz + wd(fz, cz + half) - half;
      if (m.position.x !== ox || m.position.z !== oz) {
        m.position.set(ox, 0, oz);
        m.updateMatrix();
      }
    }
  }
}

