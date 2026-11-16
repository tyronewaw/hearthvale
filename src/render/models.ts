import {
  BoxGeometry, ConeGeometry, CylinderGeometry, DodecahedronGeometry, Euler, OctahedronGeometry, Quaternion, Vector3, type BufferGeometry,
} from 'three';
import type { StructKind } from '../sim/defs';
import { Kit, type FaceColour, type Place } from './kit';

/** Colours from the prototype's hut sprites. */
const THATCH = ['#ecca72', '#d4a64a', '#a9792e'];
const THATCH2 = ['#e2b25c', '#c38d3a', '#916224'];
const WATTLE = ['#b98d5c', '#9b7147', '#77522f'];
const POLE = '#6b4426', DOOR = '#3a2418', STONE = '#9a9284', STONE2 = '#b3ab9c', WOOD = '#8a5a30', LOG_END = '#e0bc88';
/** Our tribe is blue (the user's choice): flags and trims use the prototype's TRIBE blues. */
export const TRIBE_BLUE = ['#3f6fc4', '#3566b0', '#4a7fd6', '#2f5ea8'];
/** The Red tribe wears terracotta (the user's choice). */
export const TRIBE_RED = ['#c4573f', '#b04a35', '#d6694d', '#a8442f'];


/** A model plus the spots that light up at night and where smoke and fire come from. */
export interface Model {
  /** One merged geometry; parts added with tint (paint, cloth, flags) take the tribe's colour. */
  geo: BufferGeometry;
  /** Where a shrine's crystal floats (model space). */
  crystal?: [number, number, number];
  /** Door/window glow quads in model space: [x, y, z, yaw, width, height]. */
  glows: [number, number, number, number, number, number][];
  /** Chimney smoke origin (model space). */
  smoke: [number, number, number] | null;
  fire: [number, number, number] | null;
  /** Rough footprint radius, for scaffolding and picking. */
  r: number;
  /** Total height, for tooltips and picking. */
  h: number;
}

const TIMBER = '#7a4e2a', TIMBER2 = '#5e3b1e', ROPE = '#5a3c22', CLAY = '#b8673e', CLAY2 = '#9a5232', ASH = '#4a3a30';
const HIDE = ['#eed8aa', '#d8b984', '#ad8a5c'];
/** Parts built in white go into a model's tint geometry and take the tribe's colour per instance. */
const PAINT = '#ffffff', CLOTH = '#d9d9d9';

/** A model being built: `k` adds ordinary parts, `t` adds tint parts (white, coloured per tribe). */
class Two {
  k = new Kit();
  t = { add: (g: BufferGeometry, c: FaceColour, at: Place = {}) => this.k.add(g, c, at, true) };
  build(): { geo: BufferGeometry } {
    return { geo: this.k.build() };
  }
}

/** A low ring of stones the walls stand on. */
function plinth(k: Kit, r: number, at: [number, number, number], sx = 1, seg = 12): void {
  k.add(new CylinderGeometry(r * 1.06, r * 1.12, 0.07, seg), (f) => (f % 3 === 0 ? STONE : f % 3 === 1 ? STONE2 : '#8a8274'), { pos: [at[0], at[1] + 0.035, at[2]], scale: [sx, 1, 1] });
}

/** A timber post with a carved, painted cap (the cap is tribe-coloured). */
function carvedPost(m: Two, x: number, z: number, h: number, at: [number, number, number] = [0, 0, 0]): void {
  m.k.add(new BoxGeometry(0.05, h, 0.05), (f) => (f % 4 < 2 ? TIMBER : TIMBER2), { pos: [at[0] + x, at[1] + h / 2, at[2] + z] });
  m.k.add(new BoxGeometry(0.075, 0.05, 0.075), TIMBER2, { pos: [at[0] + x, at[1] + h * 0.62, at[2] + z] });
  m.t.add(new OctahedronGeometry(0.05, 0), PAINT, { pos: [at[0] + x, at[1] + h + 0.03, at[2] + z], scale: [1, 1.3, 1] });
}

/** A pole with a tribe-coloured banner. */
function banner(m: Two, x: number, z: number, h: number, w = 0.2): void {
  m.k.add(new CylinderGeometry(0.016, 0.018, h, 5), TIMBER2, { pos: [x, h / 2, z] });
  m.t.add(new BoxGeometry(w, w * 0.62, 0.012), PAINT, { pos: [x + w / 2 + 0.01, h - w * 0.36, z] });
  m.t.add(new ConeGeometry(0.025, 0.06, 4), CLOTH, { pos: [x, h + 0.03, z] });
}

