import {
  Box3, ConeGeometry, DodecahedronGeometry, Frustum, IcosahedronGeometry, CylinderGeometry, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial,
  MeshLambertMaterial, NoToneMapping, Quaternion, Scene, Vector3, WebGLRenderer, type BufferGeometry, type Fog,
} from 'three';
import type { FlyerPose } from '../physics/physics';
import { Hand, type HandPose } from './hand';
import type { StructKind, ToolId } from '../sim/defs';
import type { SimEvent } from '../sim/events';
import { CHUNK, CHUNKS, chunkOfTile, idx, season, tod, wd, wrap, type State } from '../sim/world';
import type { GroundHit } from '../input/picking';
import { bend, bent } from './bend';
import { Buildings } from './buildings';
import type { CameraRig } from './camera-rig';
import { Clouds } from './clouds';
import { Flora } from './flora';
import { Kit } from './kit';
import { castsShadow, worldMat } from './materials';
import { Particles } from './particles';
import { PetView } from './pets';
import { Effects } from './effects';
import { Border } from './border';
import type { Quality } from './quality';
import { WATER_Y, standY, yOf } from './scale';
import { Sky } from './sky';
import { TerrainMesh } from './terrain-mesh';
import { Villagers, type Figure } from './villagers';
import { Water } from './water';

/** Per-frame UI state the renderer needs (what the player is pointing at and doing). */
export interface ViewState {
  dt: number;
  /** Interpolation between the last two sim ticks, 0..1. */
  alpha: number;
  hover: GroundHit | null;
  tool: ToolId;
  /** Where the god hand should hover (world position near the focus), or null to hide it. */
  handTarget: Vector3 | null;
  handPose: HandPose;
  /** Things in the air (from physics). */
  flyers: FlyerPose[];
  crops: Set<number>;
  ghost: { kind: StructKind; tile: [number, number]; ok: boolean } | null;
  /** The blessing area under the cursor. */
  bless: { at: { vx: number; vz: number }; r: number; square: boolean; ok: boolean } | null;
}

function treeGeo(): BufferGeometry {
  const k = new Kit();
  k.add(new CylinderGeometry(0.055, 0.08, 0.5, 5), '#7a4b2a', { pos: [0, 0.25, 0] });
  k.add(new IcosahedronGeometry(0.42, 0), '#5fa65a', { pos: [0, 0.78, 0], scale: [1, 0.9, 1] });
  return k.build();
}
function rockGeo(): BufferGeometry {
  const k = new Kit();
  k.add(new DodecahedronGeometry(0.26, 0), '#9a9284', { scale: [1.1, 0.8, 1] });
  return k.build();
}

const m4 = new Matrix4(), q4 = new Quaternion(), v3 = new Vector3(), s3 = new Vector3(1, 1, 1);

export class GameRenderer {
  readonly gl: WebGLRenderer;
  readonly scene = new Scene();
  readonly sky: Sky;
  readonly terrain: TerrainMesh;
  readonly villagers: Villagers;
  private water: Water;
  private flora: Flora;
  private clouds: Clouds;
  private buildings: Buildings;
  private particles: Particles;
  private marker: Mesh;
  private markerMat: MeshBasicMaterial;
  /** Trees and rocks in the hand or in the air. */
  private trees: InstancedMesh;
  private rocks: InstancedMesh;
  readonly hand: Hand;
  readonly pet: PetView;
  private effects: Effects;
  /** Our land's border (blue) and the Red tribe's (red), drawn on the ground. */
  readonly border: Border;
  private dirty = new Set<number>();
  /** Which chunks the camera can see this frame (frustum test on bent bounds). */
  readonly vis = new Uint8Array(CHUNKS * CHUNKS);
  private frustum = new Frustum();
  private box = new Box3();
  private pm = new Matrix4();

