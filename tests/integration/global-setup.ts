import { execFileSync, spawnSync } from 'node:child_process';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    mc: { host: string; port: number };
    databaseUrl: string;
    redisUrl: string;
  }
}

const CONTAINER = 'blueprint-it-mc';
const PG_CONTAINER = 'blueprint-it-postgres';
const REDIS_CONTAINER = 'blueprint-it-redis';
const IMAGE = 'blueprint-test-mc';

function docker(...args: string[]): string {
  return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** Both streams: postgres logs to stderr, the Minecraft server to stdout. */
function dockerLogs(container: string): string {
  const r = spawnSync('docker', ['logs', container], { encoding: 'utf8' });
  return `${r.stdout ?? ''}${r.stderr ?? ''}`;
}

async function waitForLog(container: string, pattern: RegExp, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pattern.test(dockerLogs(container))) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${container} did not become ready within ${timeoutMs / 1000}s:\n${dockerLogs(container).slice(-3000)}`);
}

function publishedPort(container: string, port: string): number {
  const mapping = docker('port', container, port).split('\n')[0];
  return Number(mapping.slice(mapping.lastIndexOf(':') + 1));
}

function removeContainer(name: string): void {
  try {
    docker('rm', '-f', name);
  } catch {
    // Not running.
  }
}

/**
 * Starts throwaway containers for the integration tests, each published on a
 * random loopback port only: an offline-mode Minecraft test server, Postgres
 * and Redis. Set MC_HOST/MC_PORT, DATABASE_URL or REDIS_URL to use running
 * services instead.
 */
export default async function setup(project: TestProject) {
  const started: string[] = [];
  const needDocker = !process.env.MC_HOST || !process.env.DATABASE_URL || !process.env.REDIS_URL;
  if (needDocker) {
    try {
      docker('info');
    } catch {
      throw new Error('integration tests need Docker, or MC_HOST/MC_PORT, DATABASE_URL and REDIS_URL pointing at running services');
    }
  }

  if (process.env.MC_HOST) {
    project.provide('mc', { host: process.env.MC_HOST, port: Number(process.env.MC_PORT ?? 25565) });
  } else {
    docker('build', '-q', '-t', IMAGE, new URL('../../docker/mc', import.meta.url).pathname);
    removeContainer(CONTAINER);
    docker('run', '-d', '--name', CONTAINER, '-p', '127.0.0.1::25565', IMAGE);
    started.push(CONTAINER);
  }

  if (process.env.DATABASE_URL) {
    project.provide('databaseUrl', process.env.DATABASE_URL);
  } else {
    removeContainer(PG_CONTAINER);
    docker('run', '-d', '--name', PG_CONTAINER, '-p', '127.0.0.1::5432', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_DB=blueprint', 'postgres:17-alpine');
    started.push(PG_CONTAINER);
  }

  if (process.env.REDIS_URL) {
    project.provide('redisUrl', process.env.REDIS_URL);
  } else {
    removeContainer(REDIS_CONTAINER);
    docker('run', '-d', '--name', REDIS_CONTAINER, '-p', '127.0.0.1::6379', 'redis:7-alpine');
    started.push(REDIS_CONTAINER);
  }

  if (started.includes(CONTAINER)) {
    await waitForLog(CONTAINER, /Done \([\d.]+s\)!/, 180_000);
    project.provide('mc', { host: '127.0.0.1', port: publishedPort(CONTAINER, '25565/tcp') });
  }
  if (started.includes(PG_CONTAINER)) {
    // The entrypoint restarts postgres once after init; wait for the final start.
    await waitForLog(PG_CONTAINER, /PostgreSQL init process complete[\s\S]*ready to accept connections/, 120_000);
    project.provide('databaseUrl', `postgres://postgres@127.0.0.1:${publishedPort(PG_CONTAINER, '5432/tcp')}/blueprint`);
  }
  if (started.includes(REDIS_CONTAINER)) {
    await waitForLog(REDIS_CONTAINER, /Ready to accept connections/, 60_000);
    project.provide('redisUrl', `redis://127.0.0.1:${publishedPort(REDIS_CONTAINER, '6379/tcp')}`);
  }

  return () => {
    if (process.env.KEEP_TEST_SERVER) return;
    for (const name of started) removeContainer(name);
  };
}
