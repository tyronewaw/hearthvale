import {
  BoxGeometry, CanvasTexture, ConeGeometry, CylinderGeometry, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial,
  MeshLambertMaterial, NearestFilter, Sprite, SpriteMaterial, TorusGeometry, type BufferGeometry, type Scene,
} from 'three';
import { alignment, petStage, type Pet, type PetKind } from '../sim/pet';
import { isWater } from '../sim/terrain';
import { wd, type State } from '../sim/world';
import { bendDrop } from './bend';
import { Kit } from './kit';
import { castsShadow, worldMat } from './materials';
import { WATER_Y, surfaceY } from './scale';

/** Pets grow a lot, as in Black & White: a grand pet is bigger than a hut. */
const STAGE_SCALE = [0.6, 1.15, 1.75];

interface Model {
  body: BufferGeometry;
  head: BufferGeometry;
  headAt: [number, number, number];
  leg: BufferGeometry;
  legs: [number, number][];
  legY: number;
  tail: BufferGeometry | null;
  tailAt: [number, number, number];
  top: number;
}

function sheep(): Model {
  const W = '#f6f2ea', W2 = '#ddd5c6', K = '#4a3a34', K2 = '#6a5048';
  const b = new Kit();
  b.add(new IcosahedronGeometry(0.3, 1), (f) => (f % 5 ? W : W2), { pos: [0, 0.44, 0], scale: [0.95, 0.78, 1.2] });
  for (const [x, y, z] of [[0.18, 0.55, 0.15], [-0.18, 0.55, 0.12], [0.15, 0.5, -0.2], [-0.16, 0.52, -0.18], [0, 0.66, 0]])
    b.add(new IcosahedronGeometry(0.15, 0), W, { pos: [x!, y!, z!] });
  const h = new Kit();
  h.add(new BoxGeometry(0.2, 0.2, 0.24), K);
  h.add(new BoxGeometry(0.1, 0.05, 0.08), K2, { pos: [0.13, 0.04, -0.02], rot: [0, 0, -0.5] });
  h.add(new BoxGeometry(0.1, 0.05, 0.08), K2, { pos: [-0.13, 0.04, -0.02], rot: [0, 0, 0.5] });
  h.add(new BoxGeometry(0.05, 0.05, 0.02), '#ffffff', { pos: [0.06, 0.03, 0.12] });
  h.add(new BoxGeometry(0.05, 0.05, 0.02), '#ffffff', { pos: [-0.06, 0.03, 0.12] });
  h.add(new BoxGeometry(0.022, 0.03, 0.01), '#1a1210', { pos: [0.06, 0.03, 0.132] });
  h.add(new BoxGeometry(0.022, 0.03, 0.01), '#1a1210', { pos: [-0.06, 0.03, 0.132] });
  h.add(new IcosahedronGeometry(0.1, 0), W, { pos: [0, 0.12, -0.04] });
  const l = new Kit();
  l.add(new CylinderGeometry(0.045, 0.04, 0.28, 6), K, { pos: [0, -0.14, 0] });
  const t = new Kit();
  t.add(new IcosahedronGeometry(0.08, 0), W);
  return {
    body: b.build(), head: h.build(), headAt: [0, 0.56, 0.4], leg: l.build(),
    legs: [[0.14, 0.2], [-0.14, 0.2], [0.14, -0.2], [-0.14, -0.2]], legY: 0.28, tail: t.build(), tailAt: [0, 0.5, -0.38], top: 0.85,
  };
}

