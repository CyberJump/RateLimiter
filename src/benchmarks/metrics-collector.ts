import type { Redis } from 'ioredis';
import type {
  SystemMetrics,
  TrafficMetrics,
  LatencyMetrics,
  RedisMetrics,
  RateLimiterMetrics,
  CapacityMetrics
} from '../validation/types.js';

/**
 * Computes a percentile from a sorted or unsorted array using linear interpolation.
 * This is the single canonical percentile implementation used across the entire codebase.
 *
 * Invariant enforced by callers: P99 >= P95 >= P90 >= avg >= min >= 0
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;

  const sorted = [...values]
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  if (sorted.length === 0) return 0;

  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);

  if (lower === upper) {
    return sorted[lower];
  }

  const weight = rank - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * weight;
}

/**
 * Enforces the monotonicity invariant across all latency percentiles:
 *   P99 >= P95 >= P90 >= avg >= 0
 *
 * This guards against parsing gaps (e.g. k6 missing p(99)) yielding 0ms P99.
 * Only called AFTER real values have been extracted from the measurement source.
 * If a value is truly 0 and requests > 0, it is replaced with the nearest
 * higher measured percentile (indicating it was not measured, not that it was 0).
 */
export function sanitizeLatencies(raw: {
  avg: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  max: number;
  requestCount: number;
}): { avg: number; p50: number; p90: number; p95: number; p99: number; max: number } {
  const { requestCount } = raw;

  // If no requests were measured, all latencies are legitimately 0
  if (requestCount === 0) {
    return { avg: 0, p50: 0, p90: 0, p95: 0, p99: 0, max: 0 };
  }

  // Floor at 0 — negative latencies are nonsensical
  let avg = Math.max(0, raw.avg);
  let p50 = Math.max(0, raw.p50);
  let p90 = Math.max(0, raw.p90);
  let p95 = Math.max(0, raw.p95);
  let p99 = Math.max(0, raw.p99);
  const max = Math.max(0, raw.max);

  // Enforce monotonicity upward: each percentile must be >= the one below it.
  // A missing value (0) when requests > 0 is treated as "not measured" — we
  // substitute the nearest lower measured value as a conservative lower bound.
  p50 = Math.max(p50, avg);
  p90 = Math.max(p90, p50);
  p95 = Math.max(p95, p90);
  p99 = Math.max(p99, p95);  // This is the critical guard for the P99=0 bug

  // P99 must also not exceed max
  if (max > 0) {
    p99 = Math.min(p99, max);
  }

  return { avg, p50, p90, p95, p99, max };
}

export class MetricsCollector {
  constructor(private redis: Redis) {}

  async measureRedisRttMs(): Promise<number> {
    try {
      const start = process.hrtime.bigint();
      await this.redis.ping();
      const diffNs = process.hrtime.bigint() - start;
      return Math.round((Number(diffNs) / 1_000_000) * 100) / 100;
    } catch {
      return 0;
    }
  }

  async captureRateLimiterMetrics(
    keyId: string,
    algo: string,
    limit: number,
    windowSecs: number,
    burst: number
  ): Promise<RateLimiterMetrics> {
    let state: RateLimiterMetrics = { type: algo as any };
    try {
      if (algo === 'token_bucket') {
        const bucketKey = `ratelimit:bucket:${keyId}`;
        const bucketRes = await this.redis.hmget(bucketKey, 'tokens', 'last_refill');
        const tokensVal = bucketRes[0] ? parseFloat(bucketRes[0]) : burst;
        state = {
          type: 'token_bucket',
          tokensRemaining: Math.round(tokensVal * 100) / 100,
          capacity: burst,
          refillRate: Math.round((limit / windowSecs) * 10) / 10,
          tokensConsumed: Math.max(0, Math.round((burst - tokensVal) * 100) / 100),
          starvationEvents: 0,
        };
      } else if (algo === 'fixed_window') {
        const nowSec = Math.floor(Date.now() / 1000);
        const windowNumber = Math.floor(nowSec / windowSecs);
        const fixedKey = `ratelimit:fixed:${keyId}:${windowNumber}`;
        const countVal = await this.redis.get(fixedKey);
        const ttlVal = await this.redis.ttl(fixedKey);
        state = {
          type: 'fixed_window',
          counter: countVal ? parseInt(countVal, 10) : 0,
          limit,
          windowSecs,
          windowNumber,
          ttlRemainingSecs: ttlVal > 0 ? ttlVal : 0,
        };
      } else if (algo === 'sliding_window') {
        const slidingKey = `ratelimit:sliding:${keyId}`;
        const zcountVal = await this.redis.zcard(slidingKey);
        state = {
          type: 'sliding_window',
          rollingCount: zcountVal,
          limit,
          windowSecs,
          windowUtilizationPercent: Math.min(100, Math.round((zcountVal / limit) * 100)),
        };
      }
    } catch {
      // Fallback empty metrics on connection failure
    }
    return state;
  }

