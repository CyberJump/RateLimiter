import type { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import type { RateLimiter } from './types.js';
import type { RateLimitResult } from '../types/index.js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getLuaScript(): string {
  const p1 = resolve(__dirname, 'lua', 'sliding-window.lua');
  if (existsSync(p1)) return readFileSync(p1, 'utf-8');
  const p2 = resolve(__dirname, '..', '..', 'src', 'rate-limiters', 'lua', 'sliding-window.lua');
  if (existsSync(p2)) return readFileSync(p2, 'utf-8');
  return '';
}

const luaScript = getLuaScript();

/**
 * Sliding Window Log Rate Limiter
 *
 * Stores each request timestamp in a Redis Sorted Set (ZSET).
 */
export class SlidingWindowLimiter implements RateLimiter {
  constructor(private redis: Redis) {}

  async check(
    apiKeyId: string,
    limit: number,
    windowSecs: number,
  ): Promise<RateLimitResult> {
    const key = `ratelimit:sliding:${apiKeyId}`;

    const timeResult = await this.redis.time() as unknown as [string, string];
    const nowMs = parseInt(timeResult[0], 10) * 1000 + Math.floor(parseInt(timeResult[1], 10) / 1000);

    const requestId = `${nowMs}:${randomUUID()}`;

    let result: number[];
    if (typeof (this.redis as any).slidingWindowCheck === 'function') {
      result = await (this.redis as any).slidingWindowCheck(
        key,
        limit,
        windowSecs * 1000,
        nowMs,
        requestId,
      ) as number[];
    } else {
      result = await this.redis.eval(
        luaScript,
        1,
        key,
        limit,
        windowSecs * 1000,
        nowMs,
        requestId,
      ) as number[];
    }

    const [allowed, remaining, resetMs, currentCount] = result;

    return {
      allowed: allowed === 1,
      remaining,
      resetAt: Math.ceil(resetMs / 1000),
      currentCount,
    };
  }
}
