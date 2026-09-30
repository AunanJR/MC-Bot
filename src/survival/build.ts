import type { Bot } from 'mineflayer';
import pathfinderPkg from 'mineflayer-pathfinder';
import type { Vec3 } from 'vec3';
import type { Mover } from '../bot/mover.js';
import { isClientLoaded } from '../bot/mover.js';
import { noControl, type BuildControl, type ProgressListener } from '../builder/control.js';
import { sleep } from '../builder/rate.js';
import { parseState, shortName, StateCanonicalizer } from '../schematic/blockstate.js';
import { isGravityBlock } from '../schematic/blockinfo.js';
import { posKey, type Placement } from '../schematic/placement.js';
import type { Vec3Like } from '../schematic/rotate.js';
import { verifyAndFix, type Fixer, type FullReport } from '../verify/fix.js';
import { itemForState } from './items.js';
import { planSurvivalGroups } from './order.js';
import { DIR_VEC, doorCursor, placementSpec, type Dir, type FaceOption, type PlacementSpec } from './specs.js';
import { countInInventory, inventoryCounts, refillFromChest } from './supply.js';
import { botOccupies, distanceToBlock, eyePosition, isInteractive, isReplaceable, vec } from './world.js';

const { pathfinder, Movements, goals } = pathfinderPkg;

export interface SurvivalOptions {
  /** Max distance from the eye to the clicked block (vanilla allows 4.5 + 1). */
  reach: number;
  /** Inventory slots to fill with build materials per chest trip. */
  carrySlots: number;
  /** How often to re-check the chest while waiting for missing items. */
  waitPollMs: number;
  /** Verify passes after the build, with fixes between them. */
  fixPasses: number;
  settleMs: number;
  placeTimeoutMs: number;
  /** Attempts per block before giving up on it (the verify pass reports it). */
  maxAttempts: number;
  /** Item the bot towers and bridges with when a block is out of reach; removed after the build. Null disables scaffolding. */
  scaffoldItem: string | null;
  /** How many scaffold items to carry when the chest has them. */
  scaffoldCarry: number;
}

export const defaultSurvivalOptions: SurvivalOptions = {
  reach: 4.5,
  carrySlots: 27,
  waitPollMs: 10_000,
  fixPasses: 3,
  settleMs: 1000,
  placeTimeoutMs: 2000,
  maxAttempts: 4,
  scaffoldItem: 'minecraft:dirt',
  scaffoldCarry: 64,
};

export interface SurvivalInput {
  placements: Placement[];
  bounds: { min: Vec3Like; max: Vec3Like };
  chestPos: Vec3Like;
  control?: BuildControl;
  onProgress?: ProgressListener;
  log?: (msg: string) => void;
}

interface Entry {
  p: Placement;
  expected: string;
  spec: PlacementSpec;
  attempts: number;
}

type PlaceResult = 'placed' | 'done' | 'no_reference' | 'unreachable' | 'blocked' | 'failed';

/** Pathfinder goal: stand where some candidate neighbour block is within reach, outside the cells to keep free. */
class GoalReach extends goals.Goal {
  constructor(
    private readonly refs: Vec3Like[],
    private readonly keepFree: Vec3Like[],
    private readonly reach: number,
  ) {
    super();
  }

  heuristic(node: Vec3Like): number {
    let best = Infinity;
    for (const r of this.refs) best = Math.min(best, distanceToBlock({ x: node.x + 0.5, y: node.y + 1.62, z: node.z + 0.5 }, r));
    return Math.max(0, best - this.reach);
  }

  isEnd(node: Vec3Like): boolean {
    for (const c of this.keepFree) {
      if (node.x === c.x && node.z === c.z && (node.y === c.y || node.y + 1 === c.y)) return false;
    }
    const eye = { x: node.x + 0.5, y: node.y + 1.62, z: node.z + 0.5 };
    return this.refs.some((r) => distanceToBlock(eye, r) <= this.reach);
  }
}

