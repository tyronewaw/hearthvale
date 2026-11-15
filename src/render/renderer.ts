import {
  Color, ConeGeometry, DirectionalLight, Fog, HemisphereLight, Mesh, MeshBasicMaterial, MeshLambertMaterial,
  NoToneMapping, PlaneGeometry, Scene, WebGLRenderer,
} from 'three';
import type { ToolId } from '../sim/sim';
import { chunkOfTile, idx, wd, type State } from '../sim/world';
import type { GroundHit } from '../input/picking';
import { bent } from './bend';
import type { CameraRig } from './camera-rig';
import { WATER_Y, yOf } from './scale';
import { TerrainMesh } from './terrain-mesh';

const SKY = new Color('#a9d8f2');

export class GameRenderer {
  readonly gl: WebGLRenderer;
  readonly scene = new Scene();
  readonly terrain: TerrainMesh;
  private water: Mesh;
  private marker: Mesh;
  private markerMat: MeshBasicMaterial;
  private dirty = new Set<number>();

  constructor(canvas: HTMLCanvasElement, private S: State, private rig: CameraRig) {
    const coarse = matchMedia('(pointer: coarse)').matches;
    this.gl = new WebGLRenderer({ canvas, antialias: !coarse, powerPreference: 'high-performance' });
    this.gl.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.gl.toneMapping = NoToneMapping;
    this.scene.background = SKY;
    this.scene.fog = new Fog(SKY, 40, 120);

    const hemi = new HemisphereLight('#eaf6ff', '#7a6a48', 1.55);
    const sun = new DirectionalLight('#fff2dc', 2.1);
    sun.position.set(-0.55, 0.9, -0.25).multiplyScalar(50);
    this.scene.add(hemi, sun);

    this.terrain = new TerrainMesh(S);
    this.scene.add(this.terrain.group);

    const wg = new PlaneGeometry(220, 220, 110, 110);
    wg.rotateX(-Math.PI / 2);
    this.water = new Mesh(wg, bent(new MeshLambertMaterial({ color: '#3e8ec4', transparent: true, opacity: 0.82 })));
    this.water.frustumCulled = false;
    this.water.renderOrder = 1;
    this.scene.add(this.water);

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
  }

  /** Queue the chunks that hold these tiles for a rebuild before the next frame. */
  terrainChanged(tiles: Iterable<number>): void {
    for (const t of tiles) this.dirty.add(chunkOfTile(t));
  }

  resize(w: number, h: number): void {
    this.gl.setSize(w, h, false);
    this.rig.camera.aspect = w / h;
    this.rig.apply();
  }

  render(time: number, hover: GroundHit | null, tool: ToolId): void {
    for (const c of this.dirty) this.terrain.rebuild(c);
    this.dirty.clear();
    const { fx, fz } = this.rig;
    this.terrain.place(fx, fz);
    this.water.position.set(Math.round(fx), WATER_Y, Math.round(fz));

    const d = this.rig.dist, fog = this.scene.fog as Fog;
    fog.near = d * 0.95;
    fog.far = d * 1.0 + 48;

    const showMarker = !!hover && (tool === 'raise' || tool === 'lower');
    this.marker.visible = showMarker;
    if (hover && showMarker) {
      const x = fx + wd(fx, hover.vx), z = fz + wd(fz, hover.vz);
      const h = this.S.h[idx(hover.vx, hover.vz)]!;
      this.marker.position.set(x, Math.max(yOf(h), WATER_Y) + 0.75 + Math.sin(time * 5) * 0.08, z);
      this.marker.rotation.y = time * 1.5;
      this.markerMat.color.set(tool === 'lower' ? '#7fc0f0' : '#ffd35a');
    }
    this.gl.render(this.scene, this.rig.camera);
  }
}
