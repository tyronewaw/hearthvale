import {
  BoxGeometry, CanvasTexture, ConeGeometry, CylinderGeometry, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial,
  MeshLambertMaterial, NearestFilter, Sprite, SpriteMaterial, TorusGeometry, type BufferGeometry, type Scene,
} from 'three';
import { alignment, petStage, type Pet, type PetKind } from '../sim/pet';
import { isWater } from '../sim/terrain';
import { wd, type State } from '../sim/world';
import { bendDrop } from './bend';
import { blendGeo } from './blendmodels';
import { Kit } from './kit';
import petFile from '../assets/models/pets.json';
import { castsShadow, worldMat } from './materials';
import { WATER_Y, surfaceY } from './scale';

/** Pets grow a lot, as in Black & White: a grand pet is bigger than a hut. */
const STAGE_SCALE = [0.6, 1.15, 1.75];

interface Model {
  body: BufferGeometry;
  head: BufferGeometry;
  headAt: [number, number, number];
  /** Babies have big heads. */
  headScale: number;
  leg: BufferGeometry;
  legs: [number, number][];
  legY: number;
  tail: BufferGeometry | null;
  tailAt: [number, number, number];
  top: number;
}

/**
 * Each species looks different at each stage (0 baby, 1 young, 2 grand), not just bigger:
 * a lamb, a sheep and a curly-horned ram with a bell; a baby monkey, a monkey and a grand old
 * monkey with a crest, white whiskers and a long curled tail; a chick, a hen and a rooster.
 */
function sheep(stage: number): Model {
  const W = stage === 0 ? '#fbf3e4' : '#f6f2ea', W2 = stage === 0 ? '#eadfcb' : '#ddd5c6', K = '#4a3a34', K2 = stage === 0 ? '#e0a49a' : '#6a5048';
  const b = new Kit();
  b.add(new IcosahedronGeometry(0.3, 1), (f) => (f % 5 ? W : W2), { pos: [0, 0.44, 0], scale: [0.95, 0.78, 1.2] });
  const puffs: [number, number, number][] = stage === 0
    ? [[0.12, 0.6, 0.05], [-0.12, 0.6, -0.05]]
    : [[0.18, 0.55, 0.15], [-0.18, 0.55, 0.12], [0.15, 0.5, -0.2], [-0.16, 0.52, -0.18], [0, 0.66, 0]];
  if (stage === 2) puffs.push([0.22, 0.42, 0], [-0.22, 0.42, 0], [0, 0.62, 0.22], [0, 0.6, -0.26], [0.1, 0.7, -0.1], [-0.1, 0.7, 0.1]);
  for (const [x, y, z] of puffs) b.add(new IcosahedronGeometry(stage === 2 ? 0.17 : 0.15, 0), W, { pos: [x, y, z] });
  if (stage === 2) {
    // a red collar with a golden bell
    b.add(new TorusGeometry(0.1, 0.02, 4, 12), '#c94a3a', { pos: [0, 0.5, 0.33] });
    b.add(new CylinderGeometry(0.035, 0.05, 0.06, 6), '#f2b632', { pos: [0, 0.4, 0.38] });
  }
  const h = new Kit();
  h.add(new BoxGeometry(0.2, 0.2, 0.24), K);
  h.add(new BoxGeometry(0.1, 0.05, 0.08), K2, { pos: [0.13, 0.04, -0.02], rot: [0, 0, -0.5] });
  h.add(new BoxGeometry(0.1, 0.05, 0.08), K2, { pos: [-0.13, 0.04, -0.02], rot: [0, 0, 0.5] });
  h.add(new BoxGeometry(0.05, 0.05, 0.02), '#ffffff', { pos: [0.06, 0.03, 0.12] });
  h.add(new BoxGeometry(0.05, 0.05, 0.02), '#ffffff', { pos: [-0.06, 0.03, 0.12] });
  h.add(new BoxGeometry(0.022, 0.03, 0.01), '#1a1210', { pos: [0.06, 0.03, 0.132] });
  h.add(new BoxGeometry(0.022, 0.03, 0.01), '#1a1210', { pos: [-0.06, 0.03, 0.132] });
  h.add(new IcosahedronGeometry(stage === 0 ? 0.07 : 0.1, 0), W, { pos: [0, 0.12, -0.04] });
  if (stage === 2)
    for (const sx of [1, -1]) {
      // curly ram's horns
      h.add(new TorusGeometry(0.07, 0.026, 5, 10, Math.PI * 1.6), (f) => (f % 4 < 2 ? '#d9c79c' : '#b9a57a'), { pos: [sx * 0.13, 0.06, -0.04], rot: [0, Math.PI / 2, 0.6] });
    }
  const l = new Kit();
  l.add(new CylinderGeometry(0.045, 0.04, stage === 0 ? 0.32 : 0.28, 6), K, { pos: [0, stage === 0 ? -0.16 : -0.14, 0] });
  const t = new Kit();
  t.add(new IcosahedronGeometry(0.08, 0), W);
  return {
    body: b.build(), head: h.build(), headAt: [0, 0.56, 0.4], headScale: stage === 0 ? 1.3 : 1, leg: l.build(),
    legs: [[0.14, 0.2], [-0.14, 0.2], [0.14, -0.2], [-0.14, -0.2]], legY: stage === 0 ? 0.31 : 0.28, tail: t.build(), tailAt: [0, 0.5, -0.38],
    top: stage === 2 ? 0.92 : 0.85,
  };
}

