import type { Bot } from 'mineflayer';
import { commandWithFeedback, hasOperator } from '../bot/connect.js';
import { TeleportMover, type Mover } from '../bot/mover.js';
import { StateCanonicalizer } from '../schematic/blockstate.js';
import type { Placement } from '../schematic/placement.js';
import type { Vec3Like } from '../schematic/rotate.js';
import { verifyAndFix, type Fixer, type FullReport } from '../verify/fix.js';
import { noControl, type BuildControl, type ProgressListener } from './control.js';
import { planOpCommands, renderCommand, splitBox, type OpCommand, type PlacementFlag } from './plan.js';
import { RateLimiter } from './rate.js';

export interface OpBuildOptions {
  /** Commands sent per second. Each /fill counts as one. */
  commandsPerSecond: number;
  /** `strict` places exact states without block updates; `replace` lets the server update neighbours. */
  placementFlag: PlacementFlag;
  mergeFills: boolean;
  maxFillVolume: number;
  maxFillExtent: number;
  /** Fill the build's bounding box with air first. */
  clearArea: boolean;
  /** Verify passes after the build, with fixes between them (0 disables verification). */
  fixPasses: number;
  /** Wait for block updates to reach the client before verifying. */
  settleMs: number;
}

export const defaultOpOptions: OpBuildOptions = {
  commandsPerSecond: 20,
  placementFlag: 'strict',
  mergeFills: true,
  maxFillVolume: 32768,
  maxFillExtent: 48,
  clearArea: true,
  fixPasses: 3,
  settleMs: 1500,
};

export interface OpBuildInput {
  placements: Placement[];
  bounds: { min: Vec3Like; max: Vec3Like };
  /** Resume from this command index (commands before it were already sent). */
  startCursor?: number;
  control?: BuildControl;
  onProgress?: ProgressListener;
  log?: (msg: string) => void;
}

export interface OpBuildResult {
  commandsSent: number;
  report: FullReport | null;
}

function boxCenter(cmd: { from: Vec3Like; to: Vec3Like }): Vec3Like {
  return {
    x: Math.floor((cmd.from.x + cmd.to.x) / 2),
    y: Math.floor((cmd.from.y + cmd.to.y) / 2),
    z: Math.floor((cmd.from.z + cmd.to.z) / 2),
  };
}

/** Builds with /setblock and /fill. The bot must be an operator. */
export async function buildOp(bot: Bot, input: OpBuildInput, options: Partial<OpBuildOptions> = {}): Promise<OpBuildResult> {
  const opts = { ...defaultOpOptions, ...options };
  const control = input.control ?? noControl;
  const log = input.log ?? (() => {});
  const canon = new StateCanonicalizer(bot.version);
  if (!(await hasOperator(bot))) throw new Error('bot is not an operator on this server; op mode needs /setblock and /fill');

  await commandWithFeedback(bot, '/gamemode creative @s', 500);
  const mover = new TeleportMover(bot, input.bounds.max.y + 3);
  const limiter = new RateLimiter(opts.commandsPerSecond);

  const clearCommands: OpCommand[] = opts.clearArea
    ? splitBox(input.bounds.min, input.bounds.max, Math.min(opts.maxFillVolume, opts.maxFillExtent * opts.maxFillExtent))
        .flatMap((box) => splitExtent(box, opts.maxFillExtent))
        .map((box) => ({ ...box, state: 'minecraft:air', count: 0 }))
    : [];
  const buildCommands = planOpCommands(input.placements, opts);
  const all = [...clearCommands, ...buildCommands];
  const totalBlocks = buildCommands.reduce((n, c) => n + c.count, 0);
  log(`op build: ${clearCommands.length} clear + ${buildCommands.length} build commands for ${totalBlocks} blocks`);

  let placed = 0;
  const start = Math.min(input.startCursor ?? 0, all.length);
  for (let i = 0; i < start; i++) placed += all[i].count;
  for (let i = start; i < all.length; i++) {
    await control.checkpoint();
    const cmd = all[i];
    await mover.ensureLoaded(boxCenter(cmd));
    await limiter.acquire();
    bot.chat(renderCommand(cmd, opts.placementFlag));
    placed += cmd.count;
    input.onProgress?.({ stage: i < clearCommands.length ? 'clearing' : 'building', done: placed, total: totalBlocks, cursor: i + 1 });
  }

  let report: FullReport | null = null;
  if (opts.fixPasses > 0) {
    const fixer = createOpFixer(bot, mover, limiter, opts.placementFlag);
    report = await verifyAndFix({
      bot,
      placements: input.placements,
      bounds: input.bounds,
      canon,
      mover,
      fixer,
      passes: opts.fixPasses,
      settleMs: opts.settleMs,
      checkAir: opts.clearArea,
      control,
      onProgress: input.onProgress,
      log,
    });
  }
  return { commandsSent: all.length, report };
}

/** Op-mode repairs: one /setblock per diff or obstruction. */
export function createOpFixer(bot: Bot, mover: Mover, limiter: RateLimiter, flag: PlacementFlag): Fixer {
  const setblock = async (pos: Vec3Like, state: string) => {
    await mover.ensureLoaded(pos);
    await limiter.acquire();
    bot.chat(renderCommand({ from: pos, to: pos, state, count: 1 }, flag));
  };
  return {
    fixDiff: (d) => setblock(d, d.expected),
    clearObstruction: (o) => setblock(o, 'minecraft:air'),
  };
}

/** Splits a box so neither horizontal side exceeds `extent`. */
function splitExtent(box: { from: Vec3Like; to: Vec3Like }, extent: number): { from: Vec3Like; to: Vec3Like }[] {
  const out: { from: Vec3Like; to: Vec3Like }[] = [];
  for (let x = box.from.x; x <= box.to.x; x += extent) {
    for (let z = box.from.z; z <= box.to.z; z += extent) {
      out.push({
        from: { x, y: box.from.y, z },
        to: { x: Math.min(box.to.x, x + extent - 1), y: box.to.y, z: Math.min(box.to.z, z + extent - 1) },
      });
    }
  }
  return out;
}