function add(a: Vec3Like, b: Vec3Like): Vec3Like {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a: Vec3Like, b: Vec3Like): Vec3Like {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/** Survival-mode building: everything is placed from the inventory like a player would. */
export class SurvivalBuilder {
  readonly opts: SurvivalOptions;
  private readonly canon: StateCanonicalizer;
  private readonly control: BuildControl;
  private readonly log: (msg: string) => void;
  private placed = 0;
  private readonly movements: InstanceType<typeof Movements>;
  private scaffolding = false;
  /** Positions where the bot put scaffold blocks. */
  readonly scaffold = new Map<string, Vec3Like>();
  private readonly expectedAt = new Map<string, string>();

  constructor(
    private readonly bot: Bot,
    private readonly input: SurvivalInput,
    options: Partial<SurvivalOptions> = {},
  ) {
    this.opts = { ...defaultSurvivalOptions, ...options };
    this.canon = new StateCanonicalizer(bot.version);
    this.control = input.control ?? noControl;
    this.log = input.log ?? (() => {});
    if (!bot.pathfinder) bot.loadPlugin(pathfinder);
    const movements = new Movements(bot);
    movements.canDig = false;
    movements.allowParkour = false;
    movements.allow1by1towers = false;
    // Pathfinder would otherwise use dirt and cobblestone from our inventory as scaffolding.
    movements.scafoldingBlocks = [];
    movements.canOpenDoors = true;
    movements.maxDropDown = 3;
    bot.pathfinder.setMovements(movements);
    bot.pathfinder.thinkTimeout = 10_000;
    this.movements = movements;
    for (const p of input.placements) this.expectedAt.set(posKey(p), p.state);
    const scaffoldName = this.opts.scaffoldItem ? shortName(this.opts.scaffoldItem) : null;
    bot.on('blockUpdate', (oldBlock, newBlock) => {
      if (!this.scaffolding || !scaffoldName || !newBlock || newBlock.name !== scaffoldName) return;
      if (oldBlock && oldBlock.name === scaffoldName) return;
      const p = newBlock.position;
      this.scaffold.set(posKey(p), { x: p.x, y: p.y, z: p.z });
    });
  }

  /** Lets the pathfinder tower and bridge with the scaffold item (only while retrying an unreachable block). */
  private setScaffolding(on: boolean): boolean {
    const name = this.opts.scaffoldItem ? shortName(this.opts.scaffoldItem) : null;
    const id = name ? this.bot.registry.itemsByName[name]?.id : undefined;
    if (on && (id === undefined || countInInventory(this.bot, this.opts.scaffoldItem!) === 0)) return false;
    this.scaffolding = on;
    this.movements.scafoldingBlocks = on ? [id!] : [];
    this.movements.allow1by1towers = on;
    this.bot.pathfinder.setMovements(this.movements);
    return true;
  }

  /** Digs out every scaffold block the bot placed, top-down, leaving what the schematic wants. */
  async removeScaffolding(): Promise<number> {
    const name = this.opts.scaffoldItem ? shortName(this.opts.scaffoldItem) : null;
    if (!name || this.scaffold.size === 0) return 0;
    const cells = [...this.scaffold.values()].sort((a, b) => b.y - a.y);
    let removed = 0;
    for (const c of cells) {
      await this.control.checkpoint();
      const expected = this.expectedAt.get(posKey(c));
      if (expected && shortName(parseState(expected).name) === name) continue;
      const block = this.bot.blockAt(vec(c));
      if (!block || block.name !== name) continue;
      if (!(await this.walkWithinReach([c], [], false))) continue;
      await this.bot.dig(this.bot.blockAt(vec(c))!, true);
      removed++;
    }
    this.scaffold.clear();
    this.log(`removed ${removed} scaffold blocks`);
    return removed;
  }

  /** Mover for the verify pass: walks toward unloaded areas. */
  readonly mover: Mover = {
    ensureLoaded: async (pos) => {
      if (isClientLoaded(this.bot, pos)) return;
      await this.bot.pathfinder.goto(new goals.GoalNear(pos.x, pos.y, pos.z, 16));
    },
  };

  private matches(p: Vec3Like, expected: string): boolean {
    const block = this.bot.blockAt(vec(p));
    return block !== null && this.canon.fromWorldBlock(block) === expected;
  }

  /** Items the remaining entries need, in build order. */
  private needs(entries: Entry[]): [string, number][] {
    const out = new Map<string, number>();
    for (const e of entries) {
      if (!e.spec.item) continue;
      const need = itemForState(e.p.state);
      if (need) out.set(need.item, (out.get(need.item) ?? 0) + need.count);
    }
    return [...out.entries()];
  }

  /** Scaffold items to take along; never something the bot waits for. */
  private scaffoldWant(): [string, number][] {
    return this.opts.scaffoldItem ? [[this.opts.scaffoldItem, this.opts.scaffoldCarry]] : [];
  }

  private progress(stage: 'building' | 'waiting_for_items', total: number, missing?: Record<string, number>) {
    this.input.onProgress?.({ stage, done: this.placed, total, cursor: this.placed, ...(missing ? { missing } : {}) });
  }

  /**
   * Makes sure `item` is in the inventory, refilling from the chest. When the
   * chest does not have it, reports what is missing and waits.
   */
  private async ensureItem(item: string, remaining: Entry[], total: number): Promise<void> {
    if (countInInventory(this.bot, item) > 0) return;
    let waiting = false;
    for (;;) {
      await this.control.checkpoint();
      const wanted = this.needs(remaining);
      // Always ask for the blocked item first.
      wanted.sort((a, b) => (a[0] === item ? -1 : b[0] === item ? 1 : 0));
      const result = await refillFromChest(this.bot, this.input.chestPos, [...wanted, ...this.scaffoldWant()], this.opts.carrySlots);
      const got = Object.entries(result.withdrawn).map(([k, v]) => `${v} ${shortName(k)}`).join(', ');
      if (got) this.log(`refilled from chest: ${got}`);
      if (countInInventory(this.bot, item) > 0) {
        if (waiting) this.progress('building', total);
        return;
      }
      const inv = inventoryCounts(this.bot);
      const missing: Record<string, number> = {};
      for (const [id, n] of wanted) {
        const short = n - (inv[id] ?? 0) - (result.chest[id] ?? 0);
        if (short > 0) missing[id] = short;
      }
      if (!waiting) this.log(`waiting for items: ${Object.entries(missing).map(([k, v]) => `${v} ${shortName(k)}`).join(', ')}`);
      waiting = true;
      this.progress('waiting_for_items', total, missing);
      const until = Date.now() + this.opts.waitPollMs;
      while (Date.now() < until) {
        await this.control.checkpoint();
        await sleep(Math.min(1000, this.opts.waitPollMs));
      }
    }
  }

  /** Face options whose clicked neighbour exists and can be clicked safely. */
  private usableFaces(target: Vec3Like, spec: PlacementSpec): { option: FaceOption; ref: Vec3Like }[] {
    const out: { option: FaceOption; ref: Vec3Like }[] = [];
    for (const option of spec.faces) {
      const ref = sub(target, DIR_VEC[option.face]);
      const block = this.bot.blockAt(vec(ref));
      if (!block || isReplaceable(block.name) || isInteractive(block.name)) continue;
      out.push({ option, ref });
    }
    return out;
  }

  private async walkWithinReach(refs: Vec3Like[], keepFree: Vec3Like[], allowScaffold = true): Promise<boolean> {
    const goal = new GoalReach(refs, keepFree, this.opts.reach - 0.3);
    const reached = () => goal.isEnd(this.bot.entity.position.floored()) && !keepFree.some((c) => botOccupies(this.bot, c));
    if (reached()) return true;
    let error = '';
    try {
      await this.bot.pathfinder.goto(goal);
    } catch (err) {
      error = (err as Error).message;
    }
    // goto can also end on a partial path, so check where the bot actually is.
    if (reached()) return true;
    if (!allowScaffold || !this.setScaffolding(true)) {
      this.log(`cannot get within reach of ${JSON.stringify(refs[0])}${error ? `: ${error}` : ''}`);
      return false;
    }
    try {
      // Out of reach on foot: tower or bridge there with scaffold blocks.
      await this.bot.pathfinder.goto(goal);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      this.setScaffolding(false);
    }
    if (reached()) return true;
    this.log(`cannot get within reach of ${JSON.stringify(refs[0])}, even with scaffolding${error ? `: ${error}` : ''}`);
    return false;
  }

  /** Places one block. Returns what happened; the caller decides about retries. */
  async placeOne(entry: Entry, remaining: Entry[], total: number): Promise<PlaceResult> {
    const target = entry.p;
    if (!isClientLoaded(this.bot, target)) await this.mover.ensureLoaded(target);
    if (this.matches(target, entry.expected)) return 'done';
    const current = this.bot.blockAt(vec(target))!;
    const { name: targetName } = parseState(entry.expected);
    const spec = entry.spec;
    let faces: { option: FaceOption; ref: Vec3Like }[];
    if (spec.mergeSlab && `minecraft:${current.name}` === targetName) {
      faces = [{ option: { face: 'up', cursor: { x: 0.5, y: 0.5, z: 0.5 } }, ref: target }];
    } else {
      if (!isReplaceable(current.name)) return 'blocked';
      if (isGravityBlock(targetName)) {
        const below = this.bot.blockAt(vec(add(target, DIR_VEC.down)));
        if (!below || isReplaceable(below.name)) return 'no_reference';
      }
      faces = this.usableFaces(target, spec);
    }
    if (faces.length === 0) return 'no_reference';
    if (!spec.item) return 'done';

    await this.ensureItem(spec.item, remaining, total);
    const keepFree: Vec3Like[] = [target];
    if (targetName.endsWith('_door')) keepFree.push(add(target, DIR_VEC.up));
    if (!(await this.walkWithinReach(faces.map((f) => f.ref), keepFree))) return 'unreachable';

    const eye = eyePosition(this.bot);
    const inReach = faces.filter((f) => distanceToBlock(eye, f.ref) <= this.opts.reach);
    if (inReach.length === 0) return 'unreachable';
    inReach.sort((a, b) => distanceToBlock(eye, a.ref) - distanceToBlock(eye, b.ref));
    const { option, ref } = inReach[0];
    let cursor = option.cursor;
    if (spec.hinge) cursor = doorCursor(parseState(entry.expected).props.facing as Dir, spec.hinge);

    const item = this.bot.inventory.items().find((i) => i.name === shortName(spec.item!));
    if (!item) return 'failed';
    await this.bot.equip(item, 'hand');
    if (spec.look) {
      await this.bot.look(spec.look.yaw, spec.look.pitch);
    } else {
      await this.bot.lookAt(vec(add(ref, cursor)));
    }
    const refBlock = this.bot.blockAt(vec(ref));
    if (!refBlock) return 'failed';
    const before = current.stateId;
    await (this.bot as unknown as { _genericPlace(b: unknown, f: Vec3, o: object): Promise<unknown> })._genericPlace(
      refBlock,
      vec(DIR_VEC[option.face]),
      { delta: vec(cursor), forceLook: 'ignore', swingArm: 'right' },
    );
    const deadline = Date.now() + this.opts.placeTimeoutMs;
    while (Date.now() < deadline) {
      await sleep(50);
      const now = this.bot.blockAt(vec(target));
      if (now && now.stateId !== before) break;
    }
    const after = this.bot.blockAt(vec(target));
    return after && `minecraft:${after.name}` === targetName ? 'placed' : 'failed';
  }

  /** Builds every placement group in order. */
  async build(): Promise<{ unplaced: Placement[] }> {
    const total = this.input.placements.length;
    const entries = (placements: Placement[]) =>
      placements.map((p) => ({ p, expected: this.canon.canonical(p.state), spec: placementSpec(p.state), attempts: 0 }));
    const groups = planSurvivalGroups(this.input.placements).map((g) => ({ label: g.label, entries: entries(g.placements) }));
    let deferred: Entry[] = [];
    const unplaced: Placement[] = [];

    for (let gi = 0; gi < groups.length; gi++) {
      let queue = [...deferred, ...groups[gi].entries];
      deferred = [];
      const later = () => groups.slice(gi + 1).flatMap((g) => g.entries);
      while (queue.length > 0) {
        await this.control.checkpoint();
        // Nearest first; blocks without a clickable neighbour yet wait for the rest of the group.
        const pos = this.bot.entity.position;
        queue.sort((a, b) => pos.distanceSquared(vec(a.p).offset(0.5, 0.5, 0.5)) - pos.distanceSquared(vec(b.p).offset(0.5, 0.5, 0.5)));
        let progressed = false;
        const next: Entry[] = [];
        const reasons = new Map<string, number>();
        for (let i = 0; i < queue.length; i++) {
          const entry = queue[i];
          if (progressed) {
            next.push(entry);
            continue;
          }
          const result = await this.placeOne(entry, [...queue.slice(i), ...later()], total);
          if (result === 'placed' || result === 'done') {
            this.placed++;
            this.progress('building', total);
            progressed = true;
            continue;
          }
          reasons.set(result, (reasons.get(result) ?? 0) + 1);
          entry.attempts += result === 'no_reference' ? 0 : 1;
          if (entry.attempts >= this.opts.maxAttempts) {
            this.log(`giving up on ${entry.p.state} at ${entry.p.x},${entry.p.y},${entry.p.z}: ${result}`);
            unplaced.push(entry.p);
            continue;
          }
          next.push(entry);
        }
        queue = next;
        if (!progressed) {
          // Nothing in this group can go in right now; retry these after the next group.
          if (queue.length) this.log(`${groups[gi].label}: deferring ${queue.length} blocks (${[...reasons].map(([k, v]) => `${v} ${k}`).join(', ')})`);
          deferred = queue;
          break;
        }
      }
    }
    for (const e of deferred) unplaced.push(e.p);
    if (unplaced.length) this.log(`${unplaced.length} blocks could not be placed`);
    return { unplaced };
  }

  /** Survival repairs: dig what is wrong, place what is missing. */
  fixer(): Fixer {
    const total = this.input.placements.length;
    const reachAndDig = async (pos: Vec3Like) => {
      const block = this.bot.blockAt(vec(pos));
      if (!block || isReplaceable(block.name)) return;
      if (!(await this.walkWithinReach([pos], [], false))) return;
      await this.bot.dig(this.bot.blockAt(vec(pos))!, true);
    };
    return {
      fixDiff: async (d) => {
        await this.control.checkpoint();
        const block = this.bot.blockAt(vec(d));
        const exp = parseState(d.expected);
        // A door, trapdoor or gate that is only open/closed wrongly gets toggled.
        if (block && d.kind === 'wrong_state' && /(_door|_trapdoor|_fence_gate)$/.test(block.name)) {
          const act = parseState(d.actual);
          const onlyOpen = Object.keys(exp.props).every((k) => k === 'open' || k === 'powered' || exp.props[k] === act.props[k]);
          if (onlyOpen && exp.props.open !== act.props.open) {
            if (await this.walkWithinReach([d], [])) await this.bot.activateBlock(block);
            return;
          }
        }
        if (d.kind !== 'missing') await reachAndDig(d);
        const entry: Entry = { p: { x: d.x, y: d.y, z: d.z, state: d.expected }, expected: d.expected, spec: placementSpec(d.expected), attempts: 0 };
        await this.placeOne(entry, [entry], total);
      },
      clearObstruction: async (o) => {
        await this.control.checkpoint();
        await reachAndDig(o);
      },
    };
  }
}

export interface SurvivalResult {
  unplaced: number;
  report: FullReport | null;
}

/** Builds in survival mode, then runs the shared verify-and-fix pass. */
export async function buildSurvival(bot: Bot, input: SurvivalInput, options: Partial<SurvivalOptions> = {}): Promise<SurvivalResult> {
  const builder = new SurvivalBuilder(bot, input, options);
  const log = input.log ?? (() => {});
  if (bot.game.gameMode !== 'survival' && bot.game.gameMode !== 'adventure') {
    log(`note: bot is in ${bot.game.gameMode} mode; survival placement still uses the inventory`);
  }
  const { unplaced } = await builder.build();
  await builder.removeScaffolding();
  let report: FullReport | null = null;
  if (builder.opts.fixPasses > 0) {
    report = await verifyAndFix({
      bot,
      placements: input.placements,
      bounds: input.bounds,
      canon: new StateCanonicalizer(bot.version),
      mover: builder.mover,
      fixer: builder.fixer(),
      passes: builder.opts.fixPasses,
      settleMs: builder.opts.settleMs,
      checkAir: false,
      control: input.control,
      onProgress: input.onProgress,
      log,
    });
    if ((await builder.removeScaffolding()) > 0) {
      report = await verifyAndFix({
        bot,
        placements: input.placements,
        bounds: input.bounds,
        canon: new StateCanonicalizer(bot.version),
        mover: builder.mover,
        fixer: builder.fixer(),
        passes: 1,
        settleMs: builder.opts.settleMs,
        checkAir: false,
        control: input.control,
        log,
      });
    }
  }
  return { unplaced: unplaced.length, report };
}