interface HutOpts {
  roof?: string[];
  /** Posts round the wall. */
  posts?: number;
  /** Rope bands binding the thatch. */
  ropes?: number;
  /** Stretch along x (a longhouse). */
  sx?: number;
  /** A second, smaller roof tier on a drum (a great lodge). */
  tier?: boolean;
  /** Far-away version: walls, roof and the tribe's colours only. */
  lod?: boolean;
}

/**
 * A round hut on a stone plinth: wattle walls with timber posts and a tribe-coloured painted
 * band, a conical thatch bound with rope, a painted top knot and a door with a timber frame and
 * a tribe-coloured hide curtain. Door faces +z. Returns the door's glow quad.
 */
function hut(m: Two, r: number, wallH: number, roofH: number, at: [number, number, number] = [0, 0, 0], o: HutOpts = {}): Model['glows'][number] {
  const k = m.k, t = m.t, roof = o.roof ?? THATCH, sx = o.sx ?? 1, lod = !!o.lod, seg = lod ? 7 : Math.max(9, Math.round(r * 20));
  const S3: [number, number, number] = [sx, 1, 1];
  if (!lod) plinth(k, r, at, sx, seg);
  const y0 = at[1] + 0.06;
  k.add(new CylinderGeometry(r * 0.97, r, wallH, seg, 1, true), (f) => {
    const s = Math.floor(f / 2);
    return s % 3 === 0 ? WATTLE[2]! : s % 3 === 1 ? WATTLE[1]! : WATTLE[0]!;
  }, { pos: [at[0], y0 + wallH / 2, at[2]], scale: S3 });
  // painted band round the wall
  t.add(new CylinderGeometry(r * 0.985 + 0.006, r * 0.99 + 0.006, wallH * 0.28, seg, 1, true), PAINT, { pos: [at[0], y0 + wallH * 0.6, at[2]], scale: S3 });
  // timber posts, leaving the doorway clear
  const posts = lod ? 0 : o.posts ?? 4;
  for (let i = 0; i < posts; i++) {
    const a = (i / posts) * Math.PI * 2 + Math.PI / posts + Math.PI / 2;
    k.add(new BoxGeometry(0.04, wallH + 0.04, 0.04), TIMBER2, { pos: [at[0] + Math.cos(a) * r * sx, y0 + wallH / 2, at[2] + Math.sin(a) * r] });
  }
  // thatch
  const top = y0 + wallH, rr = r * 1.32;
  k.add(new ConeGeometry(rr, roofH, seg, lod ? 1 : 2), (_f, _n, c: Vector3) => {
    const tt = (c.y - top) / roofH;
    return tt < 0.16 ? roof[2]! : Math.floor(tt * 6) % 2 ? roof[0]! : roof[1]!;
  }, { pos: [at[0], top + roofH / 2 - 0.02, at[2]], scale: S3 });
  // a band of dyed thatch just above the eave: the tribe's colour, readable from afar
  {
    const f0 = 0.16, f1 = 0.3, ra = rr * (1 - f0) + 0.01, rb = rr * (1 - f1) + 0.01;
    t.add(new CylinderGeometry(rb, ra, roofH * (f1 - f0), seg, 1, true), PAINT, { pos: [at[0], top + roofH * (f0 + f1) / 2 - 0.02, at[2]], scale: S3 });
  }
  const ropes = lod ? 0 : o.ropes ?? 2;
  for (let i = 1; i <= ropes; i++) {
    const f = i / (ropes + 1.4), y = top + roofH * f - 0.02, rad = rr * (1 - f) + 0.008;
    k.add(new CylinderGeometry(rad - 0.012, rad + 0.004, 0.024, seg, 1, true), ROPE, { pos: [at[0], y, at[2]], scale: S3 });
  }
  let apex = top + roofH - 0.02;
  if (o.tier) {
    // a drum and a second, smaller roof above the first
    const r2 = r * 0.42, h2 = roofH * 0.5, d = roofH * 0.55;
    k.add(new CylinderGeometry(r2, r2, d, seg, 1, true), (f) => (f % 2 ? WATTLE[0]! : TIMBER), { pos: [at[0], top + roofH * 0.6 + d / 2, at[2]] });
    k.add(new ConeGeometry(r2 * 1.5, h2, seg, 2), (f) => (f % 3 ? roof[0]! : roof[1]!), { pos: [at[0], top + roofH * 0.6 + d + h2 / 2, at[2]] });
    apex = top + roofH * 0.6 + d + h2;
  }
  // top knot: rope binding and a painted finial
  if (!lod) k.add(new CylinderGeometry(0.03, 0.045, 0.06, 6), ROPE, { pos: [at[0], apex - 0.01, at[2]] });
  k.add(new CylinderGeometry(0.012, 0.012, 0.3, 3), TIMBER2, { pos: [at[0], apex + 0.14, at[2]] });
  t.add(new ConeGeometry(0.05, 0.12, 5), PAINT, { pos: [at[0], apex + 0.06, at[2]] });
  if (r >= 0.25) t.add(new BoxGeometry(0.16, 0.1, 0.012), PAINT, { pos: [at[0] + 0.085, apex + 0.24, at[2]] }); // a little flag
  // door: timber frame and a hide curtain
  const dw = r * 0.42, dh = wallH * 0.8, dz = at[2] + r * 0.99;
  if (lod) {
    k.add(new BoxGeometry(dw, dh, 0.02), DOOR, { pos: [at[0], y0 + dh / 2, dz - 0.005] });
    return [at[0], y0 + dh / 2, dz + 0.014, 0, dw * 0.5, dh * 0.85];
  }
  for (const s of [-1, 1]) k.add(new BoxGeometry(0.03, dh + 0.03, 0.03), TIMBER, { pos: [at[0] + s * (dw / 2 + 0.015), y0 + dh / 2, dz + 0.01] });
  k.add(new BoxGeometry(dw + 0.08, 0.035, 0.035), TIMBER, { pos: [at[0], y0 + dh + 0.02, dz + 0.01] });
  k.add(new BoxGeometry(dw, dh, 0.02), DOOR, { pos: [at[0], y0 + dh / 2, dz - 0.005] });
  t.add(new BoxGeometry(dw * 0.5, dh * 0.85, 0.012), CLOTH, { pos: [at[0] - dw * 0.22, y0 + dh * 0.55, dz + 0.012], rot: [0, 0, 0.06] });
  return [at[0] + dw * 0.18, y0 + dh / 2, dz + 0.014, 0, dw * 0.5, dh * 0.85];
}

