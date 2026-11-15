import { BufferAttribute, BufferGeometry, Color, Euler, Matrix4, Quaternion, Vector3, type ColorRepresentation } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type FaceColour = ColorRepresentation | ((face: number, faces: number, centre: Vector3) => ColorRepresentation);

export interface Place {
  pos?: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number] | number;
}

const tmpC = new Color(), m4 = new Matrix4(), q = new Quaternion(), e = new Euler(), v = new Vector3(), s = new Vector3();
const centre = new Vector3();

/**
 * A tiny model kit: add primitive parts with a colour (or a per-face colour function),
 * place them, and merge everything into one flat-shaded, vertex-coloured geometry.
 * Every building and prop is built this way, so a whole village is a handful of draw calls.
 */
export class Kit {
  private parts: BufferGeometry[] = [];

  add(g: BufferGeometry, colour: FaceColour, at: Place = {}): this {
    const geo = (g.index ? g.toNonIndexed() : g.clone()) as BufferGeometry;
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
    const sc = at.scale ?? 1;
    m4.compose(
      v.set(...(at.pos ?? [0, 0, 0])),
      q.setFromEuler(e.set(...(at.rot ?? [0, 0, 0]))),
      typeof sc === 'number' ? s.setScalar(sc) : s.set(...sc),
    );
    geo.applyMatrix4(m4);
    const pos = geo.getAttribute('position') as BufferAttribute, n = pos.count, col = new Float32Array(n * 3), faces = n / 3;
    for (let f = 0; f < faces; f++) {
      if (typeof colour === 'function') {
        centre.set(0, 0, 0);
        for (let k = 0; k < 3; k++) centre.add(v.fromBufferAttribute(pos, f * 3 + k));
        centre.multiplyScalar(1 / 3);
        tmpC.set(colour(f, faces, centre));
      } else tmpC.set(colour);
      for (let k = 0; k < 3; k++) col.set([tmpC.r, tmpC.g, tmpC.b], (f * 3 + k) * 3);
    }
    geo.setAttribute('color', new BufferAttribute(col, 3));
    this.parts.push(geo);
    return this;
  }

  /** Merge another kit's parts in, placed as a whole. */
  addKit(k: Kit, at: Place = {}): this {
    const g = k.build();
    return this.addColoured(g, at);
  }

  private addColoured(g: BufferGeometry, at: Place): this {
    const sc = at.scale ?? 1;
    m4.compose(
      v.set(...(at.pos ?? [0, 0, 0])),
      q.setFromEuler(e.set(...(at.rot ?? [0, 0, 0]))),
      typeof sc === 'number' ? s.setScalar(sc) : s.set(...sc),
    );
    g.applyMatrix4(m4);
    this.parts.push(g);
    return this;
  }

  build(): BufferGeometry {
    const g = mergeGeometries(this.parts)!;
    g.computeBoundingSphere();
    return g;
  }
}
