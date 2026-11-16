/**
 * Quality tiers. Picked automatically (phones get `low`), overridable with ?q=low|medium|high.
 */
export type Tier = 'low' | 'medium' | 'high';

export interface Quality {
  tier: Tier;
  pixelRatio: number;
  antialias: boolean;
  /** Cascaded shadows, one shadow map that follows the camera, or none. */
  shadows: 'csm' | 'single' | 'none';
  shadowSize: number;
  softShadows: boolean;
  stars: number;
  clouds: number;
  /** Fraction of flower tiles that get drawn. */
  flowers: number;
}

const TIERS: Record<Tier, Omit<Quality, 'tier' | 'pixelRatio'>> = {
  low: { antialias: false, shadows: 'single', shadowSize: 1024, softShadows: false, stars: 160, clouds: 6, flowers: 0.5 },
  medium: { antialias: true, shadows: 'single', shadowSize: 2048, softShadows: true, stars: 300, clouds: 10, flowers: 1 },
  high: { antialias: true, shadows: 'csm', shadowSize: 2048, softShadows: true, stars: 400, clouds: 12, flowers: 1 },
};

export function detectQuality(): Quality {
  const q = new URLSearchParams(location.search).get('q');
  const coarse = matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency || 4;
  const tier: Tier = q === 'low' || q === 'medium' || q === 'high' ? q : coarse ? 'low' : cores <= 4 ? 'medium' : 'high';
  const dpr = devicePixelRatio || 1;
  return { tier, ...TIERS[tier], pixelRatio: Math.min(dpr, tier === 'low' ? 1.75 : 2) };
}
