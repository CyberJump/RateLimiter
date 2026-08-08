import type { AlgorithmValidator, PolicyInfo, TrafficMetrics, ValidationResult } from '../types.js';

export class SlidingWindowValidator implements AlgorithmValidator {
  validate(
    policy: PolicyInfo,
    traffic: TrafficMetrics,
    actualDurationSecs: number,
    algorithmState: Record<string, any>
  ): ValidationResult {
    const windowSecs = policy.windowSecs;
    const limit = policy.limit;

    // CORRECT SEMANTICS: Sliding Window is window-based, NOT rate-based.
    // The full `limit` is available within any single rolling window.
    // A benchmark shorter than the window duration can legitimately consume
    // the entire limit — the counter only resets when timestamps age out.
    // We do NOT prorate by (duration / windowSecs); that produces nonsense
    // like expectedMax=6 when limit=100 and the run lasted 3s of a 60s window.
    const maxAllowedRequests = Math.min(traffic.generatedRequests, limit);
    const expectedBlocked = Math.max(0, traffic.generatedRequests - maxAllowedRequests);

    // Accuracy: how close the actual allowed count is to the theoretical max
    const deviation = Math.abs(traffic.allowedRequests - maxAllowedRequests);
    let rawAccuracy = 100;
    if (maxAllowedRequests > 0) {
      rawAccuracy = 100 * (1 - (deviation / maxAllowedRequests));
    }
    const accuracy = Math.max(0, Math.min(100, Math.round(rawAccuracy * 10) / 10));

    let status: 'PASS' | 'WARN' | 'FAIL' = 'PASS';
    const diagnostics: string[] = [];

    // FAIL only when the limiter allowed MORE than its configured limit (impossible without a bug)
    if (traffic.allowedRequests > limit) {
      status = 'FAIL';
      diagnostics.push(`Sliding Window allowed ${traffic.allowedRequests} requests but limit is ${limit} per ${windowSecs}s window.`);
      diagnostics.push('ZSET ZREMRANGEBYSCORE eviction failed, or ZADD/ZCARD race condition detected.');
    } else if (accuracy < 90 && traffic.generatedRequests >= limit) {
      // Only warn if the load was high enough that under-enforcement is meaningful
      status = 'WARN';
      diagnostics.push('Sliding Window allowed fewer requests than the window budget permits. Possible clock skew or early eviction.');
    }

    const reason = status === 'PASS'
      ? 'Sliding Window correctly enforced exact rolling log policy.'
      : status === 'WARN'
      ? 'Sliding Window log displayed minor timestamp variance.'
      : 'Sliding Window failed policy: rolling count exceeded limit.';

    return {
      status,
      accuracy,
      expectedBehavior: {
        maxAllowedRequests,
        expectedBlockedRequests: expectedBlocked,
        description: `Sliding window: full budget of ${limit} req available in any ${windowSecs}s rolling window. Run duration ${actualDurationSecs.toFixed(2)}s. Expected up to ${maxAllowedRequests} req to be allowed.`,
        algorithmDetails: {
          rollingWindow: `${windowSecs} seconds`,
          limit: `${limit} requests`,
          rollingCount: algorithmState.rollingCount ?? 'N/A',
          windowUtilization: `${algorithmState.windowUtilizationPercent ?? 'N/A'}%`,
        },
      },
      actualBehavior: {
        allowed: traffic.allowedRequests,
        blocked: traffic.blockedRequests,
        generated: traffic.generatedRequests,
        actualRps: traffic.generatedRps,
      },
      reason,
      diagnostics,
    };
  }
}