  constructor(canvas: HTMLCanvasElement, private S: State, private rig: CameraRig, readonly q: Quality) {
    this.gl = new WebGLRenderer({ canvas, antialias: q.antialias, powerPreference: 'high-performance' });
    this.gl.setPixelRatio(q.pixelRatio);
    this.gl.toneMapping = NoToneMapping;

    // The sky owns the lights and must exist before any world material (it registers CSM).
    this.sky = new Sky(this.scene, this.gl, rig, q);

    this.terrain = new TerrainMesh(S);
    this.scene.add(this.terrain.group);
    this.water = new Water(S);
    this.scene.add(this.water.mesh);
    this.flora = new Flora(S, this.scene, q);
    this.clouds = new Clouds(this.scene, q.clouds);
    this.particles = new Particles(this.scene);
    this.buildings = new Buildings(this.scene, this.particles);
    this.villagers = new Villagers(this.scene, q.tier === 'low' ? 500 : 900);

    const cone = new ConeGeometry(0.28, 0.7, 4);
    cone.rotateX(Math.PI);
    this.markerMat = bent(new MeshBasicMaterial({ color: '#ffd35a' }));
    this.marker = new Mesh(cone, this.markerMat);
    this.marker.frustumCulled = false;
    this.marker.renderOrder = 2;
    this.scene.add(this.marker);

    const vc = worldMat(new MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.trees = new InstancedMesh(treeGeo(), vc, 48);
    this.rocks = new InstancedMesh(rockGeo(), vc, 48);
    for (const m of [this.trees, this.rocks]) {
      m.frustumCulled = false;
      m.count = 0;
      castsShadow(m);
      this.scene.add(m);
    }
    this.hand = new Hand(this.scene);
    this.pet = new PetView(this.scene);
    this.effects = new Effects(this.scene);
    this.border = new Border(this.scene);
  }

  /** Water splash at torus (x, z). */
  splash(x: number, z: number): void {
    this.particles.emit('splash', x, WATER_Y + 0.05, z, 10);
  }

  setState(S: State): void {
    this.S = S;
    this.terrain.setState(S);
    this.water.setState(S);
    this.flora.setState(S);
  }

  /** React to a sim event (terrain edits, flora changes, sparks). */
  onEvent(e: SimEvent): void {
    if (e.k === 'terrain') {
      for (const t of e.tiles) this.dirty.add(chunkOfTile(t));
      this.water.markDirty();
      this.flora.markDirty();
    } else if (e.k === 'flora') this.flora.markDirty();
    else if (e.k === 'spark') this.particles.emit(e.kind, e.x, standY(this.S, e.x, e.y) + (e.kind === 'splash' ? 0.05 : 0.55), e.y, e.n);
  }

  resize(w: number, h: number): void {
    this.gl.setSize(w, h, false);
    this.rig.camera.aspect = w / h;
    this.rig.apply();
    this.sky.resize();
  }

  /**
   * Chunk-level frustum culling. Each chunk's box is built from its corners after the planet
   * bend (the shader drops far geometry, so unbent bounds would be wrong), with headroom for
   * trees and buildings.
   */
  private cull(fx: number, fz: number): void {
    const cam = this.rig.camera;
    this.frustum.setFromProjectionMatrix(this.pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const half = CHUNK / 2;
    for (let c = 0; c < this.vis.length; c++) {
      const ccx = (c % CHUNKS) * CHUNK + half, ccz = ((c / CHUNKS) | 0) * CHUNK + half;
      const x = fx + wd(fx, ccx), z = fz + wd(fz, ccz);
      // the bend is lowest at the far corner and highest at the near one
      const dx = Math.abs(x - fx), dz = Math.abs(z - fz);
      const nearD = Math.max(0, dx - half) ** 2 + Math.max(0, dz - half) ** 2, farD = (dx + half) ** 2 + (dz + half) ** 2;
      const lo = this.terrain.yMin[c]! - bend.k * farD, hi = this.terrain.yMax[c]! + 2.2 - bend.k * nearD;
      this.box.min.set(x - half, Math.min(lo, 0.16 - bend.k * farD), z - half);
      this.box.max.set(x + half, hi, z + half);
      this.vis[c] = this.frustum.intersectsBox(this.box) ? 1 : 0;
    }
  }

  render(time: number, view: ViewState): void {
    const S = this.S, se = season(S.t);
    this.terrain.setSeason(se);
    this.flora.setSeason(se);
    for (const c of this.dirty) this.terrain.rebuild(c);
    this.dirty.clear();

    const { fx, fz } = this.rig;
    this.cull(fx, fz);
    this.terrain.place(fx, fz, this.vis);
    const cam = this.rig.camera.position;
    this.flora.update(fx, fz, this.vis, cam.x, cam.z);
    this.water.update(time, fx, fz);
    this.sky.update(S.t);
    const d = tod(S.t), dusk = Math.max(0, 1 - Math.abs(d - 0.25) / 0.05, 1 - Math.abs(d - 0.76) / 0.05);
    this.clouds.update(time, fx, fz, this.sky.night, dusk);
    this.buildings.update(S, view.crops, fx, fz, time, view.dt, this.sky.night, se);
    this.buildings.setGhost(view.ghost?.kind ?? null, S, view.ghost?.tile ?? null, view.ghost?.ok ?? false, fx, fz);

    // The god hand, and what it holds hanging from its grip.
    // The hand keeps a steady size on screen (like a cursor), whatever the zoom.
    this.hand.update(view.dt, time, view.handTarget, this.rig.yaw, view.handPose, Math.min(5, Math.max(1.1, this.rig.dist * 0.11)));
    const extra: Figure[] = [];
    let nt = 0, nr = 0;
    const put = (mesh: InstancedMesh, i: number, x: number, y: number, z: number, q: Quaternion, sc = 1) => {
      mesh.setMatrixAt(i, m4.compose(v3.set(fx + wd(fx, x), y, fz + wd(fz, z)), q, s3.setScalar(sc)));
    };
    const h = S.held;
    if (h && view.handTarget) {
      const g = this.hand.grip, gx = wrap(g.x), gz = wrap(g.z);
      const sway = q4.setFromAxisAngle(v3.set(1, 0, 0), Math.sin(time * 5) * 0.15);
      if (h.k === 'v') extra.push({ v: h.v, x: gx, z: gz, y: g.y - 0.52, pose: 'held' });
      else if (h.k === 'tree') put(this.trees, nt++, gx, g.y - 0.95, gz, sway);
      else put(this.rocks, nr++, gx, g.y - 0.22, gz, sway, 0.7 + h.rock * 0.25);
    }
    for (const f of view.flyers) {
      q4.set(f.q.x, f.q.y, f.q.z, f.q.w);
      if (f.obj.k === 'v') extra.push({ v: f.obj.v, x: f.x, z: f.z, y: f.y, pose: 'fly', q: f.q });
      else if (f.obj.k === 'tree') put(this.trees, nt++, f.x, f.y, f.z, q4);
      else put(this.rocks, nr++, f.x, f.y, f.z, q4, 0.7 + f.obj.rock * 0.25);
    }
    this.trees.count = nt;
    this.rocks.count = nr;
    this.trees.instanceMatrix.needsUpdate = this.rocks.instanceMatrix.needsUpdate = true;
    this.villagers.update(S, fx, fz, time, view.alpha, this.rig.dist * 1.25 + 14, extra);
    this.pet.update(S, fx, fz, time, view.alpha);
    this.effects.update(S, fx, fz, time, this.sky.night);
    this.border.update(S, fx, fz, time, view.dt);
    this.effects.cursor(S, view.bless?.at ?? null, view.bless?.r ?? 0, view.bless?.square ?? false, fx, fz, view.bless?.ok ?? true);
    // festival music: notes rise from people dancing in the streets
    const redFest = !!S.rival && S.rival.fest > 0;
    if ((S.fest > 0 || redFest) && S.vills.length && Math.random() < view.dt * 6) {
      const pool = S.fest > 0 ? S.vills : S.vills.filter((o) => o.tribe === 1);
      const v = pool[Math.floor(Math.random() * pool.length)];
      if (v) this.particles.emit('note', v.x, standY(S, v.x, v.y) + 0.7, v.y, 1);
    }
    this.particles.update(view.dt, fx, fz);

    const dist = this.rig.dist, fog = this.scene.fog as Fog;
    fog.near = dist * 0.95;
    fog.far = dist * 1.0 + 48;

    const hover = view.hover, tool = view.tool;
    const showMarker = !!hover && (tool === 'raise' || tool === 'lower' || tool === 'totem');
    this.marker.visible = showMarker;
    if (hover && showMarker) {
      const x = fx + wd(fx, hover.vx), z = fz + wd(fz, hover.vz);
      const hh = S.h[idx(hover.vx, hover.vz)]!;
      this.marker.position.set(x, Math.max(yOf(hh), WATER_Y) + 0.75 + Math.sin(time * 5) * 0.08, z);
      this.marker.rotation.y = time * 1.5;
      this.markerMat.color.set(tool === 'lower' ? '#7fc0f0' : tool === 'totem' ? '#e0533f' : '#ffd35a');
    }
    this.gl.render(this.scene, this.rig.camera);
  }
}
