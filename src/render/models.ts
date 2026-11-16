import {
  BoxGeometry, ConeGeometry, CylinderGeometry, DodecahedronGeometry, OctahedronGeometry, type BufferGeometry, type Vector3,
} from 'three';
import type { StructKind } from '../sim/defs';
import { Kit } from './kit';

/** Colours from the prototype's hut sprites. */
const THATCH = ['#ecca72', '#d4a64a', '#a9792e'];
const THATCH2 = ['#e2b25c', '#c38d3a', '#916224'];
const WATTLE = ['#b98d5c', '#9b7147', '#77522f'];
const POLE = '#6b4426', DOOR = '#3a2418', STONE = '#9a9284', STONE2 = '#b3ab9c', WOOD = '#8a5a30', LOG_END = '#e0bc88';
/** Our tribe is blue (the user's choice): flags and trims use the prototype's TRIBE blues. */
export const TRIBE_BLUE = ['#3f6fc4', '#3566b0', '#4a7fd6', '#2f5ea8'];

/** A model plus the spots that light up at night and where smoke and fire come from. */
export interface Model {
  geo: BufferGeometry;
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

interface HutOpts {
  roof?: string[];
}

/** A round wattle hut under a conical thatch, door facing +z. */
function hut(k: Kit, r: number, wallH: number, roofH: number, at: [number, number, number] = [0, 0, 0], o: HutOpts = {}): Model['glows'][number] {
  const roof = o.roof ?? THATCH;
  const seg = Math.max(9, Math.round(r * 26));
  k.add(new CylinderGeometry(r * 0.97, r, wallH, seg, 1, true), (f) => {
    const s = Math.floor(f / 2);
    return s % 3 === 0 ? WATTLE[2]! : s % 3 === 1 ? WATTLE[1]! : WATTLE[0]!;
  }, { pos: [at[0], at[1] + wallH / 2, at[2]] });
  // thatch: banded rings, darker at the eave
  k.add(new ConeGeometry(r * 1.32, roofH, seg, 3), (_f, _n, c: Vector3) => {
    const t = (c.y - at[1] - wallH) / roofH;
    return t < 0.18 ? roof[2]! : Math.floor(t * 6) % 2 ? roof[0]! : roof[1]!;
  }, { pos: [at[0], at[1] + wallH + roofH / 2 - 0.02, at[2]] });
  // poles poking out of the smoke hole
  const top = at[1] + wallH + roofH;
  for (const a of [-0.5, 0.5]) k.add(new CylinderGeometry(0.012, 0.012, roofH * 0.32, 4), POLE, { pos: [at[0] + a * 0.07, top, at[2]], rot: [0, 0, a * 0.9] });
  const dw = r * 0.42, dh = wallH * 0.78;
  k.add(new BoxGeometry(dw, dh, 0.04), DOOR, { pos: [at[0], at[1] + dh / 2, at[2] + r * 0.98] });
  return [at[0], at[1] + dh / 2, at[2] + r + 0.012, 0, dw * 0.8, dh * 0.85];
}

function tepee(): Model {
  const k = new Kit();
  const H = 0.95, R = 0.36;
  k.add(new ConeGeometry(R, H, 8, 4), (_f, _n, c: Vector3) => {
    const t = c.y / H;
    return t > 0.52 && t < 0.66 ? '#c95c45' : c.x < -0.08 ? '#eed8aa' : c.x < 0.12 ? '#d8b984' : '#ad8a5c';
  }, { pos: [0, H / 2, 0] });
  for (const a of [-0.45, 0.45, 0]) k.add(new CylinderGeometry(0.012, 0.012, 0.35, 4), POLE, { pos: [a * 0.12, H + 0.04, 0], rot: [a * 0.3, 0, a] });
  k.add(new ConeGeometry(0.11, 0.3, 3), DOOR, { pos: [0, 0.15, R * 0.62], rot: [0.35, 0, 0] });
  return { geo: k.build(), glows: [[0, 0.13, R * 0.72, 0, 0.12, 0.2]], smoke: [0, H + 0.1, 0], fire: null, r: R, h: H };
}

function flags(k: Kit, xs: number[], h: number): void {
  for (const x of xs) {
    k.add(new CylinderGeometry(0.018, 0.018, h, 5), POLE, { pos: [x, h / 2, 0.15] });
    k.add(new BoxGeometry(0.2, 0.12, 0.012), TRIBE_BLUE[0]!, { pos: [x + 0.11, h - 0.08, 0.15] });
    k.add(new BoxGeometry(0.2, 0.025, 0.014), '#f2b632', { pos: [x + 0.11, h - 0.11, 0.15] });
  }
}

/** Homes by level: tepee, hut, round hut, big hut, longhouse, great lodge. */
export function homeModels(): Model[] {
  const m: Model[] = [tepee()];
  {
    const k = new Kit(), g = hut(k, 0.3, 0.26, 0.36);
    m.push({ geo: k.build(), glows: [g], smoke: [0, 0.68, 0], fire: null, r: 0.4, h: 0.72 });
  }
  {
    const k = new Kit(), g = hut(k, 0.4, 0.3, 0.46);
    m.push({ geo: k.build(), glows: [g], smoke: [0, 0.82, 0], fire: null, r: 0.52, h: 0.86 });
  }
  {
    const k = new Kit(), g = hut(k, 0.47, 0.34, 0.56), g2 = hut(k, 0.22, 0.24, 0.3, [-0.58, 0, -0.22]);
    m.push({ geo: k.build(), glows: [g, g2], smoke: [0, 0.98, 0], fire: null, r: 0.75, h: 1.02 });
  }
  {
    const k = new Kit(), g = hut(k, 0.52, 0.38, 0.62, [0, 0, 0], { roof: THATCH2 });
    const g2 = hut(k, 0.26, 0.26, 0.34, [-0.68, 0, -0.26]), g3 = hut(k, 0.26, 0.26, 0.34, [0.68, 0, -0.26]);
    m.push({ geo: k.build(), glows: [g, g2, g3], smoke: [0, 1.08, 0], fire: null, r: 0.95, h: 1.12 });
  }
  {
    const k = new Kit(), g = hut(k, 0.64, 0.44, 0.76, [0, 0, 0], { roof: THATCH2 });
    const g2 = hut(k, 0.3, 0.28, 0.38, [-0.84, 0, -0.3]), g3 = hut(k, 0.3, 0.28, 0.38, [0.84, 0, -0.3]);
    flags(k, [-0.5, 0.45], 1.2);
    m.push({ geo: k.build(), glows: [g, g2, g3], smoke: [0, 1.3, 0], fire: null, r: 1.15, h: 1.35 });
  }
  return m;
}

function hearthModel(): Model {
  const k = new Kit();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    k.add(new DodecahedronGeometry(0.07, 0), i % 2 ? STONE : STONE2, { pos: [Math.cos(a) * 0.3, 0.04, Math.sin(a) * 0.3], scale: [1.2, 0.8, 1] });
  }
  k.add(new CylinderGeometry(0.24, 0.26, 0.03, 10), '#4a3a30', { pos: [0, 0.015, 0] });
  // log pile and food basket
  for (let i = 0; i < 3; i++)
    k.add(new CylinderGeometry(0.05, 0.05, 0.4, 6), (f) => (f < 6 ? WOOD : LOG_END), { pos: [-0.62, 0.05 + i * 0.09, -0.1 + (i % 2) * 0.05], rot: [Math.PI / 2, 0, 0] });
  k.add(new CylinderGeometry(0.14, 0.11, 0.16, 8), '#c9a35a', { pos: [0.6, 0.08, 0.1] });
  k.add(new DodecahedronGeometry(0.05, 0), '#d9533c', { pos: [0.57, 0.18, 0.1] });
  k.add(new DodecahedronGeometry(0.05, 0), '#f2b632', { pos: [0.65, 0.18, 0.14] });
  return { geo: k.build(), glows: [], smoke: null, fire: [0, 0.03, 0], r: 0.8, h: 0.4 };
}

