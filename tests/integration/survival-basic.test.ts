import type { Bot } from 'mineflayer';
import { Schematic } from 'nucleation';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ProgressEvent } from '../../src/builder/control.js';
import { loadSchematic } from '../../src/schematic/load.js';
import { buildBounds, toPlacements } from '../../src/schematic/placement.js';
import { buildSurvival } from '../../src/survival/build.js';
import { summarize } from '../../src/verify/verify.js';
import { addToChest, connect, prepareWorld, resetSurvivalBot, setupChest } from './helpers.js';

/** 5x4x5 box of full blocks: floor, two wall rings, a roof. 82 blocks. */
function solidBox() {
  const s = Schematic.create('solid_box');
  for (let x = 0; x < 5; x++) {
    for (let z = 0; z < 5; z++) {
      s.setBlockFromString(x, 0, z, 'minecraft:stone_bricks');
      s.setBlockFromString(x, 3, z, 'minecraft:oak_planks');
      const edge = x === 0 || x === 4 || z === 0 || z === 4;
      if (edge) {
        s.setBlockFromString(x, 1, z, 'minecraft:cobblestone');
        s.setBlockFromString(x, 2, z, 'minecraft:oak_planks');
      }
    }
  }
  return loadSchematic(Buffer.from(s.toLitematicB64(), 'base64'), 'solid_box.litematic');
}

describe('survival basics: solid blocks, chest refills, missing items', () => {
  let bot: Bot;

  beforeAll(async () => {
    bot = await connect();
    await prepareWorld(bot);
    await resetSurvivalBot(bot);
  });

  afterAll(() => bot?.quit());

  it('builds from the chest, waits for missing planks, then finishes at 100%', async () => {
    const schem = solidBox();
    expect(schem.blocks.length).toBe(82);
    const transform = { origin: { x: 200, y: -60, z: 40 }, rotation: 0 as const };
    const chestPos = { x: 197, y: -60, z: 46 };
    // 41 planks are needed; the chest starts with 20.
    await setupChest(bot, chestPos, [
      ['minecraft:stone_bricks', 25],
      ['minecraft:cobblestone', 16],
      ['minecraft:oak_planks', 20],
    ]);

    const events: ProgressEvent[] = [];
    const logs: string[] = [];
    let topped = false;
    const onProgress = (e: ProgressEvent) => {
      events.push(e);
      if (e.stage === 'waiting_for_items' && !topped) {
        topped = true;
        // Simulate a player restocking the chest while the bot waits.
        setTimeout(() => void addToChest(bot, chestPos, [['minecraft:oak_planks', 30]], 20), 1500);
      }
    };
    const result = await buildSurvival(
      bot,
      {
        placements: toPlacements(schem, transform),
        bounds: buildBounds(schem, transform),
        chestPos,
        onProgress,
        log: (m) => {
          logs.push(m);
          console.log(m);
        },
      },
      { carrySlots: 2, waitPollMs: 2000 },
    );

    const waiting = events.find((e) => e.stage === 'waiting_for_items');
    expect(waiting?.missing).toEqual({ 'minecraft:oak_planks': 21 });
    expect(logs.filter((l) => l.startsWith('refilled from chest')).length).toBeGreaterThanOrEqual(3);
    console.log(`survival basic accuracy: ${summarize(result.report!)}`);
    expect(result.report!.accuracy).toBe(1);
  });
});
