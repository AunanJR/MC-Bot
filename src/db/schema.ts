import { customType, integer, jsonb, pgTable, real, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

export interface Vec3Json {
  x: number;
  y: number;
  z: number;
}

export const schematics = pgTable('schematics', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  format: text('format').notNull(),
  size: jsonb('size').$type<Vec3Json>().notNull(),
  blockCount: integer('block_count').notNull(),
  materials: jsonb('materials').$type<Record<string, number>>().notNull(),
  data: bytea('data').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SessionStatus = 'queued' | 'running' | 'paused' | 'waiting_for_items' | 'completed' | 'failed' | 'cancelled';

export interface ServerJson {
  host: string;
  port: number;
  username: string;
  version: string;
}

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  schematicId: uuid('schematic_id').notNull().references(() => schematics.id),
  mode: text('mode').$type<'op' | 'survival'>().notNull(),
  server: jsonb('server').$type<ServerJson>().notNull(),
  origin: jsonb('origin').$type<Vec3Json>().notNull(),
  rotation: integer('rotation').notNull(),
  chestPos: jsonb('chest_pos').$type<Vec3Json | null>(),
  options: jsonb('options').$type<Record<string, unknown>>().notNull().default({}),
  status: text('status').$type<SessionStatus>().notNull().default('queued'),
  stage: text('stage'),
  /** Next build step to run; a restarted build resumes here. */
  cursor: integer('cursor').notNull().default(0),
  done: integer('done').notNull().default(0),
  total: integer('total').notNull().default(0),
  accuracy: real('accuracy'),
  report: jsonb('report').$type<Record<string, unknown> | null>(),
  missing: jsonb('missing').$type<Record<string, number> | null>(),
  error: text('error'),
  attempts: integer('attempts').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

export type SchematicRow = typeof schematics.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
