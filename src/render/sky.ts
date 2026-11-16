import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, DirectionalLight, Fog, HemisphereLight, MathUtils,
  PCFShadowMap, Points, PointsMaterial, Vector3, type Scene, type WebGLRenderer,
} from 'three';
import { CSM } from 'three/addons/csm/CSM.js';
import { Rng } from '../sim/rng';
import { nightF, tod } from '../sim/world';
import type { CameraRig } from './camera-rig';
import { useCSM } from './materials';
import type { Quality } from './quality';

type Key = readonly [number, string];
/** Sky (background and fog) through the day; timing follows the prototype's SKY table. */
const SKY: readonly Key[] = [
  [0, '#141b36'], [0.2, '#141b36'], [0.255, '#d99a8c'], [0.32, '#a9d8f2'],
  [0.69, '#a9d8f2'], [0.75, '#eea07c'], [0.81, '#141b36'], [1, '#141b36'],
];
const SUNRISE = 0.245, SUNSET = 0.765;
const tmpA = new Color(), tmpB = new Color();

function sample(keys: readonly Key[], t: number, out: Color): Color {
  for (let i = 1; i < keys.length; i++) {
    const [b, cb] = keys[i]!;
    if (t <= b) {
      const [a, ca] = keys[i - 1]!;
      return out.copy(tmpA.set(ca)).lerp(tmpB.set(cb), (t - a) / (b - a || 1));
    }
  }
  return out.set(keys[0]![1]);
}

/** Direction to a body crossing the sky: phase 0 = rising in the east, 1 = setting in the west. */
function arc(phase: number, maxEl: number, out: Vector3): Vector3 {
  const az = Math.PI * phase, el = Math.max(MathUtils.degToRad(14), Math.sin(Math.PI * phase) * maxEl);
  return out.set(Math.cos(az) * Math.cos(el), Math.sin(el), 0.42 * Math.cos(el)).normalize();
}

/**
 * Day and night: one key light (sun by day, moon by night) that casts shadows, a hemisphere
 * fill, sky and fog colours, and stars. The key light is either one shadow map that follows
 * the camera or three.js cascaded shadow maps.
 */
export class Sky {
  readonly sky = new Color();
  /** 0 by day, 1 at night (the prototype's nightF). */
  night = 0;
  private hemi = new HemisphereLight('#eaf6ff', '#7a6a48', 1.5);
  private key: DirectionalLight | null = null;
  /** Exposed for debugging through window.__hv.renderer.sky.csm. */
  readonly csm: CSM | null = null;
  private stars: Points;
  private dir = new Vector3();
  private lastFar = 0;

  constructor(private scene: Scene, gl: WebGLRenderer, private rig: CameraRig, q: Quality) {
    scene.add(this.hemi);
    scene.fog = new Fog(this.sky, 40, 120);
    scene.background = this.sky;
    gl.shadowMap.enabled = q.shadows !== 'none';
    gl.shadowMap.type = PCFShadowMap; // r187 removed PCFSoftShadowMap

    if (q.shadows === 'csm') {
      this.csm = new CSM({
        camera: rig.camera,
        parent: scene,
        cascades: 3,
        maxFar: 90,
        mode: 'practical',
        shadowMapSize: q.shadowSize,
        lightDirection: new Vector3(-1, -1, -0.4).normalize(),
        lightIntensity: 2,
        lightMargin: 40,
        lightFar: 300,
        shadowBias: -0.0004,
      });
      this.csm.fade = true;
      for (const l of this.csm.lights) l.shadow.normalBias = 0.04;
    } else {
      const k = new DirectionalLight('#fff2dc', 2);
      k.castShadow = q.shadows === 'single';
      k.shadow.mapSize.set(q.shadowSize, q.shadowSize);
      k.shadow.bias = -0.0005;
      k.shadow.normalBias = 0.04;
      k.shadow.camera.near = 1;
      k.shadow.camera.far = 260;
      scene.add(k, k.target);
      this.key = k;
    }
    useCSM(this.csm);

    // Stars: points on a dome that travels with the camera, faded in at night.
    const R = new Rng(7), n = q.stars, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = R.next() * Math.PI * 2, y = 0.08 + R.next() * 0.92, r = Math.sqrt(1 - y * y);
      pos.set([Math.cos(a) * r * 300, y * 300, Math.sin(a) * r * 300], i * 3);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    this.stars = new Points(g, new PointsMaterial({
      color: '#fff6dc', size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false,
      depthWrite: false, blending: AdditiveBlending,
    }));
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -1;
    scene.add(this.stars);
  }

  update(t: number): void {
    const d = tod(t);
    this.night = nightF(t);
    sample(SKY, d, this.sky);
    (this.scene.fog as Fog).color.copy(this.sky);

    // Key light: the sun by day, the moon by night, dimming to nothing at the horizon so
    // the swap is invisible.
    let intensity: number;
    const col = tmpA;
    if (d > SUNRISE && d < SUNSET) {
      const p = (d - SUNRISE) / (SUNSET - SUNRISE), up = Math.sin(Math.PI * p);
      arc(p, MathUtils.degToRad(62), this.dir);
      intensity = 2.7 * MathUtils.smoothstep(up, 0, 0.3);
      col.set('#ffad78').lerp(tmpB.set('#fff2dc'), MathUtils.smoothstep(up, 0.1, 0.6));
    } else {
      const p = ((d - SUNSET + 1) % 1) / (1 - SUNSET + SUNRISE), up = Math.sin(Math.PI * p);
      arc(p, MathUtils.degToRad(48), this.dir);
      intensity = 0.7 * MathUtils.smoothstep(up, 0, 0.35);
      col.set('#a9b9ff');
    }
    const day = 1 - this.night;
    this.hemi.intensity = 0.75 + 0.6 * day;
    this.hemi.color.set('#4a5a96').lerp(tmpB.set('#eaf6ff'), day);
    this.hemi.groundColor.set('#1e2236').lerp(tmpB.set('#7a6a48'), day);
    (this.stars.material as PointsMaterial).opacity = MathUtils.smoothstep(this.night, 0.3, 1);
    this.stars.position.copy(this.rig.camera.position);

    const { fx, fy, fz } = this.rig;
    if (this.csm) {
      this.csm.lightDirection.copy(this.dir).negate();
      for (const l of this.csm.lights) {
        l.intensity = intensity;
        l.color.copy(col);
      }
      const far = this.rig.dist * 1.7 + 30;
      if (Math.abs(far - this.lastFar) > 2) {
        this.lastFar = far;
        this.csm.maxFar = far;
        this.csm.updateFrustums();
      }
      this.csm.update();
    } else if (this.key) {
      const k = this.key, half = this.rig.dist * 1.0 + 14;
      const cam = k.shadow.camera;
      if (cam.right !== half) {
        cam.left = cam.bottom = -half;
        cam.right = cam.top = half;
        cam.updateProjectionMatrix();
      }
      // Snap to the shadow texel grid so edges don't crawl as the camera pans.
      const texel = (2 * half) / k.shadow.mapSize.x;
      const sx = Math.round(fx / texel) * texel, sz = Math.round(fz / texel) * texel;
      k.target.position.set(sx, fy, sz);
      k.position.set(sx + this.dir.x * 120, fy + this.dir.y * 120, sz + this.dir.z * 120);
      k.intensity = intensity;
      k.color.copy(col);
    }
  }

  /** Call when the camera's projection changes size. */
  resize(): void {
    this.csm?.updateFrustums();
  }
}