const qq = new Quaternion(), ee = new Euler(), UPV = new Vector3(0, 1, 0), dd = new Vector3();
/** A square beam from point a to point b. */
function beam(k: Kit, a: [number, number, number], b: [number, number, number], w: number, col: string): void {
  dd.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = dd.length();
  ee.setFromQuaternion(qq.setFromUnitVectors(UPV, dd.normalize()));
  k.add(new BoxGeometry(w, len, w), col, { pos: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], rot: [ee.x, ee.y, ee.z] });
}

function pot(k: Kit, x: number, z: number, s = 1): void {
  k.add(new CylinderGeometry(0.04 * s, 0.03 * s, 0.07 * s, 7), (f) => (f % 2 ? CLAY : CLAY2), { pos: [x, 0.035 * s, z] });
  k.add(new CylinderGeometry(0.025 * s, 0.04 * s, 0.025 * s, 7), CLAY2, { pos: [x, 0.08 * s, z] });
}

function woodpile(k: Kit, x: number, z: number, n = 3, yaw = 0): void {
  for (let r = 0; r < 2; r++)
    for (let i = 0; i < n - r; i++)
      k.add(new CylinderGeometry(0.035, 0.035, 0.26, 6), (f) => (f < 6 ? WOOD : LOG_END), {
        pos: [x + Math.cos(yaw) * (i - (n - r - 1) / 2) * 0.075, 0.035 + r * 0.062, z + Math.sin(yaw) * (i - (n - r - 1) / 2) * 0.075],
        rot: [Math.PI / 2, yaw, 0],
      });
}

function bench(k: Kit, x: number, z: number, yaw: number): void {
  k.add(new CylinderGeometry(0.045, 0.045, 0.32, 6), (f) => (f < 6 ? WOOD : LOG_END), { pos: [x, 0.045, z], rot: [0, yaw, Math.PI / 2] });
}

