import type { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import type { RateLimiter } from './types.js';
import type { RateLimitResult } from '../types/index.js';

/**
 * Sliding Window Log Rate Limiter
 *
 * Tracks every request timestamp in a Redis sorted set.
 * Provides precise sliding window behavior with no boundary-burst problem.
 * Trade-off: higher Redis memory usage (one sorted set member per request).
 */
export class SlidingWindowLimiter implements RateLimiter {
  constructor(private redis: Redis) {}

  async check(
    apiKeyId: string,
    limit: number,
    windowSecs: number,
  ): Promise<RateLimitResult> {
    const key = `ratelimit:sliding:${apiKeyId}`;
    const windowMs = windowSecs * 1000;

    // Use Redis server time to avoid clock skew across gateway nodes
    const timeResult = await this.redis.time() as unknown as [string, string];
    const nowMs = parseInt(timeResult[0], 10) * 1000 + Math.floor(parseInt(timeResult[1], 10) / 1000);

    const requestId = `${nowMs}:${randomUUID()}`;

    const result = await (this.redis as any).slidingWindowCheck(
      key,
      limit,
      windowMs,
      nowMs,
      requestId,
    ) as number[];

    const [allowed, remaining, resetMs, currentCount] = result;

    return {
      allowed: allowed === 1,
      remaining,
      resetAt: Math.ceil(resetMs / 1000), // Convert ms to seconds
      currentCount,
    };
  }
}
