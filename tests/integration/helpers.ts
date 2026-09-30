import { readFileSync } from 'node:fs';
import type { Bot } from 'mineflayer';
import { inject } from 'vitest';
import { commandWithFeedback, connectBot } from '../../src/bot/connect.js';
import { loadSchematic } from '../../src/schematic/load.js';

export const BOT_NAME = 'Blueprint';

export function mcTarget() {
  const mc = inject('mc');
  return { host: mc.host, port: mc.port, username: BOT_NAME };
}

export function loadFixture() {
  return loadSchematic(readFileSync(new URL('../fixtures/small_house.litematic', import.meta.url)), 'small_house.litematic');
}

export async function connect(): Promise<Bot> {
  return connectBot(mcTarget());
}

/** Makes the test world static: no time, weather, mobs or random ticks. */
export async function prepareWorld(bot: Bot): Promise<void> {
  for (const cmd of [
    '/gamerule advance_time false',
    '/gamerule advance_weather false',
    '/gamerule spawn_mobs false',
    '/gamerule random_tick_speed 0',
    '/kill @e[type=!player]',
  ]) {
    await commandWithFeedback(bot, cmd, 200);
  }
}

/** Puts the bot in survival with an empty inventory. */
export async function resetSurvivalBot(bot: Bot): Promise<void> {
  await commandWithFeedback(bot, '/gamemode survival @s', 300);
  await commandWithFeedback(bot, '/clear @s', 300);
  await commandWithFeedback(bot, '/effect give @s minecraft:resistance infinite 4 true', 300);
}

/** Places a fresh chest and fills it; `items` are [item, count] with count <= 64 per entry. */
export async function setupChest(bot: Bot, pos: { x: number; y: number; z: number }, items: [string, number][]): Promise<void> {
  // The chunk must be loaded for /setblock; stand next to the chest.
  await commandWithFeedback(bot, `/tp @s ${pos.x + 1.5} ${pos.y} ${pos.z + 0.5}`, 1500);
  await commandWithFeedback(bot, `/setblock ${pos.x} ${pos.y} ${pos.z} minecraft:air`, 200);
  await commandWithFeedback(bot, `/setblock ${pos.x} ${pos.y} ${pos.z} minecraft:chest[facing=north]`, 200);
  await addToChest(bot, pos, items, 0);
}

export async function addToChest(bot: Bot, pos: { x: number; y: number; z: number }, items: [string, number][], firstSlot: number): Promise<void> {
  let slot = firstSlot;
  for (const [item, count] of items) {
    let left = count;
    while (left > 0) {
      const n = Math.min(64, left);
      const lines = await commandWithFeedback(bot, `/item replace block ${pos.x} ${pos.y} ${pos.z} container.${slot} with ${item} ${n}`, 150);
      if (lines.some((l) => /error|unknown|incorrect|invalid/i.test(l))) throw new Error(`chest setup failed: ${lines.join(' | ')}`);
      slot++;
      left -= n;
    }
  }
}