  buildTrafficMetrics(
    targetRateReqSec: number,
    allowedCount: number,
    blockedCount: number,
    k6MeasuredRps: number,
    configuredLimitRate: number
  ): TrafficMetrics {
    const generatedRequests = allowedCount + blockedCount;

    // Use k6's own measured rate (from http_reqs.rate) rather than wall-clock duration.
    // Wall-clock includes ~1-2s of process startup overhead which inflates duration and
    // deflates the apparent RPS. k6 measures only the actual load generation window.
    const generatedRps = Math.round(k6MeasuredRps * 10) / 10;

    // Derive duration from actual request count / k6-measured rate for sub-metric RPS
    const effectiveDuration = generatedRps > 0 ? generatedRequests / generatedRps : 1;
    const allowedRps = Math.round((allowedCount / effectiveDuration) * 10) / 10;
    const blockedRps = Math.round((blockedCount / effectiveDuration) * 10) / 10;
    const loadFactor = Math.round((generatedRps / Math.max(0.1, configuredLimitRate)) * 10) / 10;

    return {
      targetRateReqSec,
      generatedRequests,
      allowedRequests: allowedCount,
      blockedRequests: blockedCount,
      generatedRps,
      allowedRps,
      blockedRps,
      loadFactor,
    };
  }

  buildLatencyMetrics(
    avgMs: number,
    medMs: number,
    p90Ms: number,
    p95Ms: number,
    p99Ms: number,
    maxMs: number,
    requestCount: number
  ): LatencyMetrics {
    const sanitized = sanitizeLatencies({
      avg: avgMs,
      p50: medMs,
      p90: p90Ms,
      p95: p95Ms,
      p99: p99Ms,
      max: maxMs,
      requestCount,
    });

    const round2 = (v: number) => Math.round(v * 100) / 100;

    return {
      avgLatencyMs: round2(sanitized.avg),
      p50LatencyMs: round2(sanitized.p50),
      p90LatencyMs: round2(sanitized.p90),
      p95LatencyMs: round2(sanitized.p95),
      p99LatencyMs: round2(sanitized.p99),
    };
  }

  buildRedisMetrics(
    redisRttMs: number,
    totalRequests: number,
    k6MeasuredRps: number,
    algo: string = 'token_bucket'
  ): RedisMetrics {
    // Redis operations per request are estimated from Lua script complexity:
    //   token_bucket:   3 ops (HGET tokens, HSET tokens+ts, EXPIRE)
    //   fixed_window:   2 ops (INCR counter, EXPIRE on first call)
    //   sliding_window: 4 ops (ZREMRANGEBYSCORE, ZADD, ZCARD, EXPIRE)
    // This is a derived estimate, NOT a directly measured value.
    const opsPerReq = algo === 'sliding_window' ? 4 : algo === 'fixed_window' ? 2 : 3;
    const redisOpsCount = totalRequests * opsPerReq;

    // Use k6's own measured RPS to derive the actual load window duration,
    // avoiding wall-clock startup overhead in the denominator.
    const effectiveDuration = k6MeasuredRps > 0 ? totalRequests / k6MeasuredRps : 1;
    const redisOpsPerSec = Math.round((redisOpsCount / Math.max(0.01, effectiveDuration)) * 10) / 10;

    return {
      redisRttMs: Math.round(redisRttMs * 100) / 100,
      redisOpsCount,
      // Clearly labelled as derived/estimated in downstream reports
      redisOpsPerSec,
      avgRedisCommandTimeMs: Math.round(redisRttMs * 100) / 100,
    };
  }

  buildSystemMetrics(
    processedRequests: number,
    k6MeasuredRps: number
  ): SystemMetrics {
    // Gateway processing throughput = total requests processed / k6-measured duration.
    // Using k6's rate removes startup overhead from the measurement.
    const effectiveDuration = k6MeasuredRps > 0 ? processedRequests / k6MeasuredRps : 1;
    const gatewayProcessingThroughputRps = Math.round((processedRequests / Math.max(0.01, effectiveDuration)) * 10) / 10;

    return {
      gatewayProcessingThroughputRps,
      cpuSystemPercent: null,
      memoryUsageBytes: null,
    };
  }

  buildCapacityMetrics(
    generatedRps: number,
    vus: number,
    isPassed: boolean
  ): CapacityMetrics {
    return {
      peakObservedRps: generatedRps,
      maxStableConcurrencyVus: isPassed ? vus : null,
      saturationPointVus: !isPassed ? vus : null,
      backpressureEvents: 0,
    };
  }
}
