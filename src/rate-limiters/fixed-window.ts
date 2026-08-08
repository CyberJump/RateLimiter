import type { Redis } from 'ioredis';
import type { RateLimiter } from './types.js';
import type { RateLimitResult } from '../types/index.js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getLuaScript(): string {
  const p1 = resolve(__dirname, 'lua', 'fixed-window.lua');
  if (existsSync(p1)) return readFileSync(p1, 'utf-8');
  const p2 = resolve(__dirname, '..', '..', 'src', 'rate-limiters', 'lua', 'fixed-window.lua');
  if (existsSync(p2)) return readFileSync(p2, 'utf-8');
  return '';
}

const luaScript = getLuaScript();

/**
 * Fixed Window Rate Limiter
 *
 * Divides time into fixed windows and counts requests per window.
 */
export class FixedWindowLimiter implements RateLimiter {
  constructor(private redis: Redis) {}

  async check(
    apiKeyId: string,
    limit: number,
    windowSecs: number,
  ): Promise<RateLimitResult> {
    const now = Math.floor(Date.now() / 1000);
    const windowNumber = Math.floor(now / windowSecs);
    const key = `ratelimit:fixed:${apiKeyId}:${windowNumber}`;

    let result: number[];
    if (typeof (this.redis as any).fixedWindowCheck === 'function') {
      result = await (this.redis as any).fixedWindowCheck(key, limit, windowSecs) as number[];
    } else {
      result = await this.redis.eval(luaScript, 1, key, limit, windowSecs) as number[];
    }

    const [allowed, remaining, ttl, currentCount] = result;

    return {
      allowed: allowed === 1,
      remaining,
      resetAt: now + ttl,
      currentCount,
    };
  }
}
