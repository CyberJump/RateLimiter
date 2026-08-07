import type { Redis } from 'ioredis';
import type { Algorithm } from '../types/index.js';
import type { RateLimiter } from './types.js';
import { FixedWindowLimiter } from './fixed-window.js';
import { SlidingWindowLimiter } from './sliding-window.js';
import { TokenBucketLimiter } from './token-bucket.js';

/** Cache limiter instances per algorithm to avoid re-instantiation */
const cache = new Map<string, RateLimiter>();

/**
 * Factory that returns the correct RateLimiter implementation
 * based on the algorithm configured for a tier.
 */
export function getRateLimiter(algorithm: Algorithm, redis: Redis): RateLimiter {
  const cached = cache.get(algorithm);
  if (cached) return cached;

  let limiter: RateLimiter;

  switch (algorithm) {
    case 'fixed_window':
      limiter = new FixedWindowLimiter(redis);
      break;
    case 'sliding_window':
      limiter = new SlidingWindowLimiter(redis);
      break;
    case 'token_bucket':
      limiter = new TokenBucketLimiter(redis);
      break;
    default:
      throw new Error(`Unknown rate limiting algorithm: ${algorithm}`);
  }

  cache.set(algorithm, limiter);
  return limiter;
}