function tepee(): Model {
  const m = new Two(), k = m.k, H = 0.95, R = 0.36;
  k.add(new ConeGeometry(R, H, 8, 4), (_f, _n, c: Vector3) => (c.x < -0.08 ? HIDE[0]! : c.x < 0.12 ? HIDE[1]! : HIDE[2]!), { pos: [0, H / 2, 0] });
  // a painted band round the hide
  const y = 0.42, rb = R * (1 - y / H) + 0.008, rt = R * (1 - (y + 0.1) / H) + 0.008;
  m.t.add(new CylinderGeometry(rt, rb, 0.1, 8, 1, true), PAINT, { pos: [0, y + 0.05, 0] });
  for (const a of [-0.45, 0.45, 0]) k.add(new CylinderGeometry(0.012, 0.012, 0.35, 4), POLE, { pos: [a * 0.12, H + 0.04, 0], rot: [a * 0.3, 0, a] });
  k.add(new ConeGeometry(0.11, 0.3, 3), DOOR, { pos: [0, 0.15, R * 0.62], rot: [0.35, 0, 0] });
  // a little fire ring out front
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    k.add(new BoxGeometry(0.05, 0.035, 0.05), i % 2 ? STONE : STONE2, { pos: [0.32 + Math.cos(a) * 0.08, 0.018, 0.38 + Math.sin(a) * 0.08], rot: [0, a, 0] });
  }
  k.add(new CylinderGeometry(0.06, 0.06, 0.01, 6), ASH, { pos: [0.32, 0.005, 0.38] });
  return { ...m.build(), glows: [[0, 0.13, R * 0.72, 0, 0.12, 0.2]], smoke: [0.32, 0.08, 0.38], fire: null, r: R, h: H };
}

/**
 * Homes by level: tepee, hut, round hut, big hut, longhouse, great lodge. With lod, the
 * far-away versions: the same huts without the small parts (props, posts, ropes, door frames).
 */
export function homeModels(lod = false): Model[] {
  const out: Model[] = [tepee()];
  const L = { lod };
  {
    const m = new Two(), g = hut(m, 0.3, 0.26, 0.36, [0, 0, 0], L);
    if (!lod) pot(m.k, 0.24, 0.3);
    out.push({ ...m.build(), glows: [g], smoke: [0, 0.75, 0], fire: null, r: 0.4, h: 0.82 });
  }
  {
    const m = new Two(), g = hut(m, 0.4, 0.3, 0.46, [0, 0, 0], { posts: 6, ropes: 3, lod });
    if (!lod) {
      bench(m.k, 0.36, 0.45, 0.2);
      woodpile(m.k, -0.5, 0.05, 3, Math.PI / 2);
      pot(m.k, 0.3, 0.38, 0.9);
    }
    out.push({ ...m.build(), glows: [g], smoke: [0, 0.9, 0], fire: null, r: 0.52, h: 0.96 });
  }
  {
    const m = new Two(), g = hut(m, 0.47, 0.34, 0.56, [0, 0, 0], { posts: 6, ropes: 3, lod }), g2 = hut(m, 0.22, 0.24, 0.3, [-0.6, 0, -0.24], L);
    if (!lod) {
      carvedPost(m, -0.27, 0.62, 0.42);
      carvedPost(m, 0.27, 0.62, 0.42);
      woodpile(m.k, 0.62, -0.1, 3, Math.PI / 2);
      pot(m.k, 0.42, 0.42);
    }
    out.push({ ...m.build(), glows: [g, g2], smoke: [0, 1.06, 0], fire: null, r: 0.75, h: 1.12 });
  }
  {
    const m = new Two(), g = hut(m, 0.5, 0.38, 0.62, [0, 0, 0], { roof: THATCH2, posts: 8, ropes: 3, sx: 1.45, lod });
    const g2 = hut(m, 0.24, 0.26, 0.34, [-0.78, 0, -0.42], L), g3 = hut(m, 0.24, 0.26, 0.34, [0.78, 0, -0.42], L);
    banner(m, -0.9, 0.3, 1.0);
    if (!lod) {
      carvedPost(m, -0.28, 0.66, 0.5);
      carvedPost(m, 0.28, 0.66, 0.5);
      bench(m.k, 0.5, 0.62, 0);
    }
    out.push({ ...m.build(), glows: [g, g2, g3], smoke: [0, 1.12, 0], fire: null, r: 1.0, h: 1.16 });
  }
  {
    const m = new Two(), g = hut(m, 0.64, 0.44, 0.7, [0, 0, 0], { roof: THATCH2, posts: 8, ropes: 3, tier: true, lod });
    const g2 = hut(m, 0.3, 0.28, 0.38, [-0.88, 0, -0.32], L), g3 = hut(m, 0.3, 0.28, 0.38, [0.88, 0, -0.32], L);
    if (!lod) for (const a of [-0.55, 0.55]) carvedPost(m, Math.sin(a) * 0.95, Math.cos(a) * 0.95, 0.62);
    // a totem pole by the door
    m.k.add(new BoxGeometry(0.11, 1.1, 0.11), (f) => (f % 6 < 2 ? TIMBER : f % 6 < 4 ? TIMBER2 : '#3a2418'), { pos: [0.6, 0.55, 0.62] });
    m.k.add(new BoxGeometry(0.34, 0.06, 0.08), TIMBER, { pos: [0.6, 0.98, 0.62] });
    m.t.add(new OctahedronGeometry(0.09, 0), PAINT, { pos: [0.6, 1.18, 0.62] });
    m.t.add(new BoxGeometry(0.13, 0.13, 0.13), PAINT, { pos: [0.6, 0.62, 0.62], scale: [0.95, 0.4, 0.95] });
    banner(m, -0.75, 0.55, 1.25, 0.24);
    banner(m, 0.95, 0.15, 1.25, 0.24);
    out.push({ ...m.build(), glows: [g, g2, g3], smoke: [0, 1.5, 0], fire: null, r: 1.2, h: 1.55 });
  }
  return out;
}