function monkey(): Model {
  const B = '#8b5a33', T = '#e6c095';
  const b = new Kit();
  b.add(new IcosahedronGeometry(0.22, 1), B, { pos: [0, 0.42, 0], scale: [0.95, 1.1, 0.85] });
  b.add(new IcosahedronGeometry(0.15, 0), T, { pos: [0, 0.4, 0.1], scale: [0.9, 1.1, 0.6] });
  b.add(new BoxGeometry(0.07, 0.3, 0.07), B, { pos: [0.22, 0.38, 0.04], rot: [0.3, 0, 0.2] });
  b.add(new BoxGeometry(0.07, 0.3, 0.07), B, { pos: [-0.22, 0.38, 0.04], rot: [0.3, 0, -0.2] });
  const h = new Kit();
  h.add(new IcosahedronGeometry(0.17, 1), B);
  h.add(new IcosahedronGeometry(0.12, 0), T, { pos: [0, -0.02, 0.1], scale: [1, 0.85, 0.6] });
  h.add(new IcosahedronGeometry(0.06, 0), T, { pos: [0.17, 0.02, 0], scale: [0.5, 1, 1] });
  h.add(new IcosahedronGeometry(0.06, 0), T, { pos: [-0.17, 0.02, 0], scale: [0.5, 1, 1] });
  h.add(new BoxGeometry(0.03, 0.04, 0.02), '#2a1a12', { pos: [0.05, 0.03, 0.155] });
  h.add(new BoxGeometry(0.03, 0.04, 0.02), '#2a1a12', { pos: [-0.05, 0.03, 0.155] });
  h.add(new BoxGeometry(0.06, 0.015, 0.02), '#5a3424', { pos: [0, -0.05, 0.16] });
  const l = new Kit();
  l.add(new BoxGeometry(0.08, 0.22, 0.08), '#7a4a28', { pos: [0, -0.11, 0] });
  const t = new Kit();
  t.add(new CylinderGeometry(0.03, 0.035, 0.3, 5), B, { pos: [0, 0.1, -0.08], rot: [-0.9, 0, 0] });
  t.add(new CylinderGeometry(0.025, 0.03, 0.22, 5), B, { pos: [0, 0.28, -0.12], rot: [0.4, 0, 0] });
  t.add(new IcosahedronGeometry(0.04, 0), B, { pos: [0, 0.38, -0.06] });
  return {
    body: b.build(), head: h.build(), headAt: [0, 0.78, 0.04], leg: l.build(),
    legs: [[0.1, 0], [-0.1, 0]], legY: 0.22, tail: t.build(), tailAt: [0, 0.3, -0.18], top: 1.0,
  };
}

function chicken(): Model {
  const W = '#fff6e6', W2 = '#e3cfa8', R = '#e0533f', Y = '#f2a23a';
  const b = new Kit();
  b.add(new IcosahedronGeometry(0.25, 1), W, { pos: [0, 0.36, 0], scale: [0.85, 0.85, 1.05] });
  b.add(new IcosahedronGeometry(0.12, 0), W2, { pos: [0.18, 0.38, -0.02], scale: [0.4, 0.8, 1.2] });
  b.add(new IcosahedronGeometry(0.12, 0), W2, { pos: [-0.18, 0.38, -0.02], scale: [0.4, 0.8, 1.2] });
  for (const a of [-0.35, 0, 0.35]) b.add(new ConeGeometry(0.05, 0.22, 4), W, { pos: [a * 0.2, 0.55, -0.24], rot: [-0.6, 0, a] });
  const h = new Kit();
  h.add(new IcosahedronGeometry(0.12, 1), W);
  for (const [z, s] of [[0.05, 0.05], [0, 0.06], [-0.05, 0.05]]) h.add(new BoxGeometry(0.03, s!, 0.05), R, { pos: [0, 0.12, z!] });
  h.add(new ConeGeometry(0.035, 0.09, 4), Y, { pos: [0, -0.01, 0.15], rot: [Math.PI / 2, 0, 0] });
  h.add(new BoxGeometry(0.03, 0.05, 0.02), R, { pos: [0, -0.07, 0.1] });
  h.add(new BoxGeometry(0.025, 0.03, 0.01), '#2a1a12', { pos: [0.08, 0.03, 0.08] });
  h.add(new BoxGeometry(0.025, 0.03, 0.01), '#2a1a12', { pos: [-0.08, 0.03, 0.08] });
  const l = new Kit();
  l.add(new CylinderGeometry(0.018, 0.018, 0.16, 4), Y, { pos: [0, -0.08, 0] });
  l.add(new BoxGeometry(0.08, 0.015, 0.09), Y, { pos: [0, -0.16, 0.02] });
  return {
    body: b.build(), head: h.build(), headAt: [0, 0.64, 0.17], leg: l.build(),
    legs: [[0.07, 0], [-0.07, 0]], legY: 0.17, tail: null, tailAt: [0, 0, 0], top: 0.85,
  };
}

const MODELS: Record<PetKind, () => Model> = { sheep, monkey, chicken };

