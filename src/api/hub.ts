import type { Redis } from 'ioredis';
import type { SessionEvent } from '../sessions/bus.js';

type Listener = (event: SessionEvent) => void;

const PATTERN = 'blueprint:session:*:events';

/** Fans out session events from one Redis subscription to SSE clients. */
export class EventHub {
  private readonly listeners = new Map<string, Set<Listener>>();
  private ready: Promise<unknown>;

  constructor(private readonly subscriber: Redis) {
    this.ready = subscriber.psubscribe(PATTERN);
    subscriber.on('pmessage', (_pattern, channel, raw) => {
      const id = channel.split(':')[2];
      const set = this.listeners.get(id);
      if (!set) return;
      let event: SessionEvent;
      try {
        event = JSON.parse(raw);
      } catch {
        return;
      }
      for (const l of set) l(event);
    });
  }

  async subscribe(sessionId: string, listener: Listener): Promise<() => void> {
    await this.ready;
    let set = this.listeners.get(sessionId);
    if (!set) this.listeners.set(sessionId, (set = new Set()));
    set.add(listener);
    return () => {
      set!.delete(listener);
      if (set!.size === 0) this.listeners.delete(sessionId);
    };
  }

  close(): Promise<unknown> {
    return this.subscriber.quit();
  }
}