function farmModel(): Model {
  const k = new Kit(), g = hut(k, 0.22, 0.22, 0.28, [0, 0, -0.08]);
  for (let i = -3; i <= 3; i++) k.add(new BoxGeometry(0.035, 0.18, 0.035), WOOD, { pos: [i * 0.13, 0.09, 0.36] });
  k.add(new BoxGeometry(0.85, 0.03, 0.025), WOOD, { pos: [0, 0.13, 0.36] });
  k.add(new BoxGeometry(0.18, 0.13, 0.13), '#e2c071', { pos: [0.32, 0.065, 0.05] });
  return { geo: k.build(), glows: [g], smoke: null, fire: null, r: 0.45, h: 0.55 };
}

function lumberModel(): Model {
  const k = new Kit();
  k.add(new BoxGeometry(0.05, 0.5, 0.05), POLE, { pos: [-0.3, 0.25, -0.2] });
  k.add(new BoxGeometry(0.05, 0.5, 0.05), POLE, { pos: [0.3, 0.25, -0.2] });
  k.add(new BoxGeometry(0.75, 0.04, 0.5), (f) => (f % 4 < 2 ? '#c4913c' : '#a9792e'), { pos: [0, 0.4, -0.05], rot: [0.5, 0, 0] });
  for (let r = 0; r < 3; r++)
    for (let i = 0; i < 3 - r; i++)
      k.add(new CylinderGeometry(0.055, 0.055, 0.5, 6), (f) => (f < 12 ? WOOD : LOG_END), { pos: [-0.12 + i * 0.12 + r * 0.06, 0.055 + r * 0.095, 0.25], rot: [0, 0, Math.PI / 2] });
  k.add(new CylinderGeometry(0.09, 0.1, 0.12, 7), '#7a4b2a', { pos: [0.45, 0.06, 0.15] });
  k.add(new BoxGeometry(0.02, 0.2, 0.02), POLE, { pos: [0.45, 0.2, 0.15], rot: [0, 0, 0.4] });
  k.add(new BoxGeometry(0.08, 0.05, 0.02), '#aab4be', { pos: [0.41, 0.29, 0.15], rot: [0, 0, 0.4] });
  return { geo: k.build(), glows: [], smoke: null, fire: null, r: 0.55, h: 0.55 };
}

