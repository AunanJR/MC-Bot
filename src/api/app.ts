import { timingSafeEqual } from 'node:crypto';
import type { Queue } from 'bullmq';
import { desc, eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { schematics, sessions, type SchematicRow, type SessionRow } from '../db/schema.js';
import { loadSchematic } from '../schematic/load.js';
import { controlChannel, TERMINAL_STATUSES, type BuildJobData, type ControlMessage } from '../sessions/bus.js';
import { itemTotals } from '../survival/items.js';
import type { EventHub } from './hub.js';

export interface AppDeps {
  db: Db;
  queue: Queue<BuildJobData>;
  redis: Redis;
  hub: EventHub;
  apiToken?: string;
  maxSchematicBytes: number;
  defaultUsername: string;
  defaultVersion: string;
}

const vec3 = z.object({ x: z.number().int(), y: z.number().int(), z: z.number().int() });

const opOptions = z
  .object({
    commandsPerSecond: z.number().positive().max(1000),
    placementFlag: z.enum(['strict', 'replace']),
    mergeFills: z.boolean(),
    maxFillVolume: z.number().int().min(1).max(32768),
    clearArea: z.boolean(),
    fixPasses: z.number().int().min(0).max(10),
  })
  .partial()
  .strict();

const survivalOptions = z
  .object({
    reach: z.number().min(1).max(6),
    carrySlots: z.number().int().min(1).max(36),
    waitPollMs: z.number().int().min(500).max(600_000),
    fixPasses: z.number().int().min(0).max(10),
    maxAttempts: z.number().int().min(1).max(20),
  })
  .partial()
  .strict();

const createSessionBody = z
  .object({
    server: z.object({
      host: z.string().min(1),
      port: z.number().int().min(1).max(65535).default(25565),
      username: z.string().regex(/^[A-Za-z0-9_]{3,16}$/, 'must be a valid Minecraft username').optional(),
      version: z.string().min(1).optional(),
    }),
    schematicId: z.string().uuid(),
    origin: vec3,
    rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).default(0),
    chestPos: vec3.optional(),
    mode: z.enum(['op', 'survival']),
    options: z.record(z.string(), z.unknown()).default({}),
  })
  .superRefine((body, ctx) => {
    if (body.mode === 'survival' && !body.chestPos) {
      ctx.addIssue({ code: 'custom', path: ['chestPos'], message: 'chestPos is required in survival mode' });
    }
    const parsed = (body.mode === 'op' ? opOptions : survivalOptions).safeParse(body.options);
    if (!parsed.success) for (const issue of parsed.error.issues) ctx.addIssue({ ...issue, path: ['options', ...issue.path] } as never);
  });

export function presentSchematic(row: SchematicRow, version: string) {
  const loaded = loadSchematic(new Uint8Array(row.data), row.name);
  const { items, unplaceable } = itemTotals(loaded.blocks.map((b) => b.state), version);
  return {
    id: row.id,
    name: row.name,
    format: row.format,
    size: row.size,
    blockCount: row.blockCount,
    materials: sortCounts(row.materials),
    items: sortCounts(items),
    unplaceable: sortCounts(unplaceable),
    createdAt: row.createdAt,
  };
}

function sortCounts(counts: Record<string, number>) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id, count]) => ({ id, count }));
}

export function presentSession(row: SessionRow) {
  return {
    id: row.id,
    schematicId: row.schematicId,
    mode: row.mode,
    server: row.server,
    origin: row.origin,
    rotation: row.rotation,
    chestPos: row.chestPos,
    options: row.options,
    status: row.status,
    stage: row.stage,
    progress: {
      done: row.done,
      total: row.total,
      percent: row.total > 0 ? Math.round((row.done / row.total) * 1000) / 10 : 0,
      cursor: row.cursor,
    },
    accuracy: row.accuracy,
    report: row.report,
    missing: row.missing,
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  };
}

