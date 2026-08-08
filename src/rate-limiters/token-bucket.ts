import type { Redis } from 'ioredis';
import type { RateLimiter } from './types.js';
import type { RateLimitResult } from '../types/index.js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getLuaScript(): string {
  const p1 = resolve(__dirname, 'lua', 'token-bucket.lua');
  if (existsSync(p1)) return readFileSync(p1, 'utf-8');
  const p2 = resolve(__dirname, '..', '..', 'src', 'rate-limiters', 'lua', 'token-bucket.lua');
  if (existsSync(p2)) return readFileSync(p2, 'utf-8');
  return '';
}

const luaScript = getLuaScript();

/**
 * Token Bucket Rate Limiter
 *
 * Maintains a bucket of tokens that refills at a steady rate.
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
    const burst = burstCapacity ?? limit;

    const timeResult = await this.redis.time() as unknown as [string, string];
    const nowMs = parseInt(timeResult[0], 10) * 1000 + Math.floor(parseInt(timeResult[1], 10) / 1000);

    let result: number[];
    if (typeof (this.redis as any).tokenBucketCheck === 'function') {
      result = await (this.redis as any).tokenBucketCheck(
        key,
        limit,
        windowSecs,
        burst,
        nowMs,
      ) as number[];
    } else {
      result = await this.redis.eval(
        luaScript,
        1,
        key,
        limit,
        windowSecs,
        burst,
        nowMs,
      ) as number[];
    }

    const [allowed, remaining, nextTokenMs, consumed] = result;

    return {
      allowed: allowed === 1,
      remaining,
      resetAt: Math.ceil((Date.now() + nextTokenMs) / 1000),
      currentCount: consumed,
    };
  }
}
