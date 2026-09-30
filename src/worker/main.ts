import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { loadEnv } from '../config/env.js';
import { createDb } from '../db/client.js';
import { QUEUE_NAME, type BuildJobData } from '../sessions/bus.js';
import { runSession } from './runner.js';

const env = loadEnv();
const { db, close } = createDb(env.DATABASE_URL);
const redisOpts = { maxRetriesPerRequest: null };
const redis = new Redis(env.REDIS_URL, redisOpts);

const worker = new Worker<BuildJobData>(
  QUEUE_NAME,
  async (job) =>
    runSession(job.data.sessionId, {
      db,
      redis,
      createSubscriber: () => new Redis(env.REDIS_URL, redisOpts),
      reconnectAttempts: env.RECONNECT_ATTEMPTS,
      opDefaults: { commandsPerSecond: env.OP_COMMANDS_PER_SECOND },
      log: (msg) => console.log(msg),
    }),
  { connection: new Redis(env.REDIS_URL, redisOpts), concurrency: env.WORKER_CONCURRENCY, lockDuration: 60_000 },
);

worker.on('failed', (job, err) => console.error(`job ${job?.id} failed: ${err.message}`));
console.log(`blueprint worker started (concurrency ${env.WORKER_CONCURRENCY})`);

const shutdown = async () => {
  await worker.close();
  await Promise.allSettled([redis.quit(), close()]);
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
