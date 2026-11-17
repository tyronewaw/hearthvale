import {
  BoxGeometry, CylinderGeometry, Group, Mesh, MeshLambertMaterial, Object3D, SphereGeometry, Vector3, type Scene,
} from 'three';
import { blendGeo } from './blendmodels';
import { Kit } from './kit';
import handFile from '../assets/models/hand.json';
import { castsShadow, worldMat } from './materials';

export type HandPose = 'open' | 'reach' | 'point' | 'grip' | 'hold' | 'stroke' | 'slap';

const SKIN = '#f0c39a', SKIN_D = '#d39d72', NAIL = '#f8dcc2', GOLD = '#f2b632';

/** Joint angles: four fingers × 3 curls, thumb × 2 curls, spread, thumb swing, palm pitch. */
interface Pose {
  f: [number, number, number][];
  t: [number, number];
  spread: number;
  swing: number;
  pitch: number;
  roll: number;
}

const POSES: Record<HandPose, Pose> = {
  open: { f: [[0.25, 0.2, 0.12], [0.22, 0.18, 0.1], [0.26, 0.2, 0.12], [0.3, 0.24, 0.14]], t: [0.25, 0.15], spread: 0.11, swing: 0.75, pitch: 0.28, roll: 0 },
  reach: { f: [[0.5, 0.4, 0.25], [0.45, 0.38, 0.22], [0.5, 0.4, 0.25], [0.55, 0.45, 0.3]], t: [0.5, 0.35], spread: 0.15, swing: 0.6, pitch: 0.55, roll: 0 },
  point: { f: [[0.02, 0, 0], [1.5, 1.6, 1.1], [1.5, 1.6, 1.1], [1.45, 1.6, 1.1]], t: [0.9, 0.8], spread: 0.02, swing: 0.25, pitch: 0.65, roll: 0 },
  grip: { f: [[1.45, 1.6, 1.15], [1.45, 1.6, 1.15], [1.45, 1.6, 1.15], [1.4, 1.55, 1.1]], t: [1.0, 1.0], spread: 0, swing: 0.2, pitch: 0.4, roll: 0 },
  hold: { f: [[0.95, 0.95, 0.6], [0.9, 0.95, 0.6], [0.95, 0.95, 0.6], [1, 1, 0.65]], t: [0.75, 0.6], spread: 0.05, swing: 0.4, pitch: 0.35, roll: 0 },
  stroke: { f: [[0.06, 0.04, 0.02], [0.05, 0.04, 0.02], [0.06, 0.04, 0.02], [0.08, 0.05, 0.03]], t: [0.1, 0.05], spread: 0.03, swing: 0.5, pitch: 0.12, roll: 0 },
  slap: { f: [[0.05, 0.02, 0], [0.05, 0.02, 0], [0.05, 0.02, 0], [0.06, 0.03, 0]], t: [0.1, 0.05], spread: 0.02, swing: 0.45, pitch: 0.05, roll: 1.2 },
};

/** Finger base x, lengths of the three segments, thickness. Index finger next to the thumb (−x). */
const FINGERS: [number, [number, number, number], number][] = [
  [-0.15, [0.16, 0.11, 0.09], 0.085],
  [-0.05, [0.18, 0.12, 0.095], 0.088],
  [0.05, [0.17, 0.115, 0.09], 0.085],
  [0.15, [0.13, 0.09, 0.075], 0.075],
];

function segGeo(len: number, w: number, tip: boolean): Kit {
  const k = new Kit();
  k.add(new BoxGeometry(w, w * 0.82, len), SKIN, { pos: [0, 0, -len / 2] });
  k.add(new BoxGeometry(w * 0.9, w * 0.5, w * 0.5), SKIN_D, { pos: [0, -0.005, -0.004] }); // knuckle crease
  if (tip) k.add(new BoxGeometry(w * 0.7, w * 0.2, len * 0.4), NAIL, { pos: [0, w * 0.4, -len * 0.7] });
  return k;
}

/**
 * The god hand, Black & White style: a big friendly right hand with jointed fingers,
 * hovering over the world under the pointer. It blends between poses (open, reach, point,
 * grip while you pan the world, hold, stroke, slap), leans as it moves and casts a shadow.
 */
export class Hand {
  readonly root = new Group();
  /** World position of the palm's grip point, where held things hang. */
  readonly grip = new Vector3();
  private wrist = new Object3D();
  private joints: Object3D[][] = [];
  private thumb: Object3D[] = [];
  private cur: Pose = structuredClone(POSES.open);
  private pos = new Vector3();
  private vel = new Vector3();
  private ready = false;
  private gripLocal = new Vector3(0, -0.34, -0.14);

