import { BufferAttribute, BufferGeometry, Color, Group, Mesh, MeshLambertMaterial, SRGBColorSpace } from 'three';
import { hash2 } from '../sim/rng';
import { CHUNK, CHUNKS, N, idx, wd, type State } from '../sim/world';
import { extendShader, worldMat } from './materials';
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
  { sand: [226, 202, 150], meadow: [160, 196, 104], g1: [118, 172, 84], g2: [92, 146, 70], g3: [86, 122, 74], rock: [138, 122, 104], snow: [242, 244, 250], seabed: [92, 140, 136] },
  { sand: [230, 204, 146], meadow: [170, 190, 94], g1: [112, 160, 70], g2: [88, 136, 62], g3: [80, 114, 66], rock: [140, 122, 102], snow: [242, 244, 250], seabed: [92, 140, 136] },
  { sand: [222, 196, 146], meadow: [198, 176, 100], g1: [182, 158, 88], g2: [160, 132, 76], g3: [138, 104, 72], rock: [134, 116, 102], snow: [242, 244, 250], seabed: [92, 136, 136] },
  { sand: [218, 210, 196], meadow: [236, 240, 246], g1: [226, 232, 242], g2: [214, 222, 236], g3: [200, 208, 226], rock: [150, 146, 150], snow: [248, 250, 255], seabed: [90, 132, 142] },
];

const TRIS_PER_CHUNK = CHUNK * CHUNK * 2;
const VERTS_PER_CHUNK = TRIS_PER_CHUNK * 3;
const tmp = new Color();

/** Grass, hill, rock and snow blend smoothly with height, so slopes read as rolling hills. */
function heightColour(PAL: Palette, h: number, out: number[]): void {
  const keys: [number, RGB][] = [[1, PAL.g1], [3, PAL.g2], [5.4, PAL.g3], [7.2, PAL.rock], [8.4, PAL.snow]];
  let a = keys[0]!, b = keys[0]!;
  for (const k of keys) {
    if (k[0] <= h) a = k;
    if (k[0] >= h) { b = k; break; }
    b = k;
  }
  const t = b[0] === a[0] ? 0 : (h - a[0]) / (b[0] - a[0]);
  for (let i = 0; i < 3; i++) out[i] = a[1][i]! + (b[1][i]! - a[1][i]!) * t;
}

/**
 * One corner's colour. Shores are sand (the sea-floor corners next to land, and the land
 * corners next to sea), the open sea floor is seabed, and land blends by height towards
 * the lighter meadow by how many of the corner's four tiles are flat (where homes fit).
 */
function cornerColour(PAL: Palette, H: Uint8Array | Int8Array | number[], x: number, z: number, out: number[]): void {
  const h = H[idx(x, z)]!;
  let wet = 0, dry = 0;
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++) {
      if (H[idx(x + dx, z + dz)]! > 0) dry++;
      else wet++;
    }
  if (h === 0 || (h === 1 && wet)) {
    const c = h === 0 && !dry ? PAL.seabed : PAL.sand;
    out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
    return;
  }
  heightColour(PAL, h, out);
  let flat = 0;
  for (const [ox, oz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]] as const) {
    const a = H[idx(x + ox, z + oz)]!;
    if (a > 0 && a < 6.4 && a === H[idx(x + ox + 1, z + oz)] && a === H[idx(x + ox, z + oz + 1)] && a === H[idx(x + ox + 1, z + oz + 1)]) flat++;
  }
  const f = (flat / 4) * 0.8;
  for (let i = 0; i < 3; i++) out[i] = out[i]! + (PAL.meadow[i]! - out[i]!) * f;
}

/**
 * Painted-landscape shading on the GPU: soft patches of warmer and cooler grass, brush
 * strokes, speckle, and bare earth and rock on steep slopes. All of it is periodic in the
 * planet's size, so the wrap seam never shows.
 */
