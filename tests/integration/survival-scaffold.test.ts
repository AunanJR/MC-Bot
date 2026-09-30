import type { Bot } from 'mineflayer';
import { Schematic } from 'nucleation';
import { Vec3 } from 'vec3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadSchematic } from '../../src/schematic/load.js';
import { buildBounds, toPlacements } from '../../src/schematic/placement.js';
import { buildSurvival } from '../../src/survival/build.js';
import { summarize } from '../../src/verify/verify.js';
import { connect, prepareWorld, resetSurvivalBot, setupChest } from './helpers.js';

/** A 10-high column with a 3x3 platform on top: the top is out of reach from the ground. */
function tower() {
  const s = Schematic.create('tower');
  for (let y = 0; y < 10; y++) s.setBlockFromString(1, y, 1, 'minecraft:stone_bricks');
  for (let x = 0; x < 3; x++) for (let z = 0; z < 3; z++) s.setBlockFromString(x, 10, z, 'minecraft:oak_planks');
  return loadSchematic(Buffer.from(s.toLitematicB64(), 'base64'), 'tower.litematic');
}

describe('survival scaffolding', () => {
  let bot: Bot;

  beforeAll(async () => {
    bot = await connect();
    await prepareWorld(bot);
    await resetSurvivalBot(bot);
  });

  afterAll(() => bot?.quit());

  it('towers up with dirt to reach high blocks and removes the scaffold afterwards', async () => {
    const schem = tower();
    const transform = { origin: { x: 300, y: -60, z: 40 }, rotation: 0 as const };
    const chestPos = { x: 296, y: -60, z: 46 };
    await setupChest(bot, chestPos, [
      ['minecraft:stone_bricks', 10],
      ['minecraft:oak_planks', 9],
      ['minecraft:dirt', 64],
    ]);
    const logs: string[] = [];
    const result = await buildSurvival(bot, {
      placements: toPlacements(schem, transform),
      bounds: buildBounds(schem, transform),
      chestPos,
      log: (m) => {
        logs.push(m);
        console.log(m);
      },
    });
    console.log(`scaffold build: ${summarize(result.report!)}`);
    expect(result.report!.accuracy).toBe(1);
    expect(logs.some((l) => /removed [1-9]\d* scaffold blocks/.test(l))).toBe(true);

    // No dirt left above the ground around the tower.
    await new Promise((r) => setTimeout(r, 1000));
    const o = transform.origin;
    const leftovers: string[] = [];
    for (let y = o.y; y <= o.y + 12; y++) {
      for (let x = o.x - 4; x <= o.x + 6; x++) {
        for (let z = o.z - 4; z <= o.z + 6; z++) {
          if (bot.blockAt(new Vec3(x, y, z))?.name === 'dirt') leftovers.push(`${x},${y},${z}`);
        }
      }
    }
    expect(leftovers).toEqual([]);
  });
});
