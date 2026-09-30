import type { Bot } from 'mineflayer';
import { eq } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { connectBot } from '../bot/connect.js';
import { CancelledError, LocalControl, type BuildControl, type ProgressEvent } from '../builder/control.js';
import { buildOp, type OpBuildOptions } from '../builder/op.js';
import { sleep } from '../builder/rate.js';
import type { Db } from '../db/client.js';
import { schematics, sessions, type SessionRow, type SessionStatus } from '../db/schema.js';
import { loadSchematic } from '../schematic/load.js';
import { buildBounds, toPlacements } from '../schematic/placement.js';
import type { Rotation } from '../schematic/rotate.js';
import { controlChannel, eventsChannel, type ControlMessage, type SessionEvent } from '../sessions/bus.js';
import type { FullReport } from '../verify/fix.js';

export class DisconnectedError extends Error {
  constructor(reason: string) {
    super(`bot disconnected: ${reason}`);
    this.name = 'DisconnectedError';
  }
}

export interface RunnerDeps {
  db: Db;
  /** Publisher connection. */
  redis: Redis;
  /** Creates a dedicated connection for subscribing to control messages. */
  createSubscriber: () => Redis;
  reconnectAttempts: number;
  /** Delay before reconnect attempt n (1-based). */
  reconnectDelayMs?: (attempt: number) => number;
  opDefaults?: Partial<OpBuildOptions>;
  log?: (msg: string) => void;
}

/** Wraps the user's pause/cancel control and aborts the build when the connection drops. */
class SessionControl implements BuildControl {
  disconnectReason: string | null = null;
  constructor(readonly local: LocalControl) {}

  async checkpoint(): Promise<void> {
    if (this.disconnectReason) throw new DisconnectedError(this.disconnectReason);
    await this.local.checkpoint();
    if (this.disconnectReason) throw new DisconnectedError(this.disconnectReason);
  }
}

function reportSummary(report: FullReport | null): Record<string, unknown> | null {
  if (!report) return null;
  return {
    total: report.total,
    matched: report.matched,
    accuracy: report.accuracy,
    missing: report.missing,
    wrongBlock: report.wrongBlock,
    wrongState: report.wrongState,
    obstructions: report.obstructions.length,
    diffs: report.diffs.slice(0, 100),
  };
}

/**
 * Runs one build session to completion: connects, builds, verifies, and keeps
 * the session row current. Reconnects and resumes from the persisted cursor
 * when the bot is disconnected.
 */
