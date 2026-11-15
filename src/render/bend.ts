import { Vector2, type Material, type WebGLProgramParametersWithUniforms } from 'three';

/**
 * The Populous-style planet curve. Every world vertex drops by k·r², where r is its
 * horizontal distance from the camera focus. It is a pure vertex-shader effect: the sim,
 * physics and picking all work on the flat world and use `bendDrop` to match the picture.
 */
export const bend = {
  focus: new Vector2(),
  k: 0.005,
};

const uniforms = {
  uBendFocus: { value: bend.focus },
  uBendK: { value: 0 },
};

/** Call once per frame after the camera moves. */
export function syncBendUniforms(): void {
  uniforms.uBendK.value = bend.k;
}

export function bendDrop(x: number, z: number): number {
  const dx = x - bend.focus.x, dz = z - bend.focus.y;
  return bend.k * (dx * dx + dz * dz);
}

const HEADER = 'uniform vec2 uBendFocus;\nuniform float uBendK;\n';

// Same as three's project_vertex, but the world-space position is bent before the view
// transform.
const PROJECT = /* glsl */ `
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
  mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
vec4 bendWorld = modelMatrix * mvPosition;
vec2 bendD = bendWorld.xz - uBendFocus;
bendWorld.y -= uBendK * dot( bendD, bendD );
mvPosition = viewMatrix * bendWorld;
gl_Position = projectionMatrix * mvPosition;
`;

// worldPosition feeds shadow-map lookups, so it must be bent the same way.
const WORLDPOS_AFTER = /* glsl */ `
#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
  vec2 bendD2 = worldPosition.xz - uBendFocus;
  worldPosition.y -= uBendK * dot( bendD2, bendD2 );
#endif
`;

export function patchBendShader(sh: WebGLProgramParametersWithUniforms): void {
  sh.uniforms.uBendFocus = uniforms.uBendFocus;
  sh.uniforms.uBendK = uniforms.uBendK;
  sh.vertexShader =
    HEADER +
    sh.vertexShader
      .replace('#include <project_vertex>', PROJECT)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n' + WORLDPOS_AFTER);
}

/** Make a material follow the planet curve. Returns the same material. */
export function bent<T extends Material>(m: T): T {
  const prev = m.onBeforeCompile.bind(m);
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    patchBendShader(sh);
  };
  const key = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => key() + '|bend';
  return m;
}