function tokenMatches(header: string | undefined, token: string): boolean {
  const given = Buffer.from(header?.replace(/^Bearer\s+/i, '') ?? '');
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function readUpload(c: Context, maxBytes: number): Promise<{ bytes: Uint8Array; filename: string } | { error: string; status: 400 | 413 }> {
  const type = c.req.header('content-type') ?? '';
  const declared = Number(c.req.header('content-length') ?? 0);
  if (declared > maxBytes) return { error: `file larger than ${maxBytes} bytes`, status: 413 };
  if (type.startsWith('multipart/form-data')) {
    const form = await c.req.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') return { error: 'multipart field "file" is required', status: 400 };
    if (file.size > maxBytes) return { error: `file larger than ${maxBytes} bytes`, status: 413 };
    return { bytes: new Uint8Array(await file.arrayBuffer()), filename: String(form.get('name') ?? file.name ?? 'schematic') };
  }
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  if (bytes.length > maxBytes) return { error: `file larger than ${maxBytes} bytes`, status: 413 };
  if (bytes.length === 0) return { error: 'empty body; send the file as multipart field "file" or as the raw body', status: 400 };
  return { bytes, filename: c.req.query('name') ?? 'schematic' };
}

export function createApp(deps: AppDeps) {
  const app = new Hono();
  const { db } = deps;

  app.get('/health', (c) => c.json({ ok: true }));

  app.use('*', async (c, next) => {
    if (deps.apiToken && !tokenMatches(c.req.header('authorization'), deps.apiToken)) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    await next();
  });

  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: 'internal error' }, 500);
  });

  app.post('/schematics', async (c) => {
    const upload = await readUpload(c, deps.maxSchematicBytes);
    if ('error' in upload) return c.json({ error: upload.error }, upload.status);
    let loaded;
    try {
      loaded = loadSchematic(upload.bytes, upload.filename);
    } catch (err) {
      return c.json({ error: `not a valid .litematic or .schem file: ${(err as Error).message}` }, 400);
    }
    const [row] = await db
      .insert(schematics)
      .values({
        name: upload.filename,
        format: loaded.format,
        size: loaded.size,
        blockCount: loaded.blocks.length,
        materials: loaded.materials,
        data: Buffer.from(upload.bytes),
      })
      .returning();
    return c.json(presentSchematic(row, deps.defaultVersion), 201);
  });

  app.get('/schematics/:id', async (c) => {
    const id = c.req.param('id');
    if (!z.string().uuid().safeParse(id).success) return c.json({ error: 'not found' }, 404);
    const [row] = await db.select().from(schematics).where(eq(schematics.id, id));
    if (!row) return c.json({ error: 'not found' }, 404);
    return c.json(presentSchematic(row, deps.defaultVersion));
  });

  app.post('/sessions', async (c) => {
    const json = await c.req.json().catch(() => null);
    const parsed = createSessionBody.safeParse(json);
    if (!parsed.success) {
      return c.json({ error: 'invalid request', issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, 400);
    }
    const body = parsed.data;
    const [schem] = await db.select({ id: schematics.id, blockCount: schematics.blockCount }).from(schematics).where(eq(schematics.id, body.schematicId));
    if (!schem) return c.json({ error: 'schematic not found' }, 404);
    const [row] = await db
      .insert(sessions)
      .values({
        schematicId: body.schematicId,
        mode: body.mode,
        server: {
          host: body.server.host,
          port: body.server.port,
          username: body.server.username ?? deps.defaultUsername,
          version: body.server.version ?? deps.defaultVersion,
        },
        origin: body.origin,
        rotation: body.rotation,
        chestPos: body.chestPos ?? null,
        options: body.options,
        total: schem.blockCount,
      })
      .returning();
    await enqueue(row.id);
    return c.json(presentSession(row), 201);
  });

  app.get('/sessions', async (c) => {
    const rows = await db.select().from(sessions).orderBy(desc(sessions.createdAt)).limit(50);
    return c.json(rows.map(presentSession));
  });

  const loadSession = async (id: string) => {
    if (!z.string().uuid().safeParse(id).success) return undefined;
    const [row] = await db.select().from(sessions).where(eq(sessions.id, id));
    return row;
  };

  app.get('/sessions/:id', async (c) => {
    const row = await loadSession(c.req.param('id'));
    if (!row) return c.json({ error: 'not found' }, 404);
    return c.json(presentSession(row));
  });

  const control = async (id: string, msg: ControlMessage) => deps.redis.publish(controlChannel(id), msg);
  const enqueue = (id: string) =>
    deps.queue.add('build', { sessionId: id }, { attempts: 3, backoff: { type: 'exponential', delay: 10_000 }, removeOnComplete: 1000, removeOnFail: 1000 });
  const setStatus = async (id: string, patch: Partial<SessionRow>) => {
    const [row] = await db.update(sessions).set({ ...patch, updatedAt: new Date() }).where(eq(sessions.id, id)).returning();
    return row;
  };

  app.post('/sessions/:id/pause', async (c) => {
    const row = await loadSession(c.req.param('id'));
    if (!row) return c.json({ error: 'not found' }, 404);
    if (!['queued', 'running', 'waiting_for_items'].includes(row.status)) return c.json({ error: `cannot pause a ${row.status} session` }, 409);
    const updated = await setStatus(row.id, { status: 'paused' });
    await control(row.id, 'pause');
    return c.json(presentSession(updated));
  });

  app.post('/sessions/:id/resume', async (c) => {
    const row = await loadSession(c.req.param('id'));
    if (!row) return c.json({ error: 'not found' }, 404);
    if (row.status === 'paused') {
      const updated = await setStatus(row.id, { status: row.startedAt ? 'running' : 'queued' });
      await control(row.id, 'resume');
      return c.json(presentSession(updated));
    }
    if (row.status === 'failed') {
      // Retry from the persisted cursor.
      const updated = await setStatus(row.id, { status: 'queued', error: null, finishedAt: null });
      await enqueue(row.id);
      return c.json(presentSession(updated));
    }
    return c.json({ error: `cannot resume a ${row.status} session` }, 409);
  });

  app.post('/sessions/:id/cancel', async (c) => {
    const row = await loadSession(c.req.param('id'));
    if (!row) return c.json({ error: 'not found' }, 404);
    if (TERMINAL_STATUSES.includes(row.status)) return c.json({ error: `session already ${row.status}` }, 409);
    const updated = await setStatus(row.id, { status: 'cancelled', finishedAt: new Date() });
    await control(row.id, 'cancel');
    return c.json(presentSession(updated));
  });

  app.get('/sessions/:id/events', async (c) => {
    const row = await loadSession(c.req.param('id'));
    if (!row) return c.json({ error: 'not found' }, 404);
    return streamSSE(c, async (stream) => {
      let closed = false;
      let wake: () => void = () => {};
      const done = new Promise<void>((r) => (wake = r));
      // Writes are chained so the terminal status event is flushed before the stream closes.
      let writes: Promise<unknown> = Promise.resolve();
      const send = (event: string, data: unknown) => {
        writes = writes.then(() => stream.writeSSE({ event, data: JSON.stringify(data) })).catch(() => {});
        return writes;
      };
      const finish = () => {
        closed = true;
        wake();
      };
      const unsubscribe = await deps.hub.subscribe(row.id, (event) => {
        if (closed) return;
        void send(event.type, event);
        if (event.type === 'status' && TERMINAL_STATUSES.includes(event.status)) finish();
      });
      stream.onAbort(finish);
      // Snapshot after subscribing, so no event falls between the two.
      const current = await loadSession(row.id);
      await send('session', presentSession(current!));
      if (TERMINAL_STATUSES.includes(current!.status)) finish();
      const ping = setInterval(() => void send('ping', {}), 15_000);
      await done;
      clearInterval(ping);
      unsubscribe();
      await writes;
    });
  });

  return app;
}
