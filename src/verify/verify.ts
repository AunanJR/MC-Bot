import type { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';
import type { Mover } from '../bot/mover.js';
import { noControl, type BuildControl, type ProgressListener } from '../builder/control.js';
import { parseState, type StateCanonicalizer } from '../schematic/blockstate.js';
import type { Placement } from '../schematic/placement.js';

export interface BlockDiff {
  x: number;
  y: number;
  z: number;
  expected: string;
  /** Canonical state found in the world. */
  actual: string;
  kind: 'missing' | 'wrong_block' | 'wrong_state';
}

export interface VerifyReport {
  total: number;
  matched: number;
  /** matched / total, 0..1. Counts full block states, not just block ids. */
  accuracy: number;
  missing: number;
  wrongBlock: number;
  wrongState: number;
  diffs: BlockDiff[];
}

/** Groups placements by chunk and orders the chunks in a serpentine sweep, so the bot moves little. */
export function chunkOrder(placements: Placement[]): Placement[][] {
  const groups = new Map<string, Placement[]>();
  for (const p of placements) {
    const key = `${p.x >> 4},${p.z >> 4}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = []));
    g.push(p);
  }
  const keys = [...groups.keys()].map((k) => k.split(',').map(Number) as [number, number]);
  keys.sort((a, b) => a[0] - b[0] || (a[0] % 2 === 0 ? a[1] - b[1] : b[1] - a[1]));
  return keys.map(([cx, cz]) => groups.get(`${cx},${cz}`)!);
}

export function compareStates(expected: string, actual: string): BlockDiff['kind'] | null {
  if (expected === actual) return null;
  const e = parseState(expected).name;
  const a = parseState(actual).name;
  if (a === 'minecraft:air' || a === 'minecraft:cave_air' || a === 'minecraft:void_air') return 'missing';
  return e === a ? 'wrong_state' : 'wrong_block';
}

/**
 * Compares the world with the target placements, reading blocks from the
 * bot's chunk cache. Shared by op and survival mode; only the mover differs.
 */
export async function verifyPlacements(
  bot: Bot,
  placements: Placement[],
  canon: StateCanonicalizer,
  mover: Mover,
  opts: { control?: BuildControl; onProgress?: ProgressListener } = {},
): Promise<VerifyReport> {
  const control = opts.control ?? noControl;
  const report: VerifyReport = { total: placements.length, matched: 0, accuracy: 0, missing: 0, wrongBlock: 0, wrongState: 0, diffs: [] };
  let done = 0;
  for (const group of chunkOrder(placements)) {
    await control.checkpoint();
    await mover.ensureLoaded(group[0]);
    for (const p of group) {
      const block = bot.blockAt(new Vec3(p.x, p.y, p.z));
      if (!block) throw new Error(`block at ${p.x},${p.y},${p.z} is not loaded`);
      const expected = canon.canonical(p.state);
      const actual = canon.fromWorldBlock(block);
      const kind = compareStates(expected, actual);
      if (kind === null) {
        report.matched++;
      } else {
        report.diffs.push({ x: p.x, y: p.y, z: p.z, expected, actual, kind });
        if (kind === 'missing') report.missing++;
        else if (kind === 'wrong_block') report.wrongBlock++;
        else report.wrongState++;
      }
    }
    done += group.length;
    opts.onProgress?.({ stage: 'verifying', done, total: placements.length });
  }
  report.accuracy = report.total === 0 ? 1 : report.matched / report.total;
  return report;
}

/** Short human summary, e.g. for logs and the API. */
export function summarize(report: VerifyReport): string {
  return `${report.matched}/${report.total} blocks correct (${(report.accuracy * 100).toFixed(2)}%): ` +
    `${report.missing} missing, ${report.wrongBlock} wrong block, ${report.wrongState} wrong state`;
}
