import type { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';
import type { Vec3Like } from '../schematic/rotate.js';

/** Blocks a placement simply replaces; they are never used as the clicked neighbour. */
const REPLACEABLE = /^(air|cave_air|void_air|water|lava|short_grass|tall_grass|fern|large_fern|dead_bush|vine|seagrass|tall_seagrass|fire|soul_fire|light|structure_void|snow|bubble_column|glow_lichen|hanging_roots|crimson_roots|warped_roots|nether_sprouts|short_dry_grass|tall_dry_grass|bush|firefly_bush|leaf_litter)$/;

/** Blocks that do something when clicked; clicking them instead of placing would change their state. */
const INTERACTIVE = /(chest|barrel|shulker_box|furnace|smoker|crafting_table|_door|_trapdoor|_fence_gate|_button|^lever|anvil|enchanting_table|brewing_stand|beacon|hopper|dispenser|dropper|_bed|^bell|loom|cartography_table|grindstone|stonecutter|smithing_table|lectern|note_block|repeater|comparator|daylight_detector|cake|jukebox|respawn_anchor|_sign|crafter|chiseled_bookshelf|command_block|structure_block|jigsaw|flower_pot|^potted_|decorated_pot|vault|trial_spawner|campfire|composter|cauldron)$/;

export function isReplaceable(name: string): boolean {
  return REPLACEABLE.test(name);
}

export function isInteractive(name: string): boolean {
  return INTERACTIVE.test(name);
}

export function vec(p: Vec3Like): Vec3 {
  return new Vec3(p.x, p.y, p.z);
}

export function eyePosition(bot: Bot): Vec3 {
  return bot.entity.position.offset(0, (bot.entity as { eyeHeight?: number }).eyeHeight ?? 1.62, 0);
}

/** Distance from a point to the unit cube of a block. */
export function distanceToBlock(point: Vec3Like, block: Vec3Like): number {
  const dx = Math.max(block.x - point.x, 0, point.x - (block.x + 1));
  const dy = Math.max(block.y - point.y, 0, point.y - (block.y + 1));
  const dz = Math.max(block.z - point.z, 0, point.z - (block.z + 1));
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** True when the bot's bounding box overlaps the cell. */
export function botOccupies(bot: Bot, cell: Vec3Like): boolean {
  const p = bot.entity.position;
  const w = 0.3;
  const h = bot.entity.height ?? 1.8;
  return p.x + w > cell.x && p.x - w < cell.x + 1 && p.y + h > cell.y && p.y < cell.y + 1 && p.z + w > cell.z && p.z - w < cell.z + 1;
}