function fishModel(): Model {
  const k = new Kit();
  for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) k.add(new BoxGeometry(0.04, 0.2, 0.04), POLE, { pos: [x!, 0.1, z!] });
  k.add(new BoxGeometry(0.5, 0.03, 0.5), WOOD, { pos: [0, 0.2, 0] });
  const g = hut(k, 0.22, 0.22, 0.3, [0, 0.21, 0]);
  k.add(new BoxGeometry(0.03, 0.4, 0.03), POLE, { pos: [0.4, 0.2, -0.15] });
  k.add(new BoxGeometry(0.03, 0.4, 0.03), POLE, { pos: [0.4, 0.2, 0.2] });
  k.add(new BoxGeometry(0.03, 0.03, 0.4), WOOD, { pos: [0.4, 0.39, 0.025] });
  for (let i = 0; i < 3; i++) k.add(new BoxGeometry(0.02, 0.11, 0.05), '#e2ddd0', { pos: [0.4, 0.31, -0.08 + i * 0.1] });
  return { geo: k.build(), glows: [g], smoke: null, fire: null, r: 0.5, h: 0.75 };
}

function shrineModel(): Model {
  const k = new Kit();
  k.add(new CylinderGeometry(0.55, 0.6, 0.04, 12), STONE2, { pos: [0, 0.02, 0] });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3, h = 0.32 + (i % 2) * 0.1;
    k.add(new BoxGeometry(0.1, h, 0.08), (f) => (f < 4 ? STONE : STONE2), { pos: [Math.cos(a) * 0.45, h / 2, Math.sin(a) * 0.45], rot: [0, -a, 0] });
  }
  k.add(new BoxGeometry(0.22, 0.14, 0.18), '#857e72', { pos: [0, 0.07, 0] });
  return { geo: k.build(), glows: [], smoke: null, fire: null, r: 0.6, h: 0.6 };
}