function hearthModel(): Model {
  const m = new Two(), k = m.k;
  // a stone fire pit with an ash bed
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    k.add(new BoxGeometry(0.11, 0.08, 0.09), i % 2 ? STONE : STONE2, { pos: [Math.cos(a) * 0.3, 0.04, Math.sin(a) * 0.3], rot: [0, -a, 0] });
  }
  k.add(new CylinderGeometry(0.25, 0.27, 0.03, 12), ASH, { pos: [0, 0.015, 0] });
  // log benches round the fire
  for (const a of [0.4, 2.0, 3.6, 5.1]) bench(k, Math.cos(a) * 0.62, Math.sin(a) * 0.62, -a + Math.PI / 2);
  // a cooking tripod with a pot
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    beam(k, [Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2], [0, 0.58, 0], 0.022, POLE);
  }
  k.add(new CylinderGeometry(0.075, 0.06, 0.09, 8), '#3a3a3a', { pos: [0, 0.4, 0] });
  // the store: a lean-to with logs, and food baskets
  for (const z of [-0.32, 0.22]) {
    k.add(new BoxGeometry(0.05, 0.44, 0.05), TIMBER2, { pos: [-0.6, 0.22, z] });
    k.add(new BoxGeometry(0.05, 0.16, 0.05), TIMBER2, { pos: [-0.95, 0.08, z] });
  }
  k.add(new BoxGeometry(0.42, 0.04, 0.66), (f) => (f % 4 < 2 ? THATCH[0]! : THATCH[1]!), { pos: [-0.78, 0.3, -0.05], rot: [0, 0, 0.62] });
  woodpile(k, -0.72, -0.05, 4, Math.PI / 2);
  k.add(new CylinderGeometry(0.14, 0.11, 0.16, 8), '#c9a35a', { pos: [0.72, 0.08, 0.3] });
  k.add(new DodecahedronGeometry(0.05, 0), '#d9533c', { pos: [0.69, 0.18, 0.3] });
  k.add(new DodecahedronGeometry(0.05, 0), '#f2b632', { pos: [0.77, 0.18, 0.34] });
  pot(k, 0.82, 0.05, 1.3);
  banner(m, 0.65, -0.62, 1.15, 0.26);
  return { ...m.build(), glows: [], smoke: null, fire: [0, 0.03, 0], r: 0.9, h: 0.5 };
}

