import { serve } from '@hono/node-server';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { loadEnv } from '../config/env.js';
import { createDb, runMigrations } from '../db/client.js';
import { QUEUE_NAME, type BuildJobData } from '../sessions/bus.js';
import { createApp } from './app.js';
import { EventHub } from './hub.js';

const env = loadEnv();
await runMigrations(env.DATABASE_URL);
const { db, close } = createDb(env.DATABASE_URL);
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const queue = new Queue<BuildJobData>(QUEUE_NAME, { connection: new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }) });
const hub = new EventHub(new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }));

const app = createApp({
  db,
  queue,
  redis,
  hub,
  apiToken: env.API_TOKEN || undefined,
  maxSchematicBytes: env.MAX_SCHEMATIC_BYTES,
  defaultUsername: env.BOT_USERNAME,
  defaultVersion: env.MC_VERSION,
});

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`blueprint api listening on :${info.port}${env.API_TOKEN ? ' (token required)' : ''}`);
});

const shutdown = async () => {
  server.close();
  await Promise.allSettled([queue.close(), hub.close(), redis.quit(), close()]);
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