/** The pet pen: a round paddock fence with a gate at the front, a lean-to shelter, a hay bed and a trough. */
function penModel(): Model {
  const k = new Kit(), R = 0.72, n = 16, gate = (a: number) => Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.3;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, b = ((i + 1) / n) * Math.PI * 2;
    k.add(new BoxGeometry(0.045, 0.3, 0.045), POLE, { pos: [Math.cos(a) * R, 0.15, Math.sin(a) * R] });
    if (gate(a) || gate(b)) continue;
    const m = (a + b) / 2, len = 2 * R * Math.sin(Math.PI / n) + 0.02;
    for (const y of [0.12, 0.24]) k.add(new BoxGeometry(len, 0.028, 0.025), WOOD, { pos: [Math.cos(m) * R, y, Math.sin(m) * R], rot: [0, Math.PI / 2 - m, 0] });
  }
  // lean-to shelter at the back
  k.add(new BoxGeometry(0.7, 0.36, 0.035), (f) => (f % 3 ? WATTLE[0]! : WATTLE[1]!), { pos: [0, 0.18, -0.58] });
  for (const x of [-0.33, 0.33]) k.add(new BoxGeometry(0.035, 0.26, 0.035), POLE, { pos: [x, 0.13, -0.2] });
  k.add(new BoxGeometry(0.84, 0.045, 0.52), (f) => (f % 4 < 2 ? THATCH[0]! : THATCH[1]!), { pos: [0, 0.32, -0.4], rot: [0.32, 0, 0] });
  // hay bed, trough, and a tribe flag by the gate
  k.add(new CylinderGeometry(0.3, 0.33, 0.05, 12), (f) => (f % 3 ? '#e8c860' : '#d4ad48'), { pos: [0, 0.025, -0.08], scale: [1, 1, 0.8] });
  k.add(new BoxGeometry(0.32, 0.09, 0.13), WOOD, { pos: [0.42, 0.045, 0.2], rot: [0, 0.5, 0] });
  k.add(new BoxGeometry(0.27, 0.02, 0.09), '#c9a35a', { pos: [0.42, 0.095, 0.2], rot: [0, 0.5, 0] });
  k.add(new CylinderGeometry(0.016, 0.016, 0.62, 5), POLE, { pos: [-0.3, 0.31, R + 0.02] });
  k.add(new BoxGeometry(0.17, 0.1, 0.012), TRIBE_BLUE[0]!, { pos: [-0.21, 0.55, R + 0.02] });
  return { geo: k.build(), glows: [[0.26, 0.3, R + 0.03, 0, 0.06, 0.08]], smoke: null, fire: null, r: R + 0.05, h: 0.62 };
}

export function structModels(): Record<StructKind, Model> {
  return { hearth: hearthModel(), farm: farmModel(), lumber: lumberModel(), fish: fishModel(), shrine: shrineModel(), pen: penModel() };
}

/** Scaffolding drawn round a building site (unit radius; scaled per site). */
export function scaffoldGeo(): BufferGeometry {
  const k = new Kit();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    k.add(new BoxGeometry(0.04, 0.8, 0.04), WOOD, { pos: [Math.cos(a), 0.4, Math.sin(a)] });
  }
  for (const y of [0.3, 0.65])
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      k.add(new BoxGeometry(1.45, 0.035, 0.035), '#a9792e', { pos: [Math.cos(a) * 0.72, y, Math.sin(a) * 0.72], rot: [0, -a + Math.PI / 2, 0] });
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