function farmModel(): Model {
  const m = new Two(), k = m.k;
  // a granary on stilts
  for (const [x, z] of [[-0.14, -0.22], [0.14, -0.22], [-0.14, 0.06], [0.14, 0.06]]) k.add(new BoxGeometry(0.035, 0.2, 0.035), TIMBER2, { pos: [x!, 0.1, z!] });
  k.add(new BoxGeometry(0.38, 0.03, 0.38), WOOD, { pos: [0, 0.2, -0.08] });
  const g = hut(m, 0.17, 0.18, 0.24, [0, 0.19, -0.08], { posts: 0, ropes: 1 });
  k.add(new BoxGeometry(0.04, 0.24, 0.02), TIMBER, { pos: [0, 0.1, 0.2], rot: [0.45, 0, 0] }); // ladder
  // a fence along the front, a haystack and a hoe
  for (let i = -3; i <= 3; i++) k.add(new BoxGeometry(0.035, 0.18, 0.035), WOOD, { pos: [i * 0.13, 0.09, 0.4] });
  k.add(new BoxGeometry(0.85, 0.025, 0.025), WOOD, { pos: [0, 0.13, 0.4] });
  k.add(new BoxGeometry(0.85, 0.025, 0.025), WOOD, { pos: [0, 0.06, 0.4] });
  k.add(new ConeGeometry(0.14, 0.22, 7), (f) => (f % 2 ? '#e2c071' : '#c9a24a'), { pos: [0.34, 0.11, 0.06] });
  k.add(new BoxGeometry(0.02, 0.3, 0.02), POLE, { pos: [-0.34, 0.15, 0.12], rot: [0, 0, 0.25] });
  return { ...m.build(), glows: [g], smoke: null, fire: null, r: 0.5, h: 0.72 };
}

function lumberModel(): Model {
  const m = new Two(), k = m.k;
  // a lean-to shelter
  for (const x of [-0.32, 0.32]) {
    k.add(new BoxGeometry(0.05, 0.52, 0.05), POLE, { pos: [x, 0.26, 0.02] });
    k.add(new BoxGeometry(0.05, 0.2, 0.05), POLE, { pos: [x, 0.1, -0.38] });
  }
  k.add(new BoxGeometry(0.8, 0.045, 0.56), (f) => (f % 4 < 2 ? THATCH[0]! : THATCH[1]!), { pos: [0, 0.36, -0.18], rot: [-0.6, 0, 0] });
  m.t.add(new BoxGeometry(0.8, 0.014, 0.08), PAINT, { pos: [0, 0.5, 0.05], rot: [-0.6, 0, 0] });
  // a log pile, a sawhorse with a log, and a chopping block with an axe
  woodpile(k, -0.05, 0.28, 4, 0);
  for (const s of [-1, 1]) {
    k.add(new BoxGeometry(0.025, 0.24, 0.025), TIMBER2, { pos: [0.45 + s * 0.04, 0.11, -0.12], rot: [0, 0, s * 0.4] });
    k.add(new BoxGeometry(0.025, 0.24, 0.025), TIMBER2, { pos: [0.45 + s * 0.04, 0.11, 0.08], rot: [0, 0, s * 0.4] });
  }
  k.add(new CylinderGeometry(0.045, 0.045, 0.4, 6), (f) => (f < 6 ? WOOD : LOG_END), { pos: [0.45, 0.22, -0.02], rot: [Math.PI / 2, 0, 0] });
  k.add(new CylinderGeometry(0.09, 0.1, 0.12, 7), '#7a4b2a', { pos: [-0.45, 0.06, 0.15] });
  k.add(new BoxGeometry(0.02, 0.2, 0.02), POLE, { pos: [-0.45, 0.2, 0.15], rot: [0, 0, 0.4] });
  k.add(new BoxGeometry(0.08, 0.05, 0.02), '#aab4be', { pos: [-0.49, 0.29, 0.15], rot: [0, 0, 0.4] });
  banner(m, 0.38, -0.3, 0.75, 0.18);
  return { ...m.build(), glows: [], smoke: null, fire: null, r: 0.6, h: 0.75 };
}

