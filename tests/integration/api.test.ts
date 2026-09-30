import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { serve, type ServerType } from '@hono/node-server';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createApp } from '../../src/api/app.js';
import { EventHub } from '../../src/api/hub.js';
import { createDb, runMigrations } from '../../src/db/client.js';
import { QUEUE_NAME, type BuildJobData } from '../../src/sessions/bus.js';
import { runSession } from '../../src/worker/runner.js';
import { BOT_NAME } from './helpers.js';
import { TcpProxy } from './proxy.js';
import { SseClient } from './sse.js';

const fixture = readFileSync(new URL('../fixtures/small_house.litematic', import.meta.url));

describe('HTTP API with worker', () => {
  const redisUrl = inject('redisUrl');
  const databaseUrl = inject('databaseUrl');
  const mc = inject('mc');
  const opts = { maxRetriesPerRequest: null };
  const closers: (() => Promise<unknown> | unknown)[] = [];
  let base = '';
  let proxy: TcpProxy;
  const workerLogs: string[] = [];

  const api = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, json: (await res.json()) as any };
  };

  beforeAll(async () => {
    await runMigrations(databaseUrl);
    const { db, close } = createDb(databaseUrl);
    const redis = new Redis(redisUrl, opts);
    // A fresh queue name per run keeps old jobs from earlier runs out of the way.
    const queueName = `${QUEUE_NAME}-test-${Date.now()}`;
    const queue = new Queue<BuildJobData>(queueName, { connection: new Redis(redisUrl, opts) });
    const hub = new EventHub(new Redis(redisUrl, opts));
    const app = createApp({ db, queue, redis, hub, maxSchematicBytes: 5_000_000, defaultUsername: BOT_NAME, defaultVersion: '26.1' });
    const server: ServerType = await new Promise((resolve) => {
      const s = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    proxy = new TcpProxy(mc);
    await proxy.listen();

    const worker = new Worker<BuildJobData>(
      queueName,
      async (job) =>
        runSession(job.data.sessionId, {
          db,
          redis,
          createSubscriber: () => new Redis(redisUrl, opts),
          reconnectAttempts: 5,
          reconnectDelayMs: () => 1000,
          log: (m) => {
            workerLogs.push(m);
            console.log(m);
          },
        }),
      { connection: new Redis(redisUrl, opts), concurrency: 1 },
    );
    closers.push(() => worker.close(), () => proxy.close(), () => server.close(), () => queue.close(), () => hub.close(), () => redis.quit(), close);
  });

  afterAll(async () => {
    for (const c of closers) await c();
  });

  let schematicId = '';

  it('POST /schematics returns size and material list', async () => {
    const form = new FormData();
    form.append('file', new Blob([fixture]), 'small_house.litematic');
    const res = await fetch(`${base}/schematics`, { method: 'POST', body: form });
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.size).toEqual({ x: 9, y: 6, z: 9 });
    expect(body.blockCount).toBe(335);
    expect(body.format).toBe('litematic');
    expect(body.materials).toContainEqual({ id: 'minecraft:cobblestone', count: 81 });
    expect(body.items).toContainEqual({ id: 'minecraft:oak_door', count: 1 });
    expect(body.items).toContainEqual({ id: 'minecraft:torch', count: 3 });
    expect(body.unplaceable).toEqual([]);
    schematicId = body.id;

    const again = await api('GET', `/schematics/${schematicId}`);
    expect(again.status).toBe(200);
    expect(again.json.blockCount).toBe(335);
  });

  it('rejects bad uploads and bad session requests', async () => {
    const bad = await fetch(`${base}/schematics?name=x.litematic`, { method: 'POST', body: new Uint8Array([1, 2, 3]) });
    expect(bad.status).toBe(400);
    const noChest = await api('POST', '/sessions', {
      server: { host: '127.0.0.1', port: proxy.port },
      schematicId,
      origin: { x: 0, y: -60, z: 0 },
      mode: 'survival',
    });
    expect(noChest.status).toBe(400);
    expect(noChest.json.issues[0].path).toBe('chestPos');
    const badRotation = await api('POST', '/sessions', {
      server: { host: '127.0.0.1' },
      schematicId,
      origin: { x: 0, y: -60, z: 0 },
      rotation: 45,
      mode: 'op',
    });
    expect(badRotation.status).toBe(400);
    expect((await api('GET', '/sessions/00000000-0000-0000-0000-000000000000')).status).toBe(404);
  });

  it('runs an op session with pause, resume, a dropped connection and SSE progress', async () => {
    const created = await api('POST', '/sessions', {
      server: { host: '127.0.0.1', port: proxy.port },
      schematicId,
      origin: { x: 140, y: -60, z: 40 },
      rotation: 180,
      mode: 'op',
      options: { commandsPerSecond: 4, mergeFills: true },
    });
    expect(created.status).toBe(201);
    const id = created.json.id;
    expect(created.json.status).toBe('queued');

    const sse = new SseClient(`${base}/sessions/${id}/events`);
    await sse.waitFor((e) => e.event === 'session');
    await sse.waitFor((e) => e.event === 'progress' && e.data.stage === 'building' && e.data.cursor >= 5);

    // Pause: progress stops.
    expect((await api('POST', `/sessions/${id}/pause`)).json.status).toBe('paused');
    await new Promise((r) => setTimeout(r, 1500));
    const pausedAt = (await api('GET', `/sessions/${id}`)).json.progress.cursor;
    await new Promise((r) => setTimeout(r, 2000));
    expect((await api('GET', `/sessions/${id}`)).json.progress.cursor).toBe(pausedAt);
    expect((await api('POST', `/sessions/${id}/resume`)).json.status).toBe('running');

    // Drop the connection mid-build: the worker reconnects and resumes from the persisted cursor.
    await sse.waitFor((e) => e.event === 'progress' && e.data.cursor >= pausedAt + 8);
    proxy.dropAll();
    const resumed = await sse.waitFor((e) => e.event === 'log' && /resuming at step [1-9]\d*/.test(e.data.message));
    const resumedAt = Number(/resuming at step (\d+)/.exec(resumed.data.message)![1]);
    expect(resumedAt).toBeGreaterThanOrEqual(pausedAt + 8);

    const final = await sse.waitFor((e) => e.event === 'status' && ['completed', 'failed'].includes(e.data.status), 300_000);
    sse.close();
    expect(final.data.status).toBe('completed');

    const session = (await api('GET', `/sessions/${id}`)).json;
    console.log(`api op session accuracy: ${session.accuracy} (${JSON.stringify({ ...session.report, diffs: session.report.diffs.length })})`);
    expect(session.status).toBe('completed');
    expect(session.accuracy).toBe(1);
    expect(session.report.matched).toBe(335);
    expect(workerLogs.some((l) => /bot disconnected|reconnecting/.test(l))).toBe(true);
    expect(sse.events.filter((e) => e.event === 'progress').length).toBeGreaterThan(5);
  });

  it('cancels a session', async () => {
    const created = await api('POST', '/sessions', {
      server: { host: '127.0.0.1', port: proxy.port },
      schematicId,
      origin: { x: 160, y: -60, z: 40 },
      mode: 'op',
      options: { commandsPerSecond: 2 },
    });
    const id = created.json.id;
    const sse = new SseClient(`${base}/sessions/${id}/events`);
    await sse.waitFor((e) => e.event === 'progress' && e.data.stage === 'building');
    const cancelled = await api('POST', `/sessions/${id}/cancel`);
    expect(cancelled.json.status).toBe('cancelled');
    await sse.waitFor((e) => e.event === 'status' && e.data.status === 'cancelled');
    sse.close();
    await new Promise((r) => setTimeout(r, 1000));
    const session = (await api('GET', `/sessions/${id}`)).json;
    expect(session.status).toBe('cancelled');
    expect((await api('POST', `/sessions/${id}/resume`)).status).toBe(409);
  });
});
