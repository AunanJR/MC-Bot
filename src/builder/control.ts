export class CancelledError extends Error {
  constructor() {
    super('build cancelled');
    this.name = 'CancelledError';
  }
}

/**
 * Lets the owner of a build pause, resume or cancel it. Builders call
 * `checkpoint()` between steps.
 */
export interface BuildControl {
  checkpoint(): Promise<void>;
}

/** In-memory control, used directly by tests and wrapped by the worker. */
export class LocalControl implements BuildControl {
  private paused = false;
  private cancelled = false;
  private waiters: (() => void)[] = [];

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    this.flush();
  }

  cancel(): void {
    this.cancelled = true;
    this.flush();
  }

  get isPaused(): boolean {
    return this.paused;
  }

  get isCancelled(): boolean {
    return this.cancelled;
  }

  async checkpoint(): Promise<void> {
    while (this.paused && !this.cancelled) await new Promise<void>((r) => this.waiters.push(r));
    if (this.cancelled) throw new CancelledError();
  }

  private flush(): void {
    const w = this.waiters;
    this.waiters = [];
    for (const r of w) r();
  }
}

export const noControl: BuildControl = { checkpoint: async () => {} };

export type BuildStage = 'connecting' | 'clearing' | 'building' | 'verifying' | 'fixing' | 'waiting_for_items' | 'done';

export interface ProgressEvent {
  stage: BuildStage;
  /** Blocks (or commands, for op mode) done in this stage. */
  done: number;
  total: number;
  message?: string;
  /** Index of the next step to run; persisted so a restarted build resumes here. */
  cursor?: number;
  /** Items the bot needs but could not find, block id -> count. */
  missing?: Record<string, number>;
}

export type ProgressListener = (event: ProgressEvent) => void;
