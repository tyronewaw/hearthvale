/** Game definitions ported from the prototype (names, sizes, costs, roles). */

/** Home level names, tepee (0) to great lodge (5). */
export const BN = ['Tepee', 'Hut', 'Round hut', 'Big hut', 'Longhouse', 'Great lodge'] as const;
/** Most villagers each home level holds (proto). */
export const BMAX = [2, 4, 7, 11, 16, 24] as const;
/** Open flat fields (of the 5×5 around a home) each level needs (proto). */
export const BTH = [0, 4, 9, 14, 19, 25] as const;

export type RoleId = 'settler' | 'farmer' | 'forester' | 'fisher' | 'builder' | 'priest';
export const ROLE_NAME: Record<RoleId, string> = {
  settler: 'villager', farmer: 'farmer', forester: 'forester', fisher: 'fisher', builder: 'builder', priest: 'priest',
};

export type StructKind = 'hearth' | 'farm' | 'lumber' | 'fish' | 'shrine' | 'pen';
export interface StructDef {
  name: string;
  wood: number;
  cap: number;
  role: RoleId;
  desc: string;
}
export const STRUCTS: Record<StructKind, StructDef> = {
  hearth: { name: 'Hearth', wood: 0, cap: 4, role: 'builder', desc: 'The village heart and store. Drop villagers here to make builders. Only one.' },
  farm: { name: 'Farm', wood: 10, cap: 4, role: 'farmer', desc: 'Needs a flat 2×2 patch. Farmers work the fields round it for food.' },
  lumber: { name: 'Lumber camp', wood: 6, cap: 3, role: 'forester', desc: 'Needs a flat 2×2 patch. Foresters fell and replant nearby trees for wood.' },
  fish: { name: 'Fishing hut', wood: 8, cap: 3, role: 'fisher', desc: 'Takes 2×2 tiles of dry land right beside the sea or a lake. Fishers bring in food all year.' },
  shrine: { name: 'Shrine', wood: 25, cap: 3, role: 'priest', desc: 'Needs a flat 2×2 patch. Priests pray here for extra faith.' },
  pen: { name: 'Pet pen', wood: 12, cap: 0, role: 'settler', desc: 'Your pet\'s own home. It sleeps here and rests twice as fast, and its bedding fertilises farms nearby. Only one.' },
};
/** Buildings that can only be built once. */
export const UNIQUE: readonly StructKind[] = ['hearth', 'pen'];
/** Bump when the quest chain changes, so saves can map their quest index (see quests.ts). */
export const QUEST_VERSION = 3;
export const STRUCT_KINDS = Object.keys(STRUCTS) as StructKind[];

export type ToolId = 'hand' | 'raise' | 'lower' | 'build' | 'totem' | 'bloom' | 'flat' | 'rain' | 'isle' | 'fest';

export interface ToolDef {
  id: ToolId;
  name: string;
  /** Faith cost per use. */
  cost: number;
  /** Population needed to unlock. */
  need: number;
  /** Radius shown on the cursor (blessings). */
  r: number;
  desc: string;
}

/** The toolbar, in key order 1–0 (blessings unlock with population, as in the prototype). */
export const TOOLS: readonly ToolDef[] = [
  { id: 'hand', name: 'Hand', cost: 0, need: 0, r: 0, desc: 'Grab villagers, trees and rocks; drop them somewhere new. Drop villagers on buildings to give them jobs. Drag empty land to look around.' },
  { id: 'raise', name: 'Raise', cost: 1, need: 0, r: 0, desc: 'Lift the earth a step. Right-click anywhere to lower instead.' },
  { id: 'lower', name: 'Lower', cost: 1, need: 0, r: 0, desc: 'Sink the earth a step. Lower it to the sea to make a lake.' },
  { id: 'build', name: 'Build', cost: 0, need: 0, r: 0, desc: '' },
  { id: 'totem', name: 'Totem', cost: 0, need: 0, r: 0, desc: 'Wanderers head here to look for land. Click the totem again to lift it.' },
  { id: 'bloom', name: 'Bloom', cost: 15, need: 25, r: 3, desc: 'Trees on the slopes and flowers all around. Trees help nearby homes grow.' },
  { id: 'flat', name: 'Level', cost: 20, need: 60, r: 2, desc: 'Smooth a 4×4 patch to the height you click. Perfect for fields.' },
  { id: 'rain', name: 'Rain', cost: 30, need: 110, r: 5, desc: 'A soft rain cloud. Homes and farms beneath it grow 2.5× faster for a while.' },
  { id: 'isle', name: 'Rise', cost: 40, need: 180, r: 2.2, desc: 'Lift a broad round patch, even straight out of the sea.' },
  { id: 'fest', name: 'Festival', cost: 80, need: 280, r: 0, desc: 'Bunting and lanterns everywhere. Every home grows twice as fast for 40 seconds.' },
];
export const TOOL: Partial<Record<ToolId, ToolDef>> = Object.fromEntries(TOOLS.map((t) => [t.id, t]));
