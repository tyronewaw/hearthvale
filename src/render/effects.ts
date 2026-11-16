import {
  AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, Color, ConeGeometry, IcosahedronGeometry, InstancedMesh,
  Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, PlaneGeometry, Points, PointsMaterial, Quaternion, RingGeometry,
  SphereGeometry, Vector3, type Scene,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash2, Rng } from '../sim/rng';
import { idx, season, wd, wrap, type State } from '../sim/world';
import { bent } from './bend';
import { castsShadow, worldMat } from './materials';
import { TRIBE_BLUE } from './models';
import { standY, yOf } from './scale';

const m4 = new Matrix4(), q4 = new Quaternion(), v3 = new Vector3(), s3 = new Vector3(), up = new Vector3(0, 1, 0);
const FLAG = [TRIBE_BLUE[0]!, '#d9574a', '#e3b33c', '#6aaf5a'].map((c) => new Color(c));

function cloudGeo(): BufferGeometry {
  const parts = [[0, 0, 0, 0.9], [0.8, -0.1, 0.2, 0.7], [-0.8, -0.1, -0.1, 0.65], [0.2, 0.3, -0.3, 0.55], [-0.3, 0.05, 0.5, 0.55], [0.4, 0, 0.6, 0.5]]
    .map(([x, y, z, r]) => new IcosahedronGeometry(r!, 0).translate(x!, y!, z!));
  return mergeGeometries(parts)!.scale(1.4, 0.75, 1.2);
}

/**
 * Blessing visuals: rain clouds with falling streaks, festival bunting and lanterns, fireflies
 * on summer nights, and the radius ring shown under the cursor for blessing tools.
 */
export class Effects {
  private clouds: InstancedMesh;
  private drops: InstancedMesh;
  private flags: InstancedMesh;
  private lanterns: InstancedMesh;
  private lanternMat: MeshBasicMaterial;
  private flies: Points;
  private fliesMat: PointsMaterial;
  private fly: { x: number; z: number; p: number; h: number }[] = [];
  private ring: Mesh;
  private square: Mesh;

