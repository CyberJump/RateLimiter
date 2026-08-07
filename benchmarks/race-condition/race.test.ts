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

  test('Fixed Window: 100 concurrent requests against limit=50 -> exactly 50 allowed (0 over-admits)', async () => {
    const keyId = `race-test-fixed-${Date.now()}`;
    const limit = 50;
    const windowSecs = 60;
    const concurrentRequests = 100;

    // Fire all requests simultaneously via Promise.all
    const promises = Array.from({ length: concurrentRequests }, () =>
      fixedWindowLimiter.check(keyId, limit, windowSecs),
    );

    const results = await Promise.all(promises);

    const allowedCount = results.filter((r) => r.allowed).length;
    const blockedCount = results.filter((r) => !r.allowed).length;

    expect(allowedCount).toBe(50);
    expect(blockedCount).toBe(50);
  });

  test('Sliding Window: 100 concurrent requests against limit=50 -> exactly 50 allowed (0 over-admits)', async () => {
    const keyId = `race-test-sliding-${Date.now()}`;
    const limit = 50;
    const windowSecs = 60;
    const concurrentRequests = 100;

    const promises = Array.from({ length: concurrentRequests }, () =>
      slidingWindowLimiter.check(keyId, limit, windowSecs),
    );

    const results = await Promise.all(promises);

    const allowedCount = results.filter((r) => r.allowed).length;
    const blockedCount = results.filter((r) => !r.allowed).length;

    expect(allowedCount).toBe(50);
    expect(blockedCount).toBe(50);
  });

  test('Token Bucket: 100 concurrent requests against capacity=50 -> exactly 50 allowed (0 over-admits)', async () => {
    const keyId = `race-test-bucket-${Date.now()}`;
    const limit = 50;
    const windowSecs = 60;
    const burstCapacity = 50;
    const concurrentRequests = 100;

    const promises = Array.from({ length: concurrentRequests }, () =>
      tokenBucketLimiter.check(keyId, limit, windowSecs, burstCapacity),
    );

    const results = await Promise.all(promises);

    const allowedCount = results.filter((r) => r.allowed).length;
    const blockedCount = results.filter((r) => !r.allowed).length;

    expect(allowedCount).toBe(50);
    expect(blockedCount).toBe(50);
  });
});
