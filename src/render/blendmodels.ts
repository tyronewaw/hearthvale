import { BufferAttribute, BufferGeometry } from 'three';

/** One model as exported by scripts/blender/hvblend.py: plain triangles in game axes. */
export interface BlendModel {
  /** Positions, normals and linear colours, three numbers per vertex. */
  p: number[];
  n: number[];
  c: number[];
  /** 1 where the part takes the tribe's colour (see `tintable`). */
  t: number[];
}

/** A geometry for a Blender-made model, with position, normal, color and tint attributes. */
export function blendGeo(m: BlendModel): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(m.p), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(m.n), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(m.c), 3));
  g.setAttribute('tint', new BufferAttribute(new Float32Array(m.t), 1));
  g.computeBoundingSphere();
  return g;
}