  constructor(scene: Scene) {
    this.clouds = new InstancedMesh(cloudGeo(), worldMat(new MeshLambertMaterial({ color: '#9aa7b8', flatShading: true, transparent: true, opacity: 0.88 })), 24);
    castsShadow(this.clouds);
    this.drops = new InstancedMesh(new BoxGeometry(0.02, 0.28, 0.02), bent(new MeshBasicMaterial({ color: '#c8dcf0', transparent: true, opacity: 0.75 })), 24 * 70);
    this.flags = new InstancedMesh(new ConeGeometry(0.07, 0.14, 3).rotateX(Math.PI), worldMat(new MeshLambertMaterial({ flatShading: true })), 4096);
    this.lanternMat = bent(new MeshBasicMaterial({ color: '#ffd27a' }));
    this.lanterns = new InstancedMesh(new SphereGeometry(0.05, 6, 4), this.lanternMat, 2048);
    for (const m of [this.clouds, this.drops, this.flags, this.lanterns]) {
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
    }
    // fireflies
    const R = new Rng(31), n = 90, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) this.fly.push({ x: (R.next() - 0.5) * 40, z: (R.next() - 0.5) * 40, p: R.next() * 6.28, h: 0.3 + R.next() * 1.1 });
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    this.fliesMat = bent(new PointsMaterial({ color: '#e8ff8a', size: 4, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending }));
    this.flies = new Points(g, this.fliesMat);
    this.flies.frustumCulled = false;
    scene.add(this.flies);
    // blessing radius cursor
    const rg = new RingGeometry(0.92, 1, 40);
    rg.rotateX(-Math.PI / 2);
    const cursorMat = bent(new MeshBasicMaterial({ color: '#fff3c0', transparent: true, opacity: 0.85, depthTest: false }));
    this.ring = new Mesh(rg, cursorMat);
    const sq = new PlaneGeometry(1, 1);
    sq.rotateX(-Math.PI / 2);
    this.square = new Mesh(sq, bent(new MeshBasicMaterial({ color: '#fff3c0', transparent: true, opacity: 0.3, depthTest: false })));
    for (const m of [this.ring, this.square]) {
      m.frustumCulled = false;
      m.renderOrder = 3;
      m.visible = false;
      scene.add(m);
    }
  }

  /** Show the area a blessing will touch: a ring of radius r, or Level's 4×4 square. */
  cursor(S: State, at: { vx: number; vz: number } | null, r: number, square: boolean, fx: number, fz: number, ok: boolean): void {
    this.ring.visible = !!at && r > 0 && !square;
    this.square.visible = !!at && square;
    if (!at) return;
    const x = fx + wd(fx, at.vx), z = fz + wd(fz, at.vz), y = Math.max(yOf(S.h[idx(at.vx, at.vz)]!), 0.16) + 0.06;
    const col = ok ? '#fff3c0' : '#ff8a70';
    (this.ring.material as MeshBasicMaterial).color.set(col);
    (this.square.material as MeshBasicMaterial).color.set(col);
    this.ring.position.set(x, y, z);
    this.ring.scale.setScalar(r);
    this.square.position.set(x, y, z);
    this.square.scale.setScalar(4);
  }

  update(S: State, fx: number, fz: number, time: number, night: number): void {
    // Rain clouds and falling streaks.
    let nc = 0, nd = 0;
    for (const r of S.rains) {
      const k = Math.min(1, r.t / 2, (25 - r.t + 0.5) / 1.5 + 0.2);
      const x = fx + wd(fx, r.x + 0.5), z = fz + wd(fz, r.y + 0.5), base = standY(S, wrap(r.x + 0.5), wrap(r.y + 0.5));
      const top = base + 5.2 + Math.sin(time * 1.3 + r.x) * 0.1;
      q4.setFromAxisAngle(up, r.x * 0.7);
      for (const [ox, oz, sc] of [[0, 0, 0.85], [1.2, 0.5, 0.65], [-1.1, -0.4, 0.7]] as const) {
        this.clouds.setMatrixAt(nc++, m4.compose(v3.set(x + ox, top, z + oz), q4, s3.setScalar(sc * Math.max(0.05, k))));
      }
      for (let i = 0; i < 70; i++) {
        const h = hash2(i, r.x * 31 + r.y), ox = ((h % 1000) / 1000 - 0.5) * 4, oz = (((h >>> 10) % 1000) / 1000 - 0.5) * 3.2;
        const fall = ((time * 7 + ((h >>> 20) % 100) / 100 * 5) % 5);
        this.drops.setMatrixAt(nd++, m4.compose(v3.set(x + ox, top - 0.4 - fall, z + oz), q4.identity(), s3.setScalar(k > 0.3 ? 1 : 0)));
      }
    }
    this.clouds.count = nc;
    this.drops.count = nd;

    // Festival: bunting round every home's eaves, and lanterns that glow after dark.
    let nf = 0, nl = 0;
    if (S.fest > 0) {
      const fade = Math.min(1, S.fest / 2);
      for (const b of S.homes) {
        if (b.lv < 1) continue;
        const cx = fx + wd(fx, b.x + 0.5), cz = fz + wd(fz, b.y + 0.5), gy = standY(S, b.x + 0.5, b.y + 0.5);
        const rr = 0.42 + b.lv * 0.08, h = 0.35 + b.lv * 0.05, n = 8 + b.lv * 2;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + time * 0.2;
          q4.setFromAxisAngle(up, -a);
          this.flags.setMatrixAt(nf, m4.compose(v3.set(cx + Math.cos(a) * rr, gy + h + Math.sin(time * 4 + i) * 0.02, cz + Math.sin(a) * rr), q4, s3.setScalar(fade)));
          this.flags.setColorAt(nf++, FLAG[(i + b.id) % 4]!);
          if (i % 3 === 0) this.lanterns.setMatrixAt(nl++, m4.compose(v3.set(cx + Math.cos(a + 0.2) * rr, gy + h - 0.1, cz + Math.sin(a + 0.2) * rr), q4.identity(), s3.setScalar(fade)));
        }
      }
    }
    this.flags.count = nf;
    this.lanterns.count = nl;
    this.lanternMat.color.setRGB(1, 0.82, 0.48).multiplyScalar(0.55 + night * 0.6);
    for (const m of [this.clouds, this.drops, this.flags, this.lanterns]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }

    // Fireflies over the land around the camera on warm nights.
    const show = night > 0.3 && season(S.t) !== 3;
    this.fliesMat.opacity = show ? Math.min(1, (night - 0.3) * 2) : 0;
    this.flies.visible = show;
    if (show) {
      const pos = this.flies.geometry.getAttribute('position') as BufferAttribute;
      this.fly.forEach((f, i) => {
        const x = fx + f.x + Math.sin(time * 0.4 + f.p) * 1.5, z = fz + f.z + Math.cos(time * 0.33 + f.p) * 1.5;
        const g = standY(S, wrap(x), wrap(z));
        const blink = Math.sin(time * 2.3 + f.p * 3) > -0.2;
        pos.setXYZ(i, x, g > 0.2 && blink ? g + f.h + Math.sin(time + f.p) * 0.2 : -100, z);
      });
      pos.needsUpdate = true;
    }
  }
}