export async function runSession(sessionId: string, deps: RunnerDeps): Promise<SessionStatus> {
  const log = (msg: string) => {
    deps.log?.(`[${sessionId.slice(0, 8)}] ${msg}`);
    void publish({ type: 'log', message: msg });
  };
  const publish = (event: SessionEvent) => deps.redis.publish(eventsChannel(sessionId), JSON.stringify(event)).catch(() => {});
  const update = async (patch: Partial<SessionRow>) => {
    await deps.db.update(sessions).set({ ...patch, updatedAt: new Date() }).where(eq(sessions.id, sessionId));
  };
  const setStatus = async (status: SessionStatus, extra: Partial<SessionRow> = {}) => {
    await update({ status, ...extra });
    await publish({ type: 'status', status, error: extra.error ?? null, accuracy: extra.accuracy ?? null });
  };

  const [session] = await deps.db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!session) throw new Error(`session ${sessionId} not found`);
  if (session.status === 'cancelled' || session.status === 'completed') return session.status;
  const [schem] = await deps.db.select().from(schematics).where(eq(schematics.id, session.schematicId));
  if (!schem) {
    await setStatus('failed', { error: 'schematic not found', finishedAt: new Date() });
    return 'failed';
  }

  const loaded = loadSchematic(new Uint8Array(schem.data), schem.name);
  const transform = { origin: session.origin, rotation: session.rotation as Rotation };
  const placements = toPlacements(loaded, transform);
  const bounds = buildBounds(loaded, transform);

  const local = new LocalControl();
  if (session.status === 'paused') local.pause();
  const subscriber = deps.createSubscriber();
  await subscriber.subscribe(controlChannel(sessionId));
  subscriber.on('message', (_channel, raw) => {
    const msg = raw as ControlMessage;
    if (msg === 'pause') local.pause();
    else if (msg === 'resume') local.resume();
    else if (msg === 'cancel') local.cancel();
  });
  // A pause or cancel may have landed between the first read and the subscription.
  const [fresh] = await deps.db.select({ status: sessions.status }).from(sessions).where(eq(sessions.id, sessionId));
  if (fresh?.status === 'paused') local.pause();
  if (fresh?.status === 'cancelled') local.cancel();

  // Progress is written at most once per second and whenever the stage changes.
  let cursor = session.cursor;
  let lastStage: string | null = session.stage;
  let lastWrite = 0;
  let lastPublish = 0;
  const onProgress = (e: ProgressEvent) => {
    if (e.cursor !== undefined) cursor = e.cursor;
    const now = Date.now();
    const stageChanged = e.stage !== lastStage;
    lastStage = e.stage;
    if (stageChanged || now - lastPublish >= 250 || e.done === e.total) {
      lastPublish = now;
      void publish({ type: 'progress', ...e, cursor });
    }
    if (stageChanged || now - lastWrite >= 1000 || e.done === e.total) {
      lastWrite = now;
      void update({ stage: e.stage, done: e.done, total: e.total, cursor, ...(e.missing ? { missing: e.missing } : {}) }).catch(() => {});
    }
  };

  let attempt = 0;
  try {
    if (!local.isPaused && !local.isCancelled) await setStatus('running', { startedAt: session.startedAt ?? new Date(), error: null });
    for (;;) {
      const control = new SessionControl(local);
      let bot: Bot | null = null;
      try {
        await control.checkpoint();
        onProgress({ stage: 'connecting', done: 0, total: placements.length, cursor });
        bot = await connectBot({
          host: session.server.host,
          port: session.server.port,
          username: session.server.username,
          version: session.server.version,
        });
        const liveBot = bot;
        liveBot.on('end', (reason) => {
          control.disconnectReason ??= String(reason ?? 'connection closed');
        });
        liveBot.on('kicked', (reason) => {
          control.disconnectReason ??= `kicked: ${typeof reason === 'string' ? reason : JSON.stringify(reason)}`;
        });
        attempt = 0;
        log(`connected to ${session.server.host}:${session.server.port} as ${session.server.username}, resuming at step ${cursor}`);
        await update({ attempts: session.attempts + 1 });

        let report: FullReport | null;
        if (session.mode === 'op') {
          const result = await buildOp(
            liveBot,
            { placements, bounds, startCursor: cursor, control, onProgress, log },
            { ...deps.opDefaults, ...(session.options as Partial<OpBuildOptions>) },
          );
          report = result.report;
        } else {
          throw new Error('survival mode is not implemented yet');
        }
        if (control.disconnectReason) throw new DisconnectedError(control.disconnectReason);
        const summary = reportSummary(report);
        await setStatus('completed', {
          stage: 'done',
          accuracy: report?.accuracy ?? null,
          report: summary,
          finishedAt: new Date(),
          cursor,
        });
        log(report ? `done: ${report.matched}/${report.total} blocks correct` : 'done');
        return 'completed';
      } catch (err) {
        if (err instanceof CancelledError) {
          await setStatus('cancelled', { finishedAt: new Date(), cursor });
          log('cancelled');
          return 'cancelled';
        }
        const disconnected = err instanceof DisconnectedError || control.disconnectReason !== null || isConnectError(err);
        if (!disconnected) throw err;
        attempt++;
        await update({ cursor });
        if (attempt > deps.reconnectAttempts) throw err;
        const delay = deps.reconnectDelayMs?.(attempt) ?? Math.min(60_000, 2000 * 2 ** (attempt - 1));
        log(`${(err as Error).message}; reconnecting in ${Math.round(delay / 1000)}s (attempt ${attempt}/${deps.reconnectAttempts})`);
        await sleep(delay);
      } finally {
        bot?.removeAllListeners('end');
        bot?.quit();
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await setStatus('failed', { error: message, finishedAt: new Date(), cursor });
    log(`failed: ${message}`);
    return 'failed';
  } finally {
    await subscriber.quit().catch(() => {});
  }
}

function isConnectError(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  return ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'EHOSTUNREACH'].includes(e?.code ?? '') ||
    /timed out joining|connection ended|kicked while joining|socket/i.test(e?.message ?? '');
}
