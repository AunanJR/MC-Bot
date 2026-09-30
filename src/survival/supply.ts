import type { Bot } from 'mineflayer';
import pathfinderPkg from 'mineflayer-pathfinder';
import { shortName } from '../schematic/blockstate.js';
import type { Vec3Like } from '../schematic/rotate.js';
import { vec } from './world.js';

const { goals } = pathfinderPkg;

export function inventoryCounts(bot: Bot): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of bot.inventory.items()) out[`minecraft:${it.name}`] = (out[`minecraft:${it.name}`] ?? 0) + it.count;
  return out;
}

export function countInInventory(bot: Bot, item: string): number {
  const name = shortName(item);
  return bot.inventory.items().filter((i) => i.name === name).reduce((n, i) => n + i.count, 0);
}

export interface RefillResult {
  /** What the chest held after withdrawing, item -> count. */
  chest: Record<string, number>;
  withdrawn: Record<string, number>;
}

/**
 * Walks to the supply chest and takes what the upcoming placements need, in
 * build order, until `maxSlots` inventory slots are used.
 */
export async function refillFromChest(bot: Bot, chestPos: Vec3Like, wanted: [string, number][], maxSlots: number): Promise<RefillResult> {
  await bot.pathfinder.goto(new goals.GoalNear(chestPos.x, chestPos.y, chestPos.z, 3));
  const block = bot.blockAt(vec(chestPos));
  if (!block || !/chest|barrel|shulker_box/.test(block.name)) {
    throw new Error(`no chest at ${chestPos.x},${chestPos.y},${chestPos.z} (found ${block?.name ?? 'unloaded chunk'})`);
  }
  const window = await bot.openContainer(block);
  const withdrawn: Record<string, number> = {};
  try {
    // While the chest is open, the player's inventory lives in the window's lower slots.
    const inv = () => window.items();
    for (const [item, need] of wanted) {
      const name = shortName(item);
      const def = bot.registry.itemsByName[name];
      if (!def) continue;
      const mine = inv().filter((i) => i.name === name);
      let want = need - mine.reduce((n, i) => n + i.count, 0);
      if (want <= 0) continue;
      const inChest = window.containerItems().filter((i) => i.name === name).reduce((n, i) => n + i.count, 0);
      const freeSlots = Math.max(0, maxSlots - inv().length);
      const partial = mine.reduce((n, i) => n + (i.stackSize - i.count), 0);
      want = Math.min(want, inChest, partial + freeSlots * def.stackSize);
      if (want <= 0) continue;
      await window.withdraw(def.id, null, want);
      withdrawn[item] = want;
    }
    const chest: Record<string, number> = {};
    for (const i of window.containerItems()) chest[`minecraft:${i.name}`] = (chest[`minecraft:${i.name}`] ?? 0) + i.count;
    return { chest, withdrawn };
  } finally {
    window.close();
  }
}
