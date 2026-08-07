import type { RateLimitResult } from '../types/index.js';

/** Interface that all rate-limiter strategies must implement */
export interface RateLimiter {
  /**
   * Check whether a request should be allowed for the given API key.
   *
   * @param apiKeyId  Unique identifier for the API key
   * @param limit     Maximum requests allowed per window
   * @param windowSecs  Window duration in seconds
   * @param burstCapacity  Maximum burst capacity (token bucket only)
   * @returns Rate limit result with allow/deny decision and metadata
   */
  check(
    apiKeyId: string,
    limit: number,
    windowSecs: number,
    burstCapacity?: number,
  ): Promise<RateLimitResult>;
}