function fishModel(): Model {
  const m = new Two(), k = m.k;
  for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) k.add(new BoxGeometry(0.04, 0.22, 0.04), POLE, { pos: [x!, 0.11, z!] });
  k.add(new BoxGeometry(0.52, 0.03, 0.52), WOOD, { pos: [0, 0.22, 0] });
  const g = hut(m, 0.21, 0.2, 0.3, [0, 0.2, 0], { posts: 0, ropes: 1 });
  // drying rack with fish, a net, and a little canoe
  k.add(new BoxGeometry(0.03, 0.4, 0.03), POLE, { pos: [0.42, 0.2, -0.15] });
  k.add(new BoxGeometry(0.03, 0.4, 0.03), POLE, { pos: [0.42, 0.2, 0.2] });
  k.add(new BoxGeometry(0.03, 0.03, 0.4), WOOD, { pos: [0.42, 0.39, 0.025] });
  for (let i = 0; i < 3; i++) k.add(new BoxGeometry(0.02, 0.11, 0.05), '#b7c3c9', { pos: [0.42, 0.31, -0.08 + i * 0.1] });
  k.add(new BoxGeometry(0.22, 0.008, 0.18), '#6f6a58', { pos: [-0.4, 0.09, 0.2], rot: [0.2, 0.3, 0.6] });
  k.add(new CylinderGeometry(0.07, 0.07, 0.55, 8, 1, false, 0, Math.PI), (f) => (f % 2 ? WOOD : '#6e4426'), { pos: [-0.1, 0.06, 0.45], rot: [Math.PI, 0, Math.PI / 2], scale: [1, 1, 0.8] });
  banner(m, -0.24, -0.24, 0.85, 0.16);
  return { ...m.build(), glows: [g], smoke: null, fire: null, r: 0.55, h: 0.85 };
}

function shrineModel(): Model {
  const m = new Two(), k = m.k;
  k.add(new CylinderGeometry(0.58, 0.62, 0.05, 12), (f) => (f % 2 ? STONE2 : STONE), { pos: [0, 0.025, 0] });
  // a ring of standing stones
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3, h = 0.3 + ((i * 37) % 3) * 0.07;
    k.add(new BoxGeometry(0.12, h, 0.09), (f) => (f < 4 ? STONE : STONE2), { pos: [Math.cos(a) * 0.48, h / 2, Math.sin(a) * 0.48], rot: [0, -a, (i % 2 ? 0.05 : -0.05)] });
  }
  // a carved central pillar with painted rings; the crystal floats above it
  k.add(new BoxGeometry(0.16, 0.36, 0.16), (f) => (f % 4 < 2 ? '#857e72' : '#9a9284'), { pos: [0, 0.2, 0] });
  m.t.add(new BoxGeometry(0.17, 0.035, 0.17), PAINT, { pos: [0, 0.3, 0] });
  m.t.add(new BoxGeometry(0.17, 0.035, 0.17), PAINT, { pos: [0, 0.14, 0] });
  k.add(new BoxGeometry(0.22, 0.04, 0.22), STONE2, { pos: [0, 0.4, 0] });
  banner(m, -0.62, 0.3, 0.8, 0.18);
  banner(m, 0.62, 0.3, 0.8, 0.18);
  return { ...m.build(), glows: [], smoke: null, fire: null, r: 0.65, h: 0.75, crystal: [0, 0.62, 0] };
}

/** The pet pen: a round paddock fence with a gate at the front, a lean-to shelter, a hay bed and a trough. */
function penModel(): Model {
  const m = new Two(), k = m.k, R = 0.72, n = 16, gate = (a: number) => Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.3;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, b = ((i + 1) / n) * Math.PI * 2;
    k.add(new BoxGeometry(0.045, 0.3, 0.045), POLE, { pos: [Math.cos(a) * R, 0.15, Math.sin(a) * R] });
    if (gate(a) || gate(b)) continue;
    const mid = (a + b) / 2, len = 2 * R * Math.sin(Math.PI / n) + 0.02;
    for (const y of [0.12, 0.24]) k.add(new BoxGeometry(len, 0.028, 0.025), WOOD, { pos: [Math.cos(mid) * R, y, Math.sin(mid) * R], rot: [0, Math.PI / 2 - mid, 0] });
  }
  k.add(new BoxGeometry(0.7, 0.36, 0.035), (f) => (f % 3 ? WATTLE[0]! : WATTLE[1]!), { pos: [0, 0.18, -0.58] });
  for (const x of [-0.33, 0.33]) k.add(new BoxGeometry(0.035, 0.26, 0.035), POLE, { pos: [x, 0.13, -0.2] });
  k.add(new BoxGeometry(0.84, 0.045, 0.52), (f) => (f % 4 < 2 ? THATCH[0]! : THATCH[1]!), { pos: [0, 0.32, -0.4], rot: [0.32, 0, 0] });
  k.add(new CylinderGeometry(0.3, 0.33, 0.05, 12), (f) => (f % 3 ? '#e8c860' : '#d4ad48'), { pos: [0, 0.025, -0.08], scale: [1, 1, 0.8] });
  k.add(new BoxGeometry(0.32, 0.09, 0.13), WOOD, { pos: [0.42, 0.045, 0.2], rot: [0, 0.5, 0] });
  k.add(new BoxGeometry(0.27, 0.02, 0.09), '#c9a35a', { pos: [0.42, 0.095, 0.2], rot: [0, 0.5, 0] });
  banner(m, -0.3, R + 0.02, 0.62, 0.17);
  return { ...m.build(), glows: [[0.26, 0.3, R + 0.03, 0, 0.06, 0.08]], smoke: null, fire: null, r: R + 0.05, h: 0.62 };
}

