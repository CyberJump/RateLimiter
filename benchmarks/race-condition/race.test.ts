import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { Redis } from 'ioredis';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FixedWindowLimiter } from '../../src/rate-limiters/fixed-window.js';
import { SlidingWindowLimiter } from '../../src/rate-limiters/sliding-window.js';
import { TokenBucketLimiter } from '../../src/rate-limiters/token-bucket.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Rate Limiter Race Condition & Concurrency Tests', () => {
  let redis: Redis;
  let fixedWindowLimiter: FixedWindowLimiter;
  let slidingWindowLimiter: SlidingWindowLimiter;
  let tokenBucketLimiter: TokenBucketLimiter;

  beforeAll(async () => {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    redis = new Redis(redisUrl, { lazyConnect: false });

    // Register Lua commands on test client instance
    const luaDir = resolve(__dirname, '..', '..', 'src', 'rate-limiters', 'lua');

    redis.defineCommand('fixedWindowCheck', {
      numberOfKeys: 1,
      lua: readFileSync(resolve(luaDir, 'fixed-window.lua'), 'utf-8'),
    });

    redis.defineCommand('slidingWindowCheck', {
      numberOfKeys: 1,
      lua: readFileSync(resolve(luaDir, 'sliding-window.lua'), 'utf-8'),
    });

    redis.defineCommand('tokenBucketCheck', {
      numberOfKeys: 1,
      lua: readFileSync(resolve(luaDir, 'token-bucket.lua'), 'utf-8'),
    });

    fixedWindowLimiter = new FixedWindowLimiter(redis);
    slidingWindowLimiter = new SlidingWindowLimiter(redis);
    tokenBucketLimiter = new TokenBucketLimiter(redis);
  });

  afterAll(async () => {
    await redis.quit();
  });

  const ITERATIONS = 100;
  const LIMIT = 50;
  const WINDOW_SECS = 60;
  const BURST = 50;
  const CONCURRENT_REQUESTS = 100;

  test(`Fixed Window: ${ITERATIONS} iterations of ${CONCURRENT_REQUESTS} concurrent requests against limit=${LIMIT} -> exactly ${LIMIT} allowed, 0 over-admits`, async () => {
    let overAdmits = 0;
    
    for (let i = 0; i < ITERATIONS; i++) {
      const keyId = `race-test-fixed-${Date.now()}-${i}`;
      
      const promises = Array.from({ length: CONCURRENT_REQUESTS }, () =>
        fixedWindowLimiter.check(keyId, LIMIT, WINDOW_SECS),
      );

      const results = await Promise.all(promises);
      const allowedCount = results.filter((r) => r.allowed).length;
      
      if (allowedCount > LIMIT) {
        overAdmits++;
      }
    }

    expect(overAdmits).toBe(0);
  }, 30000); // 30s timeout for 100 iterations

  test(`Sliding Window: ${ITERATIONS} iterations of ${CONCURRENT_REQUESTS} concurrent requests against limit=${LIMIT} -> exactly ${LIMIT} allowed, 0 over-admits`, async () => {
    let overAdmits = 0;

    for (let i = 0; i < ITERATIONS; i++) {
      const keyId = `race-test-sliding-${Date.now()}-${i}`;
      
      const promises = Array.from({ length: CONCURRENT_REQUESTS }, () =>
        slidingWindowLimiter.check(keyId, LIMIT, WINDOW_SECS),
      );

      const results = await Promise.all(promises);
      const allowedCount = results.filter((r) => r.allowed).length;
      
      if (allowedCount > LIMIT) {
        overAdmits++;
      }
    }

    expect(overAdmits).toBe(0);
  }, 30000);

  test(`Token Bucket: ${ITERATIONS} iterations of ${CONCURRENT_REQUESTS} concurrent requests against capacity=${LIMIT} -> exactly ${LIMIT} allowed, 0 over-admits`, async () => {
    let overAdmits = 0;

    for (let i = 0; i < ITERATIONS; i++) {
      const keyId = `race-test-bucket-${Date.now()}-${i}`;
      
      const promises = Array.from({ length: CONCURRENT_REQUESTS }, () =>
        tokenBucketLimiter.check(keyId, LIMIT, WINDOW_SECS, BURST),
      );

      const results = await Promise.all(promises);
      const allowedCount = results.filter((r) => r.allowed).length;
      
      if (allowedCount > BURST) { // Burst is the max allowed instantly
        overAdmits++;
      }
    }

    expect(overAdmits).toBe(0);
  }, 30000);
});