function monkey(stage: number): Model {
  const B = stage === 0 ? '#a06a3e' : stage === 2 ? '#7a4c2a' : '#8b5a33', T = '#e6c095', G = '#efe4d2';
  const b = new Kit();
  b.add(new IcosahedronGeometry(0.22, 1), B, { pos: [0, 0.42, 0], scale: [0.95, 1.1, 0.85] });
  b.add(new IcosahedronGeometry(0.15, 0), stage === 2 ? G : T, { pos: [0, 0.4, 0.1], scale: [0.9, 1.1, 0.6] });
  b.add(new BoxGeometry(0.07, 0.3, 0.07), B, { pos: [0.22, 0.38, 0.04], rot: [0.3, 0, 0.2] });
  b.add(new BoxGeometry(0.07, 0.3, 0.07), B, { pos: [-0.22, 0.38, 0.04], rot: [0.3, 0, -0.2] });
  const h = new Kit();
  h.add(new IcosahedronGeometry(0.17, 1), B);
  h.add(new IcosahedronGeometry(0.12, 0), T, { pos: [0, -0.02, 0.1], scale: [1, 0.85, 0.6] });
  const ear = stage === 0 ? 0.045 : 0.06;
  h.add(new IcosahedronGeometry(ear, 0), T, { pos: [0.17, 0.02, 0], scale: [0.5, 1, 1] });
  h.add(new IcosahedronGeometry(ear, 0), T, { pos: [-0.17, 0.02, 0], scale: [0.5, 1, 1] });
  h.add(new BoxGeometry(0.03, 0.04, 0.02), '#2a1a12', { pos: [0.05, 0.03, 0.155] });
  h.add(new BoxGeometry(0.03, 0.04, 0.02), '#2a1a12', { pos: [-0.05, 0.03, 0.155] });
  h.add(new BoxGeometry(0.06, 0.015, 0.02), '#5a3424', { pos: [0, -0.05, 0.16] });
  if (stage === 2) {
    // a crest of fur and white whiskers: a wise old monkey
    for (const [x, z, r] of [[0, 0.03, 0], [0.04, -0.03, -0.35], [-0.04, -0.03, 0.35]] as const)
      h.add(new ConeGeometry(0.03, 0.09, 4), '#5a3820', { pos: [x, 0.18, z], rot: [-0.3, 0, r] });
    h.add(new IcosahedronGeometry(0.07, 0), G, { pos: [0, -0.11, 0.1], scale: [1, 0.75, 0.6] }); // a soft white beard
    for (const sx of [1, -1]) h.add(new BoxGeometry(0.05, 0.02, 0.02), G, { pos: [sx * 0.06, 0.09, 0.15] }); // bushy eyebrows
  }
  const l = new Kit();
  l.add(new BoxGeometry(0.08, 0.22, 0.08), '#7a4a28', { pos: [0, -0.11, 0] });
  const t = new Kit();
  t.add(new CylinderGeometry(0.03, 0.035, 0.3, 5), B, { pos: [0, 0.1, -0.08], rot: [-0.9, 0, 0] });
  if (stage >= 1) {
    t.add(new CylinderGeometry(0.025, 0.03, 0.22, 5), B, { pos: [0, 0.28, -0.12], rot: [0.4, 0, 0] });
    if (stage === 2) {
      t.add(new CylinderGeometry(0.022, 0.025, 0.2, 5), B, { pos: [0, 0.44, -0.06], rot: [-0.3, 0, 0] });
      t.add(new TorusGeometry(0.06, 0.02, 4, 10, Math.PI * 1.5), B, { pos: [0, 0.57, -0.08], rot: [0, Math.PI / 2, 0] });
    } else t.add(new IcosahedronGeometry(0.04, 0), B, { pos: [0, 0.38, -0.06] });
  } else t.add(new IcosahedronGeometry(0.04, 0), B, { pos: [0, 0.22, -0.16] });
  return {
    body: b.build(), head: h.build(), headAt: [0, 0.78, 0.04], headScale: stage === 0 ? 1.3 : 1, leg: l.build(),
    legs: [[0.1, 0], [-0.1, 0]], legY: 0.22, tail: t.build(), tailAt: [0, 0.3, -0.18], top: stage === 2 ? 1.1 : 1.0,
  };
}

