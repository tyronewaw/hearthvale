import { MeshDepthMaterial, type Material, type Mesh } from 'three';
import type { CSM } from 'three/addons/csm/CSM.js';
import { bent } from './bend';

let csm: CSM | null = null;

/** Register the cascaded-shadow manager before any world material is created. */
export function useCSM(c: CSM | null): void {
  csm = c;
}

/**
 * Prepare a material for the world: hook it into cascaded shadows (if on), then into the
 * planet bend. Order matters: CSM replaces onBeforeCompile and `bent` chains onto it.
 */
export function worldMat<T extends Material>(m: T): T {
  if (csm) csm.setupMaterial(m);
  return bent(m);
}

/**
 * Add more shader code on top of a material's existing hooks (CSM, bend). `key` keeps
 * the compiled program separate from other variants.
 */
export function extendShader<T extends Material>(m: T, key: string, fn: Material['onBeforeCompile']): T {
  const prev = m.onBeforeCompile.bind(m);
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    fn(sh, r);
  };
  const prevKey = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => prevKey() + '|' + key;
  return m;
}

/** Shadow-pass material that bends like everything else, so shadows line up. */
const depthMat = bent(new MeshDepthMaterial());

export function castsShadow(mesh: Mesh): void {
  mesh.castShadow = true;
  mesh.customDepthMaterial = depthMat;
}