export function structModels(): Record<StructKind, Model> {
  return { hearth: hearthModel(), farm: farmModel(), lumber: lumberModel(), fish: fishModel(), shrine: shrineModel(), pen: penModel() };
}

/** Building-site markers: corner stakes with a rope, a wood pile and a few stones (unit radius). */
export function siteGeo(): BufferGeometry {
  const k = new Kit();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    k.add(new BoxGeometry(0.035, 0.16, 0.035), TIMBER, { pos: [Math.cos(a) * 0.8, 0.08, Math.sin(a) * 0.8] });
    const b = a + Math.PI / 4;
    k.add(new BoxGeometry(1.13, 0.012, 0.012), '#e8d8a8', { pos: [Math.cos(b) * 0.57, 0.13, Math.sin(b) * 0.57], rot: [0, -b + Math.PI / 2, 0] });
  }
  woodpile(k, 0.55, 0.62, 3, 0);
  for (const [x, z] of [[-0.6, 0.55], [-0.5, 0.65]]) k.add(new BoxGeometry(0.09, 0.06, 0.08), STONE, { pos: [x!, 0.03, z!] });
  return k.build();
}

/** A timber frame (posts, ring beam and rafters) over a site, unit radius and height. */
export function frameGeo(): BufferGeometry {
  const k = new Kit(), n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, b = ((i + 1) / n) * Math.PI * 2, x = Math.cos(a), z = Math.sin(a);
    k.add(new BoxGeometry(0.035, 0.42, 0.035), TIMBER, { pos: [x * 0.9, 0.21, z * 0.9] });
    const mx = (Math.cos(a) + Math.cos(b)) / 2, mz = (Math.sin(a) + Math.sin(b)) / 2, len = 2 * 0.9 * Math.sin(Math.PI / n);
    k.add(new BoxGeometry(len, 0.03, 0.03), WOOD, { pos: [mx * 0.9, 0.42, mz * 0.9], rot: [0, -Math.atan2(mz, mx) + Math.PI / 2, 0] });
    beam(k, [x * 0.9, 0.42, z * 0.9], [0, 1, 0], 0.025, TIMBER2); // rafter to the apex
  }
  return k.build();
}

/** The totem wanderers gather round (prototype colours). */
export function totemGeo(): BufferGeometry {
  const k = new Kit();
  k.add(new BoxGeometry(0.16, 0.9, 0.16), (f) => (f % 3 ? '#9a6236' : '#3a2418'), { pos: [0, 0.45, 0] });
  k.add(new BoxGeometry(0.34, 0.06, 0.1), '#9a6236', { pos: [0, 0.62, 0] });
  k.add(new OctahedronGeometry(0.11, 0), '#e0533f', { pos: [0, 1.02, 0] });
  k.add(new OctahedronGeometry(0.06, 0), '#ffd35a', { pos: [0, 1.02, 0.06] });
  return k.build();
}

/** A shrine's floating crystal (lit separately so it can glow). */
export function crystalGeo(): BufferGeometry {
  const k = new Kit();
  k.add(new OctahedronGeometry(0.1, 0), '#a9ecff', { scale: [0.8, 1.5, 0.8] });
  return k.build();
}

export function flameGeo(): BufferGeometry {
  const k = new Kit();
  k.add(new ConeGeometry(0.12, 0.34, 5), '#ff9a3a', { pos: [0, 0.17, 0] });
  k.add(new ConeGeometry(0.07, 0.24, 5), '#ffd35a', { pos: [0, 0.14, 0.02] });
  return k.build();
}

/** A crop tuft (one row plant). */
export function tuftGeo(): BufferGeometry {
  const k = new Kit();
  k.add(new ConeGeometry(0.05, 0.16, 4), '#ffffff', { pos: [0, 0.08, 0] });
  return k.build();
}
