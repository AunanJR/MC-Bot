import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  /** When set, every API request needs `Authorization: Bearer <API_TOKEN>`. */
  API_TOKEN: z.string().optional(),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  BOT_USERNAME: z.string().min(1).default('Blueprint'),
  MC_VERSION: z.string().min(1).default('26.1'),
  OP_COMMANDS_PER_SECOND: z.coerce.number().positive().default(20),
  MAX_SCHEMATIC_BYTES: z.coerce.number().int().positive().default(20 * 1024 * 1024),
  /** How often the worker tries to reconnect a dropped bot before failing the session. */
  RECONNECT_ATTEMPTS: z.coerce.number().int().min(0).default(10),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`invalid environment: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  return parsed.data;
}
