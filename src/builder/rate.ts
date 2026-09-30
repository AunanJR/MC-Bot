/** Token bucket: at most `perSecond` acquisitions per second, with bursts up to `burst`. */
export class RateLimiter {
  private tokens: number;
  private last = Date.now();

  constructor(
    private readonly perSecond: number,
    private readonly burst = Math.max(1, Math.ceil(perSecond / 4)),
  ) {
    if (!(perSecond > 0)) throw new Error('rate limit must be > 0');
    this.tokens = this.burst;
  }

  async acquire(): Promise<void> {
    for (;;) {
      const now = Date.now();
      this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.perSecond);
      this.last = now;
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      await sleep(((1 - this.tokens) / this.perSecond) * 1000);
    }
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
