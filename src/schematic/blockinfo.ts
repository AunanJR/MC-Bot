import { shortName, withNamespace } from './blockstate.js';

const GRAVITY = [
  /^(red_)?sand$/, /^gravel$/, /_concrete_powder$/, /^(chipped_|damaged_)?anvil$/, /^dragon_egg$/,
  /^suspicious_(sand|gravel)$/, /^pointed_dripstone$/, /^scaffolding$/,
];

/**
 * Blocks that pop off (or cannot be placed) without a supporting block next to
 * or below them. Built last so their support is already in place.
 */
const ATTACHABLE = [
  /torch$/, /_button$/, /^lever$/, /^ladder$/, /_sign$/, /_banner$/, /_carpet$/, /^moss_carpet$/,
  /rail$/, /^redstone_wire$/, /^repeater$/, /^comparator$/, /_door$/, /_pressure_plate$/,
  /^tripwire(_hook)?$/, /_sapling$/, /^(short_|tall_)?grass$/, /^(large_)?fern$/, /^dead_bush$/,
  /_tulip$/, /^(dandelion|poppy|blue_orchid|allium|azure_bluet|oxeye_daisy|cornflower|lily_of_the_valley|wither_rose|torchflower|pink_petals|sunflower|lilac|rose_bush|peony)$/,
  /_mushroom$/, /^(wheat|carrots|potatoes|beetroots|melon_stem|pumpkin_stem|sweet_berry_bush|nether_wart)$/,
  /vines?$/, /^lantern$/, /^soul_lantern$/, /^bell$/, /candle$/, /^snow$/, /^sea_pickle$/, /^lily_pad$/,
  /^sugar_cane$/, /^cactus$/, /^kelp(_plant)?$/, /^seagrass$/, /^tall_seagrass$/, /_bed$/, /^flower_pot$/, /^potted_/,
  /coral_fan$/, /coral_wall_fan$/, /_coral$/, /^cocoa$/, /^glow_lichen$/, /^sculk_vein$/, /^hanging_roots$/,
  /^spore_blossom$/, /^small_dripleaf$/, /^big_dripleaf(_stem)?$/, /^amethyst_cluster$/, /_amethyst_bud$/,
  /^chain$/, /^end_rod$/, /^lightning_rod$/, /_head$/, /_skull$/, /_wall_head$/, /_wall_skull$/,
];

/** Blocks made of two linked halves where placing one creates the other. */
const DOUBLE_BLOCK = [/_door$/, /_bed$/, /^(sunflower|lilac|rose_bush|peony|tall_grass|large_fern|tall_seagrass|small_dripleaf)$/, /^pitcher_plant$/];

function matches(patterns: RegExp[], name: string): boolean {
  const short = shortName(withNamespace(name));
  return patterns.some((re) => re.test(short));
}

export function isGravityBlock(name: string): boolean {
  return matches(GRAVITY, name);
}

export function isAttachable(name: string): boolean {
  return matches(ATTACHABLE, name);
}

export function isDoubleBlock(name: string): boolean {
  return matches(DOUBLE_BLOCK, name);
}

export enum BuildPhase {
  Solid = 0,
  Gravity = 1,
  Attachable = 2,
}

export function buildPhase(name: string): BuildPhase {
  if (isAttachable(name)) return BuildPhase.Attachable;
  if (isGravityBlock(name)) return BuildPhase.Gravity;
  return BuildPhase.Solid;
}
