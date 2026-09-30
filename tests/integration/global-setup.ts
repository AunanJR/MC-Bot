import { execFileSync } from 'node:child_process';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    mc: { host: string; port: number };
  }
}

const CONTAINER = 'blueprint-it-mc';
const IMAGE = 'blueprint-test-mc';

function docker(...args: string[]): string {
  return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

async function waitForReady(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const logs = docker('logs', CONTAINER);
    if (/Done \([\d.]+s\)!/.test(logs)) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`test server did not start within ${timeoutMs / 1000}s:\n${docker('logs', '--tail', '40', CONTAINER)}`);
}

/**
 * Starts a fresh offline-mode test server in Docker for the integration tests,
 * published on a random loopback port. Set MC_HOST/MC_PORT to use a running
 * server instead (for example the one from docker compose).
 */
export default async function setup(project: TestProject) {
  if (process.env.MC_HOST) {
    project.provide('mc', { host: process.env.MC_HOST, port: Number(process.env.MC_PORT ?? 25565) });
    return;
  }
  try {
    docker('info');
  } catch {
    throw new Error('integration tests need Docker (or MC_HOST/MC_PORT pointing at a test server)');
  }
  docker('build', '-q', '-t', IMAGE, new URL('../../docker/mc', import.meta.url).pathname);
  try {
    docker('rm', '-f', CONTAINER);
  } catch {
    // Not running.
  }
  docker('run', '-d', '--name', CONTAINER, '-p', '127.0.0.1::25565', IMAGE);
  await waitForReady(180_000);
  const mapping = docker('port', CONTAINER, '25565/tcp').split('\n')[0];
  const port = Number(mapping.slice(mapping.lastIndexOf(':') + 1));
  project.provide('mc', { host: '127.0.0.1', port });

  return () => {
    if (process.env.KEEP_TEST_SERVER) return;
    try {
      docker('rm', '-f', CONTAINER);
    } catch {
      // Already gone.
    }
  };
}