  constructor(scene: Scene) {
    // Smooth-shaded: the hand was made in Blender (scripts/blender/hand.py); the boxy kit
    // pieces below are the fallback for any piece the model file lacks.
    const mat = worldMat(new MeshLambertMaterial({ vertexColors: true }));
    const mesh = (k: Kit, name: string) => {
      const m = new Mesh(blendGeo(handFile, name) ?? k.build(), mat);
      castsShadow(m);
      m.frustumCulled = false;
      return m;
    };
    // Palm, back of the hand, forearm and a gold band.
    const palm = new Kit();
    palm.add(new BoxGeometry(0.46, 0.14, 0.44), SKIN);
    palm.add(new BoxGeometry(0.4, 0.04, 0.36), SKIN_D, { pos: [0, -0.07, 0.02] });
    palm.add(new SphereGeometry(0.1, 6, 4), SKIN, { pos: [-0.17, -0.03, 0.12], scale: [1, 0.7, 1.3] }); // thumb mound
    // a short forearm trailing back toward the viewer (bottom of the screen), as in B&W
    palm.add(new CylinderGeometry(0.15, 0.17, 0.62, 8), SKIN, { pos: [0, 0.07, 0.5], rot: [-1.32, 0, 0] });
    palm.add(new CylinderGeometry(0.18, 0.18, 0.09, 10), GOLD, { pos: [0, 0.1, 0.62], rot: [-1.32, 0, 0] });
    this.wrist.add(mesh(palm, 'palm'));
    FINGERS.forEach(([x, lens, w], f) => {
      const chain: Object3D[] = [];
      let parent: Object3D = this.wrist, z = -0.2;
      lens.forEach((len, i) => {
        const j = new Object3D();
        j.position.set(i === 0 ? x : 0, i === 0 ? 0.01 : 0, z);
        parent.add(j);
        j.add(mesh(segGeo(len, w, i === 2), `f${f}s${i}`));
        chain.push(j);
        parent = j;
        z = -len;
      });
      this.joints.push(chain);
    });
    let parent: Object3D = this.wrist;
    [0.14, 0.11].forEach((len, i) => {
      const j = new Object3D();
      if (i === 0) j.position.set(-0.22, -0.02, 0.06);
      else j.position.set(0, 0, -0.14);
      parent.add(j);
      j.add(mesh(segGeo(len, 0.095, i === 1), `t${i}`));
      this.thumb.push(j);
      parent = j;
    });
    this.root.add(this.wrist);
    this.root.scale.setScalar(1.35);
    this.root.visible = false;
    scene.add(this.root);
  }

  /**
   * Move toward `target` (world position, already placed near the camera focus) facing
   * along `yaw`, blending into `pose`. `scale` keeps it a steady size on screen.
   */
  update(dt: number, time: number, target: Vector3 | null, yaw: number, pose: HandPose, scale = 1.35): void {
    this.root.scale.setScalar(scale);
    this.root.visible = !!target;
    if (!target) {
      this.ready = false;
      return;
    }
    if (!this.ready) {
      this.pos.copy(target);
      this.vel.set(0, 0, 0);
      this.ready = true;
    }
    const k = 1 - Math.exp(-dt * 22);
    const prev = this.pos.clone();
    this.pos.lerp(target, k);
    this.vel.lerp(prev.sub(this.pos).multiplyScalar(-1 / Math.max(dt, 1e-3)), 1 - Math.exp(-dt * 8));

    // blend joint angles toward the pose
    const P = POSES[pose], b = 1 - Math.exp(-dt * 14), C = this.cur;
    for (let f = 0; f < 4; f++) for (let s = 0; s < 3; s++) C.f[f]![s]! += (P.f[f]![s]! - C.f[f]![s]!) * b;
    for (let s = 0; s < 2; s++) C.t[s]! += (P.t[s]! - C.t[s]!) * b;
    for (const key of ['spread', 'swing', 'pitch', 'roll'] as const) C[key] += (P[key] - C[key]) * b;

    this.joints.forEach((chain, f) => {
      chain.forEach((j, s) => {
        j.rotation.set(-C.f[f]![s]!, s === 0 ? (f - 1.5) * -C.spread : 0, 0);
      });
    });
    this.thumb[0]!.rotation.set(-C.t[0]! * 0.6, C.swing, -C.t[0]! * 0.9);
    this.thumb[1]!.rotation.set(-C.t[1]!, 0, 0);

    // place and lean into the motion
    const wob = pose === 'stroke' ? Math.sin(time * 16) * 0.12 : 0;
    this.root.position.copy(this.pos);
    const s = Math.sin(yaw), c = Math.cos(yaw);
    const fwdV = -(this.vel.x * -s + this.vel.z * -c), sideV = this.vel.x * c - this.vel.z * s;
    this.root.rotation.set(0, yaw, 0, 'YXZ');
    this.wrist.rotation.set(C.pitch + Math.max(-0.4, Math.min(0.4, fwdV * 0.03)), 0, C.roll - Math.max(-0.5, Math.min(0.5, sideV * 0.04)) + wob, 'XYZ');
    this.wrist.position.x = wob * 0.6;
    this.root.updateMatrixWorld(true);
    this.grip.copy(this.gripLocal).applyMatrix4(this.wrist.matrixWorld);
  }
}
