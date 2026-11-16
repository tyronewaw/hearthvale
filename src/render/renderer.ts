import { ConeGeometry, Mesh, MeshBasicMaterial, NoToneMapping, Scene, WebGLRenderer } from 'three';
import type { ToolId } from '../sim/sim';
import { chunkOfTile, idx, season, tod, wd, type State } from '../sim/world';
import type { GroundHit } from '../input/picking';
import { bent } from './bend';
import type { CameraRig } from './camera-rig';
import { Clouds } from './clouds';
import { Flora } from './flora';
import type { Quality } from './quality';
import { WATER_Y, yOf } from './scale';
import { Sky } from './sky';
import { TerrainMesh } from './terrain-mesh';
import { Water } from './water';

export class GameRenderer {
  readonly gl: WebGLRenderer;
  readonly scene = new Scene();
  readonly sky: Sky;
  readonly terrain: TerrainMesh;
  private water: Water;
  private flora: Flora;
  private clouds: Clouds;
  private marker: Mesh;
  private markerMat: MeshBasicMaterial;
  private dirty = new Set<number>();

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

    const cone = new ConeGeometry(0.28, 0.7, 4);
    cone.rotateX(Math.PI);
    this.markerMat = bent(new MeshBasicMaterial({ color: '#ffd35a' }));
    this.marker = new Mesh(cone, this.markerMat);
    this.marker.frustumCulled = false;
    this.marker.renderOrder = 2;
    this.scene.add(this.marker);
  }

  setState(S: State): void {
    this.S = S;
    this.terrain.setState(S);
    this.water.setState(S);
    this.flora.setState(S);
  }

  /** The ground changed on these tiles: rebuild their chunks, the shore map and the flora. */
  terrainChanged(tiles: Iterable<number>): void {
    for (const t of tiles) this.dirty.add(chunkOfTile(t));
    this.water.markDirty();
    this.flora.markDirty();
  }

  floraChanged(): void {
    this.flora.markDirty();
  }

  resize(w: number, h: number): void {
    this.gl.setSize(w, h, false);
    this.rig.camera.aspect = w / h;
    this.rig.apply();
    this.sky.resize();
  }

  render(time: number, hover: GroundHit | null, tool: ToolId): void {
    const S = this.S, se = season(S.t);
    this.terrain.setSeason(se);
    this.flora.setSeason(se);
    for (const c of this.dirty) this.terrain.rebuild(c);
    this.dirty.clear();

    const { fx, fz } = this.rig;
    this.terrain.place(fx, fz);
    this.flora.update(fx, fz);
    this.water.update(time, fx, fz);
    this.sky.update(S.t);
    const d = tod(S.t), dusk = Math.max(0, 1 - Math.abs(d - 0.25) / 0.05, 1 - Math.abs(d - 0.76) / 0.05);
    this.clouds.update(time, fx, fz, this.sky.night, dusk);

    const dist = this.rig.dist, fog = this.scene.fog as import('three').Fog;
    fog.near = dist * 0.95;
    fog.far = dist * 1.0 + 48;

    const showMarker = !!hover && (tool === 'raise' || tool === 'lower');
    this.marker.visible = showMarker;
    if (hover && showMarker) {
      const x = fx + wd(fx, hover.vx), z = fz + wd(fz, hover.vz);
      const h = S.h[idx(hover.vx, hover.vz)]!;
      this.marker.position.set(x, Math.max(yOf(h), WATER_Y) + 0.75 + Math.sin(time * 5) * 0.08, z);
      this.marker.rotation.y = time * 1.5;
      this.markerMat.color.set(tool === 'lower' ? '#7fc0f0' : '#ffd35a');
    }
    this.gl.render(this.scene, this.rig.camera);
  }
}
