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
