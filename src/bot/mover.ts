import type { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';
import type { Vec3Like } from '../schematic/rotate.js';
import { sleep } from '../builder/rate.js';

/** Brings the bot close enough to a position that its chunk is loaded on the server and the client. */
export interface Mover {
  ensureLoaded(pos: Vec3Like): Promise<void>;
}

export function isClientLoaded(bot: Bot, pos: Vec3Like): boolean {
  return bot.blockAt(new Vec3(pos.x, pos.y, pos.z)) !== null;
}

function horizontalDistance(bot: Bot, pos: Vec3Like): number {
  const p = bot.entity.position;
  return Math.max(Math.abs(p.x - pos.x), Math.abs(p.z - pos.z));
}

/** Op-mode mover: teleports (creative + flying) above the target column. */
export class TeleportMover implements Mover {
  constructor(
    private readonly bot: Bot,
    /** Y to hover at; above the build so the bot never sits inside it. */
    private readonly hoverY: number,
    /** Max horizontal distance before teleporting again. */
    private readonly radius = 40,
  ) {}

  async ensureLoaded(pos: Vec3Like): Promise<void> {
    if (horizontalDistance(this.bot, pos) <= this.radius && isClientLoaded(this.bot, pos)) return;
    await this.teleport(pos.x + 0.5, this.hoverY, pos.z + 0.5);
    const deadline = Date.now() + 15_000;
    while (!isClientLoaded(this.bot, pos)) {
      if (Date.now() > deadline) throw new Error(`chunk at ${pos.x},${pos.z} did not load`);
      await sleep(100);
    }
  }

  async teleport(x: number, y: number, z: number): Promise<void> {
    const moved = new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 3000);
      this.bot.once('forcedMove', () => {
        clearTimeout(t);
        resolve();
      });
    });
    this.bot.chat(`/tp @s ${x} ${y} ${z}`);
    await moved;
    try {
      this.bot.creative.startFlying();
    } catch {
      // Not in creative; the bot just falls.
    }
  }
}
