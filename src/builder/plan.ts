import { parseState } from '../schematic/blockstate.js';
import { buildPhase } from '../schematic/blockinfo.js';
import { posKey, type Placement } from '../schematic/placement.js';
import type { Vec3Like } from '../schematic/rotate.js';

/** One /setblock (from === to) or /fill command. */
export interface OpCommand {
  from: Vec3Like;
  to: Vec3Like;
  state: string;
  /** Number of blocks this command places. */
  count: number;
}

export interface PlanOptions {
  /** Merge uniform runs into /fill. */
  mergeFills: boolean;
  /** Max blocks per /fill; vanilla caps it at 32768. */
  maxFillVolume: number;
  /** Max width of a /fill along x or z, so the whole box sits in loaded chunks around the bot. */
  maxFillExtent: number;
}

export const defaultPlanOptions: PlanOptions = { mergeFills: true, maxFillVolume: 32768, maxFillExtent: 48 };

/**
 * Greedy 3D merge: grow a box along x, then z, then y while every cell has the
 * same state and was not taken yet. Deterministic for a given placement list.
 */
function mergeBoxes(placements: Placement[], maxVolume: number, maxExtent: number): OpCommand[] {
  const byPos = new Map<string, string>();
  for (const p of placements) byPos.set(posKey(p), p.state);
  const used = new Set<string>();
  const sorted = [...placements].sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
  const out: OpCommand[] = [];
  const free = (x: number, y: number, z: number, state: string) => {
    const k = `${x},${y},${z}`;
    return !used.has(k) && byPos.get(k) === state;
  };

  for (const p of sorted) {
    if (used.has(posKey(p))) continue;
    const s = p.state;
    let x2 = p.x;
    while (x2 - p.x + 2 <= Math.min(maxVolume, maxExtent) && free(x2 + 1, p.y, p.z, s)) x2++;
    const w = x2 - p.x + 1;
    let z2 = p.z;
    grow: while (w * (z2 - p.z + 2) <= maxVolume && z2 - p.z + 2 <= maxExtent) {
      for (let x = p.x; x <= x2; x++) if (!free(x, p.y, z2 + 1, s)) break grow;
      z2++;
    }
    const area = w * (z2 - p.z + 1);
    let y2 = p.y;
    growY: while (area * (y2 - p.y + 2) <= maxVolume) {
      for (let z = p.z; z <= z2; z++) for (let x = p.x; x <= x2; x++) if (!free(x, y2 + 1, z, s)) break growY;
      y2++;
    }
    for (let y = p.y; y <= y2; y++) for (let z = p.z; z <= z2; z++) for (let x = p.x; x <= x2; x++) used.add(`${x},${y},${z}`);
    out.push({ from: { x: p.x, y: p.y, z: p.z }, to: { x: x2, y: y2, z: z2 }, state: s, count: area * (y2 - p.y + 1) });
  }
  return out;
}

/**
 * Turns placements into op commands. Order: solid blocks bottom-up, then
 * gravity blocks, then attachables, so every block's support exists first.
 */
export function planOpCommands(placements: Placement[], options: Partial<PlanOptions> = {}): OpCommand[] {
  const opts = { ...defaultPlanOptions, ...options };
  const phases = new Map<number, Placement[]>();
  for (const p of placements) {
    const phase = buildPhase(parseState(p.state).name);
    let list = phases.get(phase);
    if (!list) phases.set(phase, (list = []));
    list.push(p);
  }
  const out: OpCommand[] = [];
  for (const phase of [...phases.keys()].sort((a, b) => a - b)) {
    const list = phases.get(phase)!;
    if (opts.mergeFills) {
      out.push(...mergeBoxes(list, opts.maxFillVolume, opts.maxFillExtent));
    } else {
      for (const p of [...list].sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x)) {
        out.push({ from: { x: p.x, y: p.y, z: p.z }, to: { x: p.x, y: p.y, z: p.z }, state: p.state, count: 1 });
      }
    }
  }
  return out;
}

export type PlacementFlag = 'strict' | 'replace';

/** Renders the chat command for an op command. */
export function renderCommand(cmd: OpCommand, flag: PlacementFlag): string {
  const { from, to } = cmd;
  if (from.x === to.x && from.y === to.y && from.z === to.z) {
    return `/setblock ${from.x} ${from.y} ${from.z} ${cmd.state} ${flag}`;
  }
  return `/fill ${from.x} ${from.y} ${from.z} ${to.x} ${to.y} ${to.z} ${cmd.state} ${flag}`;
}

/** Splits an inclusive box into boxes of at most `maxVolume` cells (slicing along y, then z). */
export function splitBox(min: Vec3Like, max: Vec3Like, maxVolume: number): { from: Vec3Like; to: Vec3Like }[] {
  const w = max.x - min.x + 1;
  const l = max.z - min.z + 1;
  const out: { from: Vec3Like; to: Vec3Like }[] = [];
  if (w * l <= maxVolume) {
    const layers = Math.max(1, Math.floor(maxVolume / (w * l)));
    for (let y = min.y; y <= max.y; y += layers) {
      out.push({ from: { x: min.x, y, z: min.z }, to: { x: max.x, y: Math.min(max.y, y + layers - 1), z: max.z } });
    }
    return out;
  }
  const rows = Math.max(1, Math.floor(maxVolume / w));
  for (let y = min.y; y <= max.y; y++) {
    for (let z = min.z; z <= max.z; z += rows) {
      out.push({ from: { x: min.x, y, z }, to: { x: max.x, y, z: Math.min(max.z, z + rows - 1) } });
    }
  }
  return out;
}