function painterly(m: MeshLambertMaterial, rock: { value: Color }): MeshLambertMaterial {
  return extendShader(m, 'painterly', (sh) => {
    sh.uniforms.uRock = rock;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 tc;\nvarying vec2 vTc;\nvarying float vUp;\nvarying float vY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTc = tc;\nvUp = normal.y;\nvY = position.y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec2 vTc;
varying float vUp;
varying float vY;
uniform vec3 uRock;
float tHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// value noise whose lattice repeats every 'per' cells
float tNoise(vec2 p, vec2 per) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  float a = tHash(mod(i, per)), b = tHash(mod(i + vec2(1.0, 0.0), per));
  float c = tHash(mod(i + vec2(0.0, 1.0), per)), d = tHash(mod(i + vec2(1.0, 1.0), per));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  const float W = ${N}.0;
  vec2 p = vTc;
  float big = tNoise(p / 16.0, vec2(W / 16.0)) * 0.65 + tNoise(p / 8.0, vec2(W / 8.0)) * 0.35;
  float mid = tNoise(p, vec2(W));
  // brush strokes: noise stretched along x or z, the direction changing in patches
  float sx = tNoise(vec2(p.x * 1.5, p.y * 6.0), vec2(W * 1.5, W * 6.0));
  float sz = tNoise(vec2(p.x * 6.0, p.y * 1.5), vec2(W * 6.0, W * 1.5));
  float dirMix = smoothstep(0.35, 0.65, tNoise(p / 4.0 + 3.0, vec2(W / 4.0)));
  float stroke = mix(sx, sz, dirMix);
  float speck = tNoise(p * 7.0, vec2(W * 7.0));
  vec3 c = diffuseColor.rgb;
  c *= mix(vec3(0.86, 0.94, 1.0), vec3(1.1, 1.04, 0.86), big);   // cool and warm patches
  c *= 0.9 + 0.16 * mid;
  c *= 0.91 + 0.18 * stroke;
  c *= 1.0 - 0.14 * smoothstep(0.7, 0.95, speck);                // dark tufts
  // steep ground shows earth, then rock (never on the beach or the sea floor)
  float land = smoothstep(0.25, 0.9, vY);
  float steep = (1.0 - vUp) + (stroke - 0.5) * 0.08;
  c = mix(c, uRock * vec3(1.06, 0.98, 0.86), land * smoothstep(0.13, 0.2, steep) * 0.45);
  c = mix(c, uRock * (0.9 + 0.2 * mid), land * smoothstep(0.2, 0.3, steep) * 0.85);
  diffuseColor.rgb = c;
}`);
  });
}

/**
 * The planet's ground: CHUNKS×CHUNKS meshes of CHUNK×CHUNK tiles. Smooth-shaded rolling
 * land with colours blended by height and a painted texture on top; flat tiles keep their
 * lighter meadow colour so you can see where homes fit. Each chunk is drawn at its nearest
 * image to the camera focus, so the world wraps seamlessly in both directions.
 */
export class TerrainMesh {
  readonly group = new Group();
  private rock = { value: new Color() };
  readonly material = painterly(worldMat(new MeshLambertMaterial({ vertexColors: true })), this.rock);
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
      g.setAttribute('tc', new BufferAttribute(new Float32Array(VERTS_PER_CHUNK * 2), 2));
      const m = new Mesh(g, this.material);
      m.matrixAutoUpdate = false;
      // Receive only: casting would redraw all 64 chunks in every shadow pass, and the
      // shading already shows the relief.
      m.receiveShadow = true;
      // The bend moves far geometry down into view, so unbent bounds would cull it wrongly.
      m.frustumCulled = false;
      m.userData.chunk = c;
      this.chunks.push(m);
      this.group.add(m);
      this.rebuild(c);
    }
    const r = this.pal.rock;
    this.rock.value.setRGB(r[0] / 255, r[1] / 255, r[2] / 255, SRGBColorSpace);
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
    this.rock.value.setRGB(p.rock[0] / 255, p.rock[1] / 255, p.rock[2] / 255, SRGBColorSpace);
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
    const tca = g.getAttribute('tc') as BufferAttribute;
    const P = pos.array as Float32Array, NR = nor.array as Float32Array, C = col.array as Float32Array, T = tca.array as Float32Array;
    const cx = (c % CHUNKS) * CHUNK, cz = ((c / CHUNKS) | 0) * CHUNK, H = this.S.h;
    const Y = (x: number, z: number) => yOf(H[idx(x, z)]!);
    const vc = [0, 0, 0];
    let o = 0, t = 0;
    const tri = (x: number, z: number, h: number[], order: readonly [number, number, number], salt: number) => {
      // A little per-face variation keeps it hand-made.
      const q = hash2(cx + x + salt * 7919, cz + z) % 17;
      const m = q === 0 ? 0.96 : q === 1 ? 1.03 : 1;
      for (const k of order) {
        const vx = x + (k === 1 || k === 2 ? 1 : 0), vz = z + (k >= 2 ? 1 : 0), wx = cx + vx, wz = cz + vz;
        P[o] = vx;
        P[o + 1] = yOf(h[k]!);
        P[o + 2] = vz;
        // smooth normal from the heights around this corner
        let nx = (Y(wx - 1, wz) - Y(wx + 1, wz)) * 0.5, nz = (Y(wx, wz - 1) - Y(wx, wz + 1)) * 0.5;
        const l = Math.hypot(nx, 1, nz);
        nx /= l;
        NR[o] = nx;
        NR[o + 1] = 1 / l;
        NR[o + 2] = nz / l;
        cornerColour(this.pal, H, wx, wz, vc);
        tmp.setRGB((vc[0]! * m) / 255, (vc[1]! * m) / 255, (vc[2]! * m) / 255, SRGBColorSpace);
        C[o] = tmp.r;
        C[o + 1] = tmp.g;
        C[o + 2] = tmp.b;
        T[t] = wx;
        T[t + 1] = wz;
        o += 3;
        t += 2;
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
    pos.needsUpdate = nor.needsUpdate = col.needsUpdate = tca.needsUpdate = true;
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

