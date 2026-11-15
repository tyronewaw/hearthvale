import {
  Color, DataTexture, LinearFilter, Mesh, MeshLambertMaterial, PlaneGeometry, RedFormat, RepeatWrapping,
  UnsignedByteType,
} from 'three';
import { D8, N, idx, type State } from '../sim/world';
import { extendShader, worldMat } from './materials';
import { WATER_Y } from './scale';

/** How many vertices out from the coast the shallows reach. */
const REACH = 6;

/**
 * Stylised sea: turquoise shallows fading to deep blue, a foam band that laps at the shore,
 * and twinkling sparkles. Shore distance comes from a small texture baked from the
 * heightmap. It uses RepeatWrapping, so it tiles round the planet for free.
 */
export class Water {
  readonly mesh: Mesh;
  private tex: DataTexture;
  private data = new Uint8Array(N * N);
  private uniforms = {
    uShore: { value: null as DataTexture | null },
    uTime: { value: 0 },
    uN: { value: N },
    uDeep: { value: new Color('#2d6aa6') },
    uShallow: { value: new Color('#5cc6cf') },
    uFoam: { value: new Color('#f4fbff') },
  };
  private dirty = true;

  constructor(private S: State) {
    this.tex = new DataTexture(this.data, N, N, RedFormat, UnsignedByteType);
    this.tex.wrapS = this.tex.wrapT = RepeatWrapping;
    this.tex.magFilter = this.tex.minFilter = LinearFilter;
    this.tex.generateMipmaps = false;
    this.uniforms.uShore.value = this.tex;

    const g = new PlaneGeometry(220, 220, 110, 110);
    g.rotateX(-Math.PI / 2);
    const m = worldMat(new MeshLambertMaterial({ color: '#ffffff', transparent: true, depthWrite: false }));
    const U = this.uniforms;
    extendShader(m, 'water', (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vWaterXZ;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWaterXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', /* glsl */ `#include <common>
varying vec2 vWaterXZ;
uniform sampler2D uShore;
uniform float uTime, uN;
uniform vec3 uDeep, uShallow, uFoam;
float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
        .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
{
  float s = texture2D(uShore, (vWaterXZ + 0.5) / uN).r;
  vec3 col = mix(uDeep, uShallow, smoothstep(0.15, 0.9, s));
  // foam: a steady rim at the waterline plus a band that laps in and out
  float lap = sin(uTime * 1.4 + vWaterXZ.x * 0.9 + vWaterXZ.y * 0.6) * 0.5 + 0.5;
  float rim = smoothstep(0.885, 0.93, s);
  float band = smoothstep(0.03, 0.0, abs(s - (0.74 + lap * 0.1))) * smoothstep(0.55, 0.75, s);
  float foam = max(rim, band * 0.75);
  // sparkles: a few cells twinkle on the open water
  vec2 cell = floor(vWaterXZ * 2.5);
  float tw = step(0.992, wHash(cell + floor(uTime * 0.7 + wHash(cell) * 7.0)));
  col += tw * 0.35 * (1.0 - s);
  diffuseColor.rgb = mix(col, uFoam, foam);
  diffuseColor.a = max(mix(0.86, 0.6, s), foam);
}`);
    });
    this.mesh = new Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 1;
  }

  setState(S: State): void {
    this.S = S;
    this.dirty = true;
  }

  markDirty(): void {
    this.dirty = true;
  }

  /** Rebake shore distances (multi-source BFS from land, wrapping; under 1 ms at 128²). */
  private bake(): void {
    const H = this.S.h, dist = new Int8Array(N * N).fill(-1), q: number[] = [];
    for (let v = 0; v < N * N; v++)
      if (H[v]! > 0) {
        dist[v] = 0;
        q.push(v);
      }
    for (let head = 0; head < q.length; head++) {
      const v = q[head]!, d = dist[v]!;
      if (d >= REACH) continue;
      const x = v % N, y = (v / N) | 0;
      for (const [dx, dy] of D8) {
        const n = idx(x + dx, y + dy);
        if (dist[n] === -1) {
          dist[n] = d + 1;
          q.push(n);
        }
      }
    }
    for (let v = 0; v < N * N; v++) {
      const d = dist[v]!;
      this.data[v] = d < 0 ? 0 : Math.round(255 * (1 - d / REACH));
    }
    this.tex.needsUpdate = true;
  }

  update(time: number, fx: number, fz: number): void {
    if (this.dirty) {
      this.dirty = false;
      this.bake();
    }
    this.uniforms.uTime.value = time;
    this.mesh.position.set(Math.round(fx), WATER_Y, Math.round(fz));
  }
}
