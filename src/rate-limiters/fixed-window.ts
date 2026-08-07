import type { Redis } from 'ioredis';
import type { RateLimiter } from './types.js';
import type { RateLimitResult } from '../types/index.js';

/**
 * Fixed Window Rate Limiter
 *
 * Divides time into fixed windows and counts requests per window.
 * Simple and efficient, but susceptible to the boundary-burst problem:
 * a client can make 2x the limit by timing requests at a window boundary.
 */
export class FixedWindowLimiter implements RateLimiter {
  constructor(private redis: Redis) {}

  async check(
    apiKeyId: string,
    limit: number,
    windowSecs: number,
  ): Promise<RateLimitResult> {
    // Window number aligns all requests to the same fixed window
    const now = Math.floor(Date.now() / 1000);
    const windowNumber = Math.floor(now / windowSecs);
    const key = `ratelimit:fixed:${apiKeyId}:${windowNumber}`;

    // Execute atomic Lua script via custom command
    const result = await (this.redis as any).fixedWindowCheck(
      key,
      limit,
      windowSecs,
    ) as number[];

    const [allowed, remaining, ttl, currentCount] = result;

    return {
      allowed: allowed === 1,
      remaining,
      resetAt: now + ttl,
      currentCount,
    };
  }
}
