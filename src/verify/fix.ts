import type { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';
import type { Mover } from '../bot/mover.js';
import { noControl, type BuildControl, type ProgressListener } from '../builder/control.js';
import { sleep } from '../builder/rate.js';
import { isAir, type StateCanonicalizer } from '../schematic/blockstate.js';
import { posKey, type Placement } from '../schematic/placement.js';
import type { Vec3Like } from '../schematic/rotate.js';
import { chunkOrder, summarize, verifyPlacements, type BlockDiff, type VerifyReport } from './verify.js';

/** A non-air block inside the build box where the schematic has air. */
export interface Obstruction {
  x: number;
  y: number;
  z: number;
  actual: string;
}

export interface FullReport extends VerifyReport {
  obstructions: Obstruction[];
}

/** How a mode repairs the world. Op mode uses commands; survival mode digs and places. */
export interface Fixer {
  fixDiff(diff: BlockDiff): Promise<void>;
  clearObstruction(o: Obstruction): Promise<void>;
  /** Called once per pass after all fixes were sent. */
  flush?(): Promise<void>;
}

/** Finds non-air blocks inside the bounds that are not part of the schematic. */
export async function findObstructions(
  bot: Bot,
  placements: Placement[],
  bounds: { min: Vec3Like; max: Vec3Like },
  canon: StateCanonicalizer,
  mover: Mover,
  control: BuildControl = noControl,
): Promise<Obstruction[]> {
  const occupied = new Set(placements.map(posKey));
  const cells: Placement[] = [];
  for (let y = bounds.min.y; y <= bounds.max.y; y++) {
    for (let z = bounds.min.z; z <= bounds.max.z; z++) {
      for (let x = bounds.min.x; x <= bounds.max.x; x++) {
        if (!occupied.has(`${x},${y},${z}`)) cells.push({ x, y, z, state: 'minecraft:air' });
      }
    }
  }
  const out: Obstruction[] = [];
  for (const group of chunkOrder(cells)) {
    await control.checkpoint();
    await mover.ensureLoaded(group[0]);
    for (const c of group) {
      const block = bot.blockAt(new Vec3(c.x, c.y, c.z));
      if (!block) throw new Error(`block at ${c.x},${c.y},${c.z} is not loaded`);
      const actual = canon.fromWorldBlock(block);
      if (!isAir(actual)) out.push({ x: c.x, y: c.y, z: c.z, actual });
    }
  }
  return out;
}

export interface VerifyAndFixInput {
  bot: Bot;
  placements: Placement[];
  bounds: { min: Vec3Like; max: Vec3Like };
  canon: StateCanonicalizer;
  mover: Mover;
  fixer: Fixer;
  /** Verify passes; each pass after the first is preceded by fixes. */
  passes: number;
  settleMs: number;
  /** Also require air where the schematic has air (inside the bounds). */
  checkAir: boolean;
  control?: BuildControl;
  onProgress?: ProgressListener;
  log?: (msg: string) => void;
}

/**
 * The verification pass shared by both modes: compare the world with the
 * schematic, report every diff, repair it with the mode's fixer, and repeat
 * until clean or out of passes. Returns the last report.
 */
export async function verifyAndFix(input: VerifyAndFixInput): Promise<FullReport> {
  const control = input.control ?? noControl;
  const log = input.log ?? (() => {});
  let report: FullReport | null = null;
  for (let pass = 1; pass <= Math.max(1, input.passes); pass++) {
    await sleep(input.settleMs);
    const base = await verifyPlacements(input.bot, input.placements, input.canon, input.mover, { control, onProgress: input.onProgress });
    const obstructions = input.checkAir
      ? await findObstructions(input.bot, input.placements, input.bounds, input.canon, input.mover, control)
      : [];
    report = { ...base, obstructions };
    log(`verify pass ${pass}: ${summarize(report)}, ${obstructions.length} obstructions`);
    if (report.diffs.length === 0 && obstructions.length === 0) break;
    if (pass >= input.passes) break;
    const total = obstructions.length + report.diffs.length;
    let done = 0;
    // Clear stray blocks first: they may sit where the bot needs to stand or where a block goes.
    for (const o of obstructions) {
      await control.checkpoint();
      await input.fixer.clearObstruction(o);
      input.onProgress?.({ stage: 'fixing', done: ++done, total });
    }
    for (const d of orderFixes(report.diffs)) {
      await control.checkpoint();
      await input.fixer.fixDiff(d);
      input.onProgress?.({ stage: 'fixing', done: ++done, total });
    }
    await input.fixer.flush?.();
  }
  return report!;
}

/** Bottom-up, so supports get fixed before what rests on them. */
function orderFixes(diffs: BlockDiff[]): BlockDiff[] {
  return [...diffs].sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
}
