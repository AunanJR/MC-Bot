import mineflayer, { type Bot } from 'mineflayer';

export interface ServerTarget {
  host: string;
  port: number;
  username: string;
  /** Protocol version for mineflayer, e.g. "26.1". */
  version?: string;
}

export const DEFAULT_MC_VERSION = '26.1';

/** Connects an offline-mode bot and resolves once it has spawned. */
export function connectBot(target: ServerTarget, timeoutMs = 30_000): Promise<Bot> {
  return new Promise((resolve, reject) => {
    const bot = mineflayer.createBot({
      host: target.host,
      port: target.port,
      username: target.username,
      version: target.version ?? DEFAULT_MC_VERSION,
      auth: 'offline',
      hideErrors: true,
      // Keeps chunk data in memory for the whole session: verification reads it back.
      viewDistance: 'far',
    });
    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      bot.end();
      reject(err);
    };
    const timer = setTimeout(() => fail(new Error(`timed out joining ${target.host}:${target.port}`)), timeoutMs);
    bot.once('spawn', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(bot);
    });
    bot.once('kicked', (reason) => fail(new Error(`kicked while joining: ${typeof reason === 'string' ? reason : JSON.stringify(reason)}`)));
    bot.once('error', (err) => fail(err));
    bot.once('end', (reason) => fail(new Error(`connection ended while joining: ${reason}`)));
  });
}

/**
 * Sends a command and collects the chat feedback that arrives within `waitMs`.
 * Used for probes, not for the build loop (that one does not wait for feedback).
 */
export async function commandWithFeedback(bot: Bot, command: string, waitMs = 1000): Promise<string[]> {
  const lines: string[] = [];
  const onMsg = (msg: string) => {
    lines.push(msg);
  };
  bot.on('messagestr', onMsg);
  try {
    bot.chat(command);
    await new Promise((r) => setTimeout(r, waitMs));
  } finally {
    bot.off('messagestr', onMsg);
  }
  return lines;
}

/** True when the server lets the bot run operator commands. */
export async function hasOperator(bot: Bot): Promise<boolean> {
  const lines = await commandWithFeedback(bot, '/time query gametime', 1500);
  return lines.some((l) => /time is/i.test(l));
}
