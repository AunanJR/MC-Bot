export interface SseEvent {
  event: string;
  data: any;
}

/** Minimal SSE reader: collects events and lets a test wait for one matching a predicate. */
export class SseClient {
  readonly events: SseEvent[] = [];
  private waiters: { pred: (e: SseEvent) => boolean; resolve: (e: SseEvent) => void }[] = [];
  private readonly controller = new AbortController();
  closed: Promise<void>;

  constructor(url: string, headers: Record<string, string> = {}) {
    this.closed = this.run(url, headers);
  }

  private async run(url: string, headers: Record<string, string>): Promise<void> {
    const res = await fetch(url, { headers, signal: this.controller.signal });
    if (!res.ok || !res.body) throw new Error(`SSE request failed: ${res.status}`);
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        buffer += decoder.decode(chunk, { stream: true });
        let idx;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const raw = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          let event = 'message';
          const data: string[] = [];
          for (const line of raw.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) data.push(line.slice(5).trim());
          }
          const parsed = { event, data: JSON.parse(data.join('\n') || 'null') };
          this.events.push(parsed);
          this.waiters = this.waiters.filter((w) => {
            if (!w.pred(parsed)) return true;
            w.resolve(parsed);
            return false;
          });
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') throw err;
    }
  }

  waitFor(pred: (e: SseEvent) => boolean, timeoutMs = 120_000): Promise<SseEvent> {
    const found = this.events.find(pred);
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for SSE event')), timeoutMs);
      this.waiters.push({
        pred,
        resolve: (e) => {
          clearTimeout(timer);
          resolve(e);
        },
      });
    });
  }

  close(): void {
    this.controller.abort();
  }
}
