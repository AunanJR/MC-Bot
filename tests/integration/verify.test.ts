import type { Bot } from 'mineflayer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commandWithFeedback } from '../../src/bot/connect.js';
import { TeleportMover } from '../../src/bot/mover.js';
import { buildOp, createOpFixer } from '../../src/builder/op.js';
import { RateLimiter } from '../../src/builder/rate.js';
import { StateCanonicalizer } from '../../src/schematic/blockstate.js';
import { buildBounds, toPlacements } from '../../src/schematic/placement.js';
import { verifyAndFix, type Fixer } from '../../src/verify/fix.js';
import { connect, loadFixture, prepareWorld } from './helpers.js';

describe('verification pass', () => {
  let bot: Bot;
  const schem = loadFixture();
  const transform = { origin: { x: 100, y: -60, z: 40 }, rotation: 0 as const };
  const placements = toPlacements(schem, transform);
  const bounds = buildBounds(schem, transform);

  beforeAll(async () => {
    bot = await connect();
    await prepareWorld(bot);
    const built = await buildOp(bot, { placements, bounds }, { commandsPerSecond: 40 });
    expect(built.report!.accuracy).toBe(1);
  });

  afterAll(() => bot?.quit());

  it('reports each kind of diff, then fixes them all', async () => {
    const o = transform.origin;
    const at = (x: number, y: number, z: number) => ({ x: o.x + x, y: o.y + y, z: o.z + z });
    const floor = at(4, 0, 4);
    const stair = at(3, 4, 0);
    const plank = at(0, 1, 2);
    const inside = at(4, 1, 4);
    for (const [p, state] of [
      [floor, 'minecraft:air'],
      [stair, 'minecraft:stone_brick_stairs[facing=west]'],
      [plank, 'minecraft:stone'],
      [inside, 'minecraft:dirt'],
    ] as const) {
      await commandWithFeedback(bot, `/setblock ${p.x} ${p.y} ${p.z} ${state} strict`, 100);
    }

    const canon = new StateCanonicalizer(bot.version);
    const mover = new TeleportMover(bot, bounds.max.y + 3);
    const recorded: string[] = [];
    const recorder: Fixer = {
      fixDiff: async (d) => void recorded.push(`fix ${d.kind}`),
      clearObstruction: async () => void recorded.push('clear'),
    };
    const reportOnly = await verifyAndFix({ bot, placements, bounds, canon, mover, fixer: recorder, passes: 1, settleMs: 1000, checkAir: true });
    expect(reportOnly.missing).toBe(1);
    expect(reportOnly.wrongState).toBe(1);
    expect(reportOnly.wrongBlock).toBe(1);
    expect(reportOnly.obstructions).toEqual([{ ...inside, actual: 'minecraft:dirt' }]);
    expect(reportOnly.diffs.map((d) => [d.x, d.y, d.z, d.kind])).toEqual(
      expect.arrayContaining([
        [floor.x, floor.y, floor.z, 'missing'],
        [stair.x, stair.y, stair.z, 'wrong_state'],
        [plank.x, plank.y, plank.z, 'wrong_block'],
      ]),
    );
    expect(reportOnly.accuracy).toBeCloseTo(332 / 335, 6);
    expect(recorded).toEqual([]); // a single pass only reports

    const fixer = createOpFixer(bot, mover, new RateLimiter(40), 'strict');
    const fixed = await verifyAndFix({ bot, placements, bounds, canon, mover, fixer, passes: 3, settleMs: 1000, checkAir: true, log: console.log });
    expect(fixed.accuracy).toBe(1);
    expect(fixed.obstructions).toEqual([]);
  });
});
