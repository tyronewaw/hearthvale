import { BufferAttribute, BufferGeometry } from 'three';

/**
 * Models made in Blender by scripts/blender/*.py (see hvblend.export): plain triangles in game
 * axes, packed as base64 of int16 positions (1/4096 units), int8 normals and one byte per
 * vertex: an index into the file's colour palette, with bit 7 set on tinted parts.
 */
export interface BlendFile {
  /** Linear RGB colours. */
  palette: number[][];
  models: Record<string, string>;
}

function bytes(b64: string): Uint8Array {
  const s = atob(b64), out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** A geometry with position, normal, color and tint attributes, or null if the file lacks the model. */
export function blendGeo(file: BlendFile, name: string): BufferGeometry | null {
  const b64 = file.models[name];
  if (!b64) return null;
  const raw = bytes(b64), n = raw.length / 10;
  const pos = new Int16Array(raw.buffer.slice(0, n * 6)), nor = new Int8Array(raw.buffer.slice(n * 6, n * 9)), col = raw.subarray(n * 9);
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3), T = new Float32Array(n);
  for (let i = 0; i < n * 3; i++) {
    P[i] = pos[i]! / 4096;
    N[i] = nor[i]! / 127;
  }
  for (let i = 0; i < n; i++) {
    const c = file.palette[col[i]! & 0x7f]!;
    C[i * 3] = c[0]!;
    C[i * 3 + 1] = c[1]!;
    C[i * 3 + 2] = c[2]!;
    T[i] = col[i]! & 0x80 ? 1 : 0;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(P, 3));
  g.setAttribute('normal', new BufferAttribute(N, 3));
  g.setAttribute('color', new BufferAttribute(C, 3));
  g.setAttribute('tint', new BufferAttribute(T, 1));
  g.computeBoundingSphere();
  return g;
}
