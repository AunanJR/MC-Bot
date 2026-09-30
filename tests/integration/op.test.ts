import type { Bot } from 'mineflayer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildOp } from '../../src/builder/op.js';
import { summarize } from '../../src/verify/verify.js';
import { buildBounds, toPlacements } from '../../src/schematic/placement.js';
import type { Rotation } from '../../src/schematic/rotate.js';
import { connect, loadFixture, prepareWorld } from './helpers.js';

describe('op mode builds small_house', () => {
  let bot: Bot;
  const schem = loadFixture();

  beforeAll(async () => {
    bot = await connect();
    await prepareWorld(bot);
  });

  afterAll(() => bot?.quit());

  const cases: { rotation: Rotation; origin: { x: number; y: number; z: number }; flag: 'strict' | 'replace' }[] = [
    { rotation: 0, origin: { x: 40, y: -60, z: 40 }, flag: 'strict' },
    { rotation: 90, origin: { x: 60, y: -60, z: 40 }, flag: 'strict' },
    { rotation: 270, origin: { x: 80, y: -60, z: 40 }, flag: 'replace' },
  ];

  for (const c of cases) {
    it(`rotation ${c.rotation} at ${c.origin.x},${c.origin.y},${c.origin.z} (${c.flag}) reaches 100%`, async () => {
      const transform = { origin: c.origin, rotation: c.rotation };
      const placements = toPlacements(schem, transform);
      const result = await buildOp(
        bot,
        { placements, bounds: buildBounds(schem, transform), log: (m) => console.log(m) },
        { placementFlag: c.flag, commandsPerSecond: 40 },
      );
      expect(result.report).not.toBeNull();
      console.log(`op accuracy rotation=${c.rotation}: ${summarize(result.report!)}`);
      expect(result.report!.diffs.slice(0, 10)).toEqual([]);
      expect(result.report!.accuracy).toBe(1);
    });
  }
});