/** Thought-bubble icons, from the prototype's BUBI sprites. */
const BUBI: Record<string, [string[], Record<string, string>]> = {
  eat: [['.gg..', '.rr..', 'rrrr.', 'rrrr.', '.rr..'], { g: '#5fa65a', r: '#e0533f' }],
  sleep: [['wwww.', '..w..', '.w...', 'wwww.'], { w: '#4f6fa8' }],
  play: [['.bb..', 'byyb.', 'byyb.', '.bb..'], { b: '#4f8fd1', y: '#f2b632' }],
  help: [['..y..', '.yyy.', 'yyyyy', '.yyy.', '..y..'], { y: '#f2b632' }],
  plant: [['..g..', '.ggg.', 'ggggg', '..b..', '..b..'], { g: '#5fa65a', b: '#7a4b2a' }],
  dance: [['..kk.', '..k.k', '..k..', 'kkk..', 'kk...'], { k: '#3a2418' }],
  mischief: [['.r.', '.r.', '.r.', '...', '.r.'], { r: '#d9533c' }],
  love: [['.p.p.', 'ppppp', 'ppppp', '.ppp.', '..p..'], { p: '#f07aa0' }],
  trick: [['y...y', '.y.y.', '..y..', '.y.y.', 'y...y'], { y: '#b07ad9' }],
};

function bubbleTexture(key: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const x = c.getContext('2d')!;
  x.fillStyle = '#fffaf0';
  x.fillRect(2, 1, 12, 11);
  x.fillRect(1, 2, 14, 9);
  x.fillRect(4, 12, 3, 2);
  x.fillRect(3, 14, 1, 1);
  x.fillStyle = '#5b3a26';
  x.fillRect(2, 0, 12, 1);
  x.fillRect(2, 12, 12, 1);
  x.fillRect(0, 2, 1, 9);
  x.fillRect(15, 2, 1, 9);
  const [rows, pal] = BUBI[key]!;
  const ox = 8 - Math.ceil(rows[0]!.length / 2), oy = 6 - Math.ceil(rows.length / 2);
  rows.forEach((r, j) => {
    for (let i = 0; i < r.length; i++) {
      const col = pal[r[i]!];
      if (col) {
        x.fillStyle = col;
        x.fillRect(ox + i, oy + j, 1, 1);
      }
    }
  });
  const t = new CanvasTexture(c);
  t.magFilter = t.minFilter = NearestFilter;
  return t;
}

/**
 * The god pet in 3D: body, head, legs and tail animated procedurally (walk cycle, bob and
 * squash-and-stretch, eating, sleeping, dancing, playing), a halo coloured by its nature
 * and a thought bubble with what it wants.
 */
