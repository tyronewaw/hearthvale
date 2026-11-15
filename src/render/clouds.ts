import { Color, IcosahedronGeometry, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3, type Scene } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng } from '../sim/rng';
import { N, wd, wrap } from '../sim/world';
import { castsShadow, worldMat } from './materials';

interface Cloud {
  x: number;
  z: number;
  y: number;
  s: number;
  speed: number;
  rot: number;
}

const m4 = new Matrix4(), q4 = new Quaternion(), v3 = new Vector3(), s3 = new Vector3(), up = new Vector3(0, 1, 0);

/** Puffy low-poly clouds drifting round the planet, casting soft travelling shadows. */
export class Clouds {
  private mesh: InstancedMesh;
  private clouds: Cloud[] = [];
  private day = new Color('#ffffff');
  private dusk = new Color('#ffd2c0');
  private nightCol = new Color('#7c86b0');

  constructor(scene: Scene, count: number) {
    const R = new Rng(99);
    const puffs = [
      [0, 0, 0, 1],
      [0.9, -0.15, 0.2, 0.75],
      [-0.85, -0.2, -0.1, 0.7],
      [0.3, 0.35, -0.3, 0.6],
      [-0.3, 0.1, 0.45, 0.55],
    ].map(([x, y, z, r]) => {
      const g = new IcosahedronGeometry(r!, 0);
      g.translate(x!, y!, z!);
      return g;
    });
    const g = mergeGeometries(puffs)!;
    g.scale(1.6, 0.9, 1.2);
    this.mesh = new InstancedMesh(g, worldMat(new MeshLambertMaterial({ flatShading: true, color: '#ffffff' })), count);
    this.mesh.frustumCulled = false;
    castsShadow(this.mesh);
    scene.add(this.mesh);
    for (let i = 0; i < count; i++)
      this.clouds.push({ x: R.next() * N, z: R.next() * N, y: 9 + R.next() * 4, s: 0.8 + R.next() * 0.9, speed: 0.25 + R.next() * 0.35, rot: R.next() * 6.28 });
  }

  update(time: number, fx: number, fz: number, night: number, dusk: number): void {
    this.clouds.forEach((c, i) => {
      const x = wrap(c.x + time * c.speed), z = c.z;
      q4.setFromAxisAngle(up, c.rot);
      m4.compose(v3.set(fx + wd(fx, x), c.y + Math.sin(time * 0.3 + i) * 0.2, fz + wd(fz, z)), q4, s3.setScalar(c.s));
      this.mesh.setMatrixAt(i, m4);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    const mat = this.mesh.material as MeshLambertMaterial;
    mat.color.copy(this.day).lerp(this.dusk, dusk).lerp(this.nightCol, night);
  }
}
