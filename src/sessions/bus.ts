import type { ProgressEvent } from '../builder/control.js';
import type { SessionStatus } from '../db/schema.js';

export const QUEUE_NAME = 'blueprint-builds';

export const eventsChannel = (sessionId: string) => `blueprint:session:${sessionId}:events`;
export const controlChannel = (sessionId: string) => `blueprint:session:${sessionId}:control`;

export type SessionEvent =
  | ({ type: 'progress' } & ProgressEvent)
  | { type: 'status'; status: SessionStatus; error?: string | null; accuracy?: number | null }
  | { type: 'log'; message: string };

export type ControlMessage = 'pause' | 'resume' | 'cancel';

export interface BuildJobData {
  sessionId: string;
}

export const TERMINAL_STATUSES: SessionStatus[] = ['completed', 'failed', 'cancelled'];
