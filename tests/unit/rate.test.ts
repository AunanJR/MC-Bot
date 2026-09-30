import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../../src/builder/rate.js';

describe('rate limiter', () => {
  it('holds the configured rate', async () => {
    const limiter = new RateLimiter(50, 1);
    const start = Date.now();
    for (let i = 0; i < 26; i++) await limiter.acquire();
    const elapsed = Date.now() - start;
    // 1 token up front, then 25 at 50/s = 500 ms.
    expect(elapsed).toBeGreaterThanOrEqual(450);
    expect(elapsed).toBeLessThan(1500);
  });
});
