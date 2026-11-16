import { BoxGeometry, Color, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3, type Scene } from 'three';
import { influenceField, influenceSources } from '../sim/village';
import { N, wd, wrap, type State, type Tribe } from '../sim/world';
import { bent } from './bend';
import { contour } from './contour';
import { WATER_Y, surfaceY } from './scale';

const m4 = new Matrix4(), q4 = new Quaternion(), v3 = new Vector3(), s3 = new Vector3(), dir = new Vector3(), X = new Vector3(1, 0, 0);
/** Only segments this close to the focus are laid out (the view never reaches further). */
const VIEW = 70;
const CAP = 6000;

/**
 * Black & White style borders on the ground: a soft blue line round our land and a red one
 * round the Red tribe's. The lines are the 0 contour of each tribe's influence field (the
 * same discs inInfluence() uses), traced again only when the tribe's homes or buildings change.
 */
export class Border {
  visible = true;
  private lines: InstancedMesh[];
  private mats: MeshBasicMaterial[];
  private segs: number[][] = [[], []];
  private sig = ['', ''];
  private t = 0;

  constructor(scene: Scene) {
    const geo = new BoxGeometry(1, 0.035, 0.15);
    this.mats = ['#3d8bff', '#ff5a3c'].map((c) => bent(new MeshBasicMaterial({ color: new Color(c), transparent: true, opacity: 0.7, depthWrite: false })));
    this.lines = this.mats.map((m) => {
      const im = new InstancedMesh(geo, m, CAP);
      im.frustumCulled = false;
      im.count = 0;
      im.renderOrder = 2;
      scene.add(im);
      return im;
    });
  }

  /** Line segments drawn this frame: [ours, theirs] (for the smoke test). */
  get counts(): number[] {
    return this.lines.map((l) => l.count);
  }

  /** Re-trace a tribe's outline if its homes or buildings changed (checked twice a second). */
  private retrace(S: State, t: Tribe): void {
    const src = influenceSources(S, t), sig = src.map((s) => s.join(',')).join(';');
    if (sig === this.sig[t]) return;
    this.sig[t] = sig;
    this.segs[t] = src.length ? contour(influenceField(S, t), N) : [];
  }

  update(S: State, fx: number, fz: number, time: number, rdt: number): void {
    const show: boolean[] = [this.visible, this.visible && !!S.rival && !S.rival.united];
    if ((this.t -= rdt) <= 0) {
      this.t = 0.5;
      for (const t of [0, 1] as const) if (show[t]) this.retrace(S, t);
    }
    const lineY = (x: number, z: number) => Math.max(surfaceY(S, wrap(x), wrap(z)), WATER_Y) + 0.06;
    for (const t of [0, 1] as const) {
      const im = this.lines[t]!, s = this.segs[t]!;
      let n = 0;
      if (show[t])
        for (let i = 0; i < s.length && n < CAP; i += 4) {
          const x1 = s[i]!, z1 = s[i + 1]!, x2 = s[i + 2]!, z2 = s[i + 3]!, mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
          const ox = wd(fx, mx), oz = wd(fz, mz);
          if (Math.abs(ox) > VIEW || Math.abs(oz) > VIEW) continue;
          const y1 = lineY(x1, z1), y2 = lineY(x2, z2);
          dir.set(x2 - x1, y2 - y1, z2 - z1);
          const len = dir.length();
          if (len < 1e-4) continue;
          q4.setFromUnitVectors(X, dir.multiplyScalar(1 / len));
          im.setMatrixAt(n++, m4.compose(v3.set(fx + ox, (y1 + y2) / 2, fz + oz), q4, s3.set(len + 0.04, 1, 1)));
        }
      im.count = n;
      im.instanceMatrix.needsUpdate = true;
      this.mats[t]!.opacity = 0.72 + Math.sin(time * 1.8 + t) * 0.12;
    }
  }
}
