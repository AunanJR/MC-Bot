import { createRequire } from 'node:module';
import { parseState, shortName } from '../schematic/blockstate.js';

const require = createRequire(import.meta.url);

/** Blocks whose item has a different name. */
const RENAMED: Record<string, string> = {
  redstone_wire: 'redstone',
  tripwire: 'string',
  wheat: 'wheat_seeds',
  carrots: 'carrot',
  potatoes: 'potato',
  beetroots: 'beetroot_seeds',
  cocoa: 'cocoa_beans',
  sweet_berry_bush: 'sweet_berries',
  melon_stem: 'melon_seeds',
  pumpkin_stem: 'pumpkin_seeds',
  attached_melon_stem: 'melon_seeds',
  attached_pumpkin_stem: 'pumpkin_seeds',
  kelp_plant: 'kelp',
  cave_vines: 'glow_berries',
  cave_vines_plant: 'glow_berries',
  bamboo_sapling: 'bamboo',
  twisting_vines_plant: 'twisting_vines',
  weeping_vines_plant: 'weeping_vines',
  big_dripleaf_stem: 'big_dripleaf',
  torchflower_crop: 'torchflower_seeds',
  pitcher_crop: 'pitcher_pod',
  powder_snow: 'powder_snow_bucket',
  water: 'water_bucket',
  lava: 'lava_bucket',
};

/** Blocks that come for free with their other half, or cannot be placed as an item. */
function isSecondaryHalf(name: string, props: Record<string, string>): boolean {
  if (props.half === 'upper' && (name.endsWith('_door') || ['sunflower', 'lilac', 'rose_bush', 'peony', 'tall_grass', 'large_fern', 'tall_seagrass', 'pitcher_plant', 'small_dripleaf'].includes(name))) return true;
  if (name.endsWith('_bed') && props.part === 'head') return true;
  if (name === 'piston_head' || name === 'moving_piston') return true;
  return false;
}

export interface ItemNeed {
  item: string;
  count: number;
}

/** The item (and count) a survival player uses to place this block state, or null if none. */
export function itemForState(state: string): ItemNeed | null {
  const { name: full, props } = parseState(state);
  const name = shortName(full);
  if (isSecondaryHalf(name, props)) return null;
  let item = RENAMED[name] ?? name;
  item = item
    .replace(/_wall_torch$/, '_torch')
    .replace(/^wall_torch$/, 'torch')
    .replace(/_wall_hanging_sign$/, '_hanging_sign')
    .replace(/_wall_sign$/, '_sign')
    .replace(/_wall_banner$/, '_banner')
    .replace(/_wall_head$/, '_head')
    .replace(/_wall_skull$/, '_skull')
    .replace(/_wall_fan$/, '_fan');
  if (item.startsWith('potted_')) item = 'flower_pot';
  let count = 1;
  if (props.type === 'double' && name.endsWith('_slab')) count = 2;
  for (const key of ['candles', 'pickles', 'eggs', 'layers', 'flower_amount', 'segment_amount']) {
    if (props[key]) count = Number(props[key]);
  }
  return { item: `minecraft:${item}`, count };
}

/** Item totals for a list of block states; states without an item are counted under `unplaceable`. */
export function itemTotals(states: string[], version: string): { items: Record<string, number>; unplaceable: Record<string, number> } {
  const mcData = require('minecraft-data')(version);
  const items: Record<string, number> = {};
  const unplaceable: Record<string, number> = {};
  for (const state of states) {
    const need = itemForState(state);
    if (!need) {
      const { name, props } = parseState(state);
      if (!isSecondaryHalf(shortName(name), props)) unplaceable[name] = (unplaceable[name] ?? 0) + 1;
      continue;
    }
    if (!mcData.itemsByName[shortName(need.item)]) {
      const name = parseState(state).name;
      unplaceable[name] = (unplaceable[name] ?? 0) + 1;
      continue;
    }
    items[need.item] = (items[need.item] ?? 0) + need.count;
  }
  return { items, unplaceable };
}
