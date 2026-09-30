import type { Bot } from 'mineflayer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildBounds, toPlacements } from '../../src/schematic/placement.js';
import type { Rotation } from '../../src/schematic/rotate.js';
import { buildSurvival } from '../../src/survival/build.js';
import { itemTotals } from '../../src/survival/items.js';
import { summarize } from '../../src/verify/verify.js';
import { connect, loadFixture, prepareWorld, resetSurvivalBot, setupChest } from './helpers.js';

describe('survival mode builds small_house', () => {
  let bot: Bot;
  const schem = loadFixture();

  beforeAll(async () => {
    bot = await connect();
    await prepareWorld(bot);
  });

  afterAll(() => bot?.quit());

  const cases: { rotation: Rotation; origin: { x: number; y: number; z: number } }[] = [
    { rotation: 0, origin: { x: 240, y: -60, z: 40 } },
    { rotation: 90, origin: { x: 270, y: -60, z: 40 } },
  ];

  for (const c of cases) {
    it(`rotation ${c.rotation}: at least 99% block-state accuracy`, async () => {
      await resetSurvivalBot(bot);
      const transform = { origin: c.origin, rotation: c.rotation };
      const placements = toPlacements(schem, transform);
      const { items, unplaceable } = itemTotals(placements.map((p) => p.state), bot.version);
      expect(unplaceable).toEqual({});
      const chestPos = { x: c.origin.x - 3, y: c.origin.y, z: c.origin.z + 12 };
      await setupChest(bot, chestPos, Object.entries(items));

      const result = await buildSurvival(bot, {
        placements,
        bounds: buildBounds(schem, transform),
        chestPos,
        log: (m) => console.log(m),
      });
      const report = result.report!;
      console.log(`survival accuracy rotation=${c.rotation}: ${summarize(report)}`);
      for (const d of report.diffs) console.log(`  diff ${d.kind} at ${d.x},${d.y},${d.z}: expected ${d.expected}, got ${d.actual}`);
      expect(report.accuracy).toBeGreaterThanOrEqual(0.99);
    });
  }
});