function chicken(stage: number): Model {
  const chick = stage === 0, W = chick ? '#ffe27a' : '#fff6e6', W2 = chick ? '#f5c95a' : '#e3cfa8', R = '#e0533f', Y = '#f2a23a';
  const b = new Kit();
  b.add(new IcosahedronGeometry(0.25, 1), W, { pos: [0, 0.36, 0], scale: chick ? [0.9, 0.9, 0.95] : [0.85, 0.85, 1.05] });
  b.add(new IcosahedronGeometry(0.12, 0), W2, { pos: [0.18, 0.38, -0.02], scale: [0.4, 0.8, 1.2] });
  b.add(new IcosahedronGeometry(0.12, 0), W2, { pos: [-0.18, 0.38, -0.02], scale: [0.4, 0.8, 1.2] });
  if (stage === 1) for (const a of [-0.35, 0, 0.35]) b.add(new ConeGeometry(0.05, 0.22, 4), W, { pos: [a * 0.2, 0.55, -0.24], rot: [-0.6, 0, a] });
  if (stage === 2) {
    // a rooster: a golden ruff and a sweep of long, glossy tail feathers
    b.add(new TorusGeometry(0.12, 0.05, 5, 12), (f) => (f % 2 ? '#e8a13a' : '#d48a2a'), { pos: [0, 0.52, 0.12], rot: [0.5, 0, 0] });
    const TAIL = ['#2f6f5e', '#3b4f8f', '#1f3d35', '#c0542b', '#2f6f5e'];
    for (let i = 0; i < 5; i++) {
      const a = (i - 2) * 0.28;
      b.add(new ConeGeometry(0.04, 0.44, 4), TAIL[i]!, { pos: [a * 0.2, 0.58 - Math.abs(a) * 0.1, -0.36], rot: [-1.25 + Math.abs(a) * 0.25, 0, a * 0.8] });
    }
  }
  const h = new Kit();
  h.add(new IcosahedronGeometry(0.12, 1), W);
  const comb: [number, number][] = chick ? [] : stage === 1 ? [[0.05, 0.05], [0, 0.06], [-0.05, 0.05]] : [[0.08, 0.08], [0.03, 0.11], [-0.02, 0.12], [-0.07, 0.1], [-0.11, 0.07]];
  for (const [z, sz] of comb) h.add(new BoxGeometry(0.035, sz, 0.05), R, { pos: [0, 0.1 + sz / 2, z] });
  h.add(new ConeGeometry(0.035, 0.09, 4), Y, { pos: [0, -0.01, 0.15], rot: [Math.PI / 2, 0, 0] });
  if (!chick) h.add(new BoxGeometry(0.03, stage === 2 ? 0.09 : 0.05, 0.02), R, { pos: [0, stage === 2 ? -0.09 : -0.07, 0.1] });
  h.add(new BoxGeometry(0.025, 0.03, 0.01), '#2a1a12', { pos: [0.08, 0.03, 0.08] });
  h.add(new BoxGeometry(0.025, 0.03, 0.01), '#2a1a12', { pos: [-0.08, 0.03, 0.08] });
  const l = new Kit();
  l.add(new CylinderGeometry(0.018, 0.018, 0.16, 4), Y, { pos: [0, -0.08, 0] });
  l.add(new BoxGeometry(0.08, 0.015, 0.09), Y, { pos: [0, -0.16, 0.02] });
  return {
    body: b.build(), head: h.build(), headAt: chick ? [0, 0.58, 0.15] : [0, 0.64, 0.17], headScale: chick ? 1.35 : stage === 2 ? 1.1 : 1, leg: l.build(),
    legs: [[0.07, 0], [-0.07, 0]], legY: 0.17, tail: null, tailAt: [0, 0, 0], top: stage === 2 ? 0.95 : 0.85,
  };
}

const MODELS: Record<PetKind, (stage: number) => Model> = { sheep, monkey, chicken };

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
  private stage = -1;
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

  private build(kind: PetKind, stage: number): void {
    this.kind = kind;
    this.stage = stage;
    if (this.model) for (const g of [this.model.body, this.model.head, this.model.leg, this.model.tail]) g?.dispose();
    this.model = MODELS[kind](stage);
    // The Blender-made pieces (scripts/blender/pets.py), where the model file has them.
    const k = `${kind}${stage}_`, m = this.model;
    m.body = blendGeo(petFile, k + 'body') ?? m.body;
    m.head = blendGeo(petFile, k + 'head') ?? m.head;
    m.leg = blendGeo(petFile, k + 'leg') ?? m.leg;
    if (m.tail) m.tail = blendGeo(petFile, k + 'tail') ?? m.tail;
    this.body.clear();
    const mat = worldMat(new MeshLambertMaterial({ vertexColors: true }));
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
    this.head.scale.setScalar(this.model.headScale);
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
    const st = petStage(P);
    if (P.kind !== this.kind || st !== this.stage) this.build(P.kind, st);
    const sc = STAGE_SCALE[st]!, A = P.act;
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
