/**
 * Fixed Window — Over-Admission Regression Test
 *
 * Reproduces the bug where 195 requests were allowed against a 100-request
 * limit in an 11-second soak test with a 60-second window.
 *
 * Root Cause:
 *   The gateway was reading `window_secs=10` from its Postgres tier (an old
 *   value from before the unified policy migration). The fixed-window Redis key
 *   is `ratelimit:fixed:{apiKeyId}:{windowNumber}` where
 *   `windowNumber = Math.floor(now / windowSecs)`. With windowSecs=10, the
 *   counter resets every 10 seconds, allowing up to 100 req/window * N windows.
 *   In an 11-second test: window 0 (0-10s) allows 100, window 1 (10-11s)
 *   allows up to 100 more — hence ~195 allowed total.
 *
 * This test verifies that the FixedWindowLimiter itself (the Lua script)
 * never over-admits within a 60-second window, regardless of test duration.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { Redis } from 'ioredis';
import { FixedWindowLimiter } from '../../src/rate-limiters/fixed-window.js';

describe('Fixed Window — Over-Admission Regression (Issue #1)', () => {
  let redis: Redis;
  let limiter: FixedWindowLimiter;

  beforeAll(async () => {
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      lazyConnect: false,
    });
    limiter = new FixedWindowLimiter(redis);
  });

  afterAll(async () => {
    await redis.quit();
  });

  test(
    'Soak simulation: 200 sequential requests in ~12 seconds against limit=100/window=60s must NEVER exceed 100 allowed',
    async () => {
      const LIMIT = 100;
      const WINDOW_SECS = 60;
      const TOTAL_REQUESTS = 200;
      const DELAY_MS = 60; // ~16 req/s → 200 requests ≈ 12 seconds
      const keyId = `regression-fw-soak-${Date.now()}`;

      let allowedCount = 0;
      let blockedCount = 0;

      for (let i = 0; i < TOTAL_REQUESTS; i++) {
        const result = await limiter.check(keyId, LIMIT, WINDOW_SECS);
        if (result.allowed) {
          allowedCount++;
        } else {
          blockedCount++;
        }
        // Small delay to simulate traffic arriving over time (not all at once)
        await new Promise(res => setTimeout(res, DELAY_MS));
      }

      console.log(`Allowed: ${allowedCount} / ${TOTAL_REQUESTS} | Blocked: ${blockedCount}`);

      // The critical assertion: NEVER exceed the configured limit within one window
      expect(allowedCount).toBeLessThanOrEqual(LIMIT);
      // Also verify that we actually hit the limit (test is meaningful)
      expect(blockedCount).toBeGreaterThan(0);
    },
    // 200 requests × 60ms = 12s + some Redis latency overhead
    30_000,
  );

  test(
    'Concurrent burst: 300 simultaneous requests against limit=100/window=60s must NEVER allow more than 100',
    async () => {
      const LIMIT = 100;
      const WINDOW_SECS = 60;
      const keyId = `regression-fw-burst-${Date.now()}`;

      const promises = Array.from({ length: 300 }, () =>
        limiter.check(keyId, LIMIT, WINDOW_SECS),
      );
      const results = await Promise.all(promises);

      const allowedCount = results.filter(r => r.allowed).length;
      const blockedCount = results.filter(r => !r.allowed).length;

      console.log(`Burst Allowed: ${allowedCount} / 300 | Blocked: ${blockedCount}`);

      // This is the primary correctness invariant
      expect(allowedCount).toBeLessThanOrEqual(LIMIT);
      expect(blockedCount).toBeGreaterThanOrEqual(200);
    },
    15_000,
  );

  test(
    'Window rotation guard: confirms that a 10-second window_secs value would cause over-admission (documents the root cause)',
    async () => {
      // This test DEMONSTRATES the bug by using window_secs=10.
      // With limit=100 per window and a 10s window, sending 100 requests in window 1,
      // waiting for the boundary, then sending 100 more in window 2 → 200 total allowed.
      // This documents why the DB tier value matters: window_secs=10 (old default)
      // instead of 60 means resets every 10s, not every 60s.
      const SHORT_WINDOW = 10;
      const LIMIT = 100;
      const keyId = `regression-fw-short-window-${Date.now()}`;

      // Fire exactly LIMIT requests in first window — all should be allowed
      const batch1 = Array.from({ length: LIMIT }, () =>
        limiter.check(keyId, LIMIT, SHORT_WINDOW),
      );
      const batch1Results = await Promise.all(batch1);
      const batch1Allowed = batch1Results.filter(r => r.allowed).length;

      // Wait past the window boundary so the Redis key expires and a new window opens
      await new Promise(res => setTimeout(res, SHORT_WINDOW * 1000 + 500));

      // Fire another LIMIT requests — new window, counter resets, up to LIMIT more allowed
      const batch2 = Array.from({ length: LIMIT }, () =>
        limiter.check(keyId, LIMIT, SHORT_WINDOW),
      );
      const batch2Results = await Promise.all(batch2);
      const batch2Allowed = batch2Results.filter(r => r.allowed).length;

      const totalAllowed = batch1Allowed + batch2Allowed;

      // With SHORT_WINDOW=10: window 1 allows 100 + window 2 allows 100 = 200 total.
      // This proves that using window_secs=10 (instead of 60) in the DB tier is
      // the root cause of the observed "195 allowed in 11 seconds" anomaly.
      console.log(`Batch 1 allowed: ${batch1Allowed} | Batch 2 allowed: ${batch2Allowed} | Total: ${totalAllowed}`);
      expect(batch1Allowed).toBe(LIMIT);   // First window fully saturated
      expect(batch2Allowed).toBe(LIMIT);   // Second window also fully saturated (rotation!)
      expect(totalAllowed).toBeGreaterThan(LIMIT); // Total exceeds single-window limit
    },
    30_000,
  );
});
