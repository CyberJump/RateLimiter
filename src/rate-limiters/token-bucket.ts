import type { Redis } from 'ioredis';
import type { RateLimiter } from './types.js';
import type { RateLimitResult } from '../types/index.js';

/**
 * Token Bucket Rate Limiter
 *
 * Maintains a bucket of tokens that refills at a steady rate.
 * Allows controlled bursts up to the burst capacity while enforcing
 * a sustained rate limit over the window. Best for APIs that want to
 * allow occasional bursts without the fixed window boundary problem.
 */
export class TokenBucketLimiter implements RateLimiter {
  constructor(private redis: Redis) {}

  async check(
    apiKeyId: string,
    limit: number,
    windowSecs: number,
    burstCapacity?: number,
  ): Promise<RateLimitResult> {
    const key = `ratelimit:bucket:${apiKeyId}`;
    const burst = burstCapacity ?? limit; // Default burst = limit if not specified

    // Use Redis server time to avoid clock skew across gateway nodes
    const timeResult = await this.redis.time() as unknown as [string, string];
    const nowMs = parseInt(timeResult[0], 10) * 1000 + Math.floor(parseInt(timeResult[1], 10) / 1000);

    const result = await (this.redis as any).tokenBucketCheck(
      key,
      limit,
      windowSecs,
      burst,
      nowMs,
    ) as number[];

    const [allowed, remaining, nextTokenMs, consumed] = result;

    return {
      allowed: allowed === 1,
      remaining,
      resetAt: Math.ceil((Date.now() + nextTokenMs) / 1000), // When next token available
      currentCount: consumed,
    };
  }
}