export class PetView {
  readonly group = new Group();
  private body = new Group();
  private head!: Mesh;
  private legs: Mesh[] = [];
  private tail: Mesh | null = null;
  private halo: Mesh;
  private haloMat = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 });
  private bubble: Sprite;
  private bubbleTex: Record<string, CanvasTexture> = {};
  private kind: PetKind | null = null;
  private model!: Model;
  private carryTree: Mesh;
  /** World position of the pet's middle (for hand picking). */
  centre = { x: 0, y: 0, z: 0, r: 0.4, visible: false };

  constructor(scene: Scene) {
    this.halo = new Mesh(new TorusGeometry(0.17, 0.025, 6, 20), this.haloMat);
    this.halo.rotation.x = Math.PI / 2;
    this.bubble = new Sprite(new SpriteMaterial({ transparent: true, fog: false, depthTest: false }));
    this.bubble.renderOrder = 5;
    const tk = new Kit();
    tk.add(new CylinderGeometry(0.04, 0.05, 0.4, 5), '#7a4b2a', { pos: [0, 0.2, 0] });
    tk.add(new IcosahedronGeometry(0.22, 0), '#5fa65a', { pos: [0, 0.48, 0] });
    this.carryTree = new Mesh(tk.build(), worldMat(new MeshLambertMaterial({ vertexColors: true, flatShading: true })));
    this.group.add(this.body);
    this.group.visible = false;
    scene.add(this.group, this.halo, this.bubble);
    for (const o of [this.group, this.halo, this.bubble]) o.frustumCulled = false;
  }

  private build(kind: PetKind): void {
    this.kind = kind;
    this.model = MODELS[kind]();
    this.body.clear();
    const mat = worldMat(new MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    const mk = (g: BufferGeometry) => {
      const m = new Mesh(g, mat);
      castsShadow(m);
      m.receiveShadow = true;
      m.frustumCulled = false;
      this.body.add(m);
      return m;
    };
    mk(this.model.body);
    this.head = mk(this.model.head);
    this.head.position.set(...this.model.headAt);
    this.legs = this.model.legs.map(([x, z]) => {
      const m = mk(this.model.leg);
      m.position.set(x, this.model.legY, z);
      return m;
    });
    this.tail = this.model.tail ? mk(this.model.tail) : null;
    this.tail?.position.set(...this.model.tailAt);
    this.carryTree.position.set(0, this.model.top * 0.75, -0.1);
    this.body.add(this.carryTree);
  }

  update(S: State, fx: number, fz: number, time: number, alpha: number): void {
    const P: Pet | null = S.pet;
    this.group.visible = this.halo.visible = this.bubble.visible = !!P;
    this.centre.visible = !!P;
    if (!P) return;
    if (P.kind !== this.kind) this.build(P.kind);
    const st = petStage(P), sc = STAGE_SCALE[st]!, A = P.act;
    const x = P.px + wd(P.px, P.x) * alpha, z = P.py + wd(P.py, P.y) * alpha;
    const wx = fx + wd(fx, x), wz = fz + wd(fz, z);
    const wet = isWater(S, Math.floor(x), Math.floor(z));
    let y = wet ? WATER_Y - 0.25 * sc : surfaceY(S, x, z);
    const doing = A && A.ph === 'do' ? A.id : null, sleep = doing === 'sleep';
    const ph = time * 10 * (st === 2 ? 0.7 : 1);
    let hop = 0, spin = 0, squash = 0;
    if (P.mv) {
      hop = Math.abs(Math.sin(ph)) * 0.05;
      squash = Math.sin(ph * 2) * 0.05;
    }
    if (doing === 'dance') {
      hop = Math.abs(Math.sin(time * 7)) * 0.3;
      spin = time * 3;
      squash = Math.sin(time * 14) * 0.08;
    } else if (doing === 'play') {
      hop = Math.abs(Math.sin(time * 9)) * 0.2;
      squash = Math.sin(time * 18) * 0.07;
    } else if (!P.mv && !sleep) squash = Math.sin(time * 2.2) * 0.02; // breathing
    y += hop * sc;
    this.group.position.set(wx, y, wz);
    this.group.rotation.set(0, Math.PI / 2 - P.face + spin, 0);
    this.group.scale.set(sc * (1 - squash * 0.5), sc * (sleep ? 0.75 : 1 + squash), sc * (1 - squash * 0.5));
    this.legs.forEach((l, i) => {
      l.rotation.x = P.mv ? Math.sin(ph + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0)) * 0.6 : sleep ? 1.3 * (i < 2 ? -1 : 1) : 0;
    });
    this.head.rotation.x = doing === 'eat' ? 0.6 + Math.sin(time * 12) * 0.15 : sleep ? 0.5 : Math.sin(time * 1.3) * 0.05;
    if (this.tail) this.tail.rotation.z = Math.sin(time * (P.mv ? 12 : 3)) * 0.3;
    this.carryTree.visible = !!P.carry;

    // halo: gold when kind, purple when cheeky, white when balanced
    const al = alignment(P);
    this.haloMat.color.set(al > 0.6 ? '#ffe27a' : al < -0.4 ? '#b07ad9' : '#ffffff');
    const top = y + this.model.top * sc * (sleep ? 0.8 : 1);
    const hy = top + 0.12 + Math.sin(time * 2) * 0.03;
    this.halo.position.set(wx, hy - bendDrop(wx, wz), wz);
    this.halo.scale.setScalar(sc);

    // thought bubble: what it wants, or what it's doing
    const n = P.need, want = A && A.ph !== 'go' ? null : n.food < 30 ? 'eat' : n.energy < 22 ? 'sleep' : n.fun < 25 ? 'play' : A ? (A.id === 'follow' ? 'love' : A.id) : null;
    const key = want && BUBI[want] ? want : null;
    this.bubble.visible = !!key && !sleep;
    if (key) {
      this.bubble.material.map = this.bubbleTex[key] ??= bubbleTexture(key);
      this.bubble.material.needsUpdate = true;
      const bx = wx + 0.35 * sc, bz = wz, by = top + 0.35 * sc;
      this.bubble.position.set(bx, by - bendDrop(bx, bz), bz);
      this.bubble.scale.setScalar(0.42 * Math.max(1, sc));
    }
    this.centre = { x: wx, y: y + this.model.top * sc * 0.5 - bendDrop(wx, wz), z: wz, r: 0.45 * sc, visible: true };
  }
}
