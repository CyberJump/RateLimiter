import type { AlgorithmValidator, PolicyInfo, TrafficMetrics, ValidationResult } from '../types.js';

export class TokenBucketValidator implements AlgorithmValidator {
  validate(
    policy: PolicyInfo,
    traffic: TrafficMetrics,
    actualDurationSecs: number,
    algorithmState: Record<string, any>
  ): ValidationResult {
    const refillRate = policy.limit / policy.windowSecs; // tokens/sec
    const burst = policy.burstCapacity ?? policy.limit;
    
    // Max allowed = initial burst + tokens refilled over elapsed time
    const maxAllowedRequests = Math.min(
      traffic.generatedRequests,
      Math.floor(burst + refillRate * actualDurationSecs)
    );

    const expectedBlocked = Math.max(0, traffic.generatedRequests - maxAllowedRequests);
    const deviation = Math.abs(traffic.allowedRequests - maxAllowedRequests);

    let rawAccuracy = 100;
    if (maxAllowedRequests > 0) {
      rawAccuracy = 100 * (1 - (deviation / maxAllowedRequests));
    }
    const accuracy = Math.max(0, Math.min(100, Math.round(rawAccuracy * 10) / 10));

    let status: 'PASS' | 'WARN' | 'FAIL' = 'PASS';
    const diagnostics: string[] = [];

    if (traffic.allowedRequests > maxAllowedRequests + 2) {
      status = 'FAIL';
      diagnostics.push('Limiter allowed more requests than burst capacity + token refills permit.');
      diagnostics.push('Possible Token Bucket refill calculation error or Redis HSET race condition.');
    } else if (accuracy < 85) {
      status = 'WARN';
      diagnostics.push('Minor token refill timing variance detected across execution boundary.');
    }

    const reason = status === 'PASS'
      ? 'Token Bucket correctly enforced continuous token refill and burst limits.'
      : status === 'WARN'
      ? 'Token Bucket exhibited slight timing variance in token generation.'
      : 'Token Bucket failed to enforce policy: tokens were allowed beyond burst capacity.';

    return {
      status,
      accuracy,
      expectedBehavior: {
        maxAllowedRequests,
        expectedBlockedRequests: expectedBlocked,
        description: `Continuous token model: Allowed up to initial burst (${burst}) + refill (${refillRate.toFixed(1)}/s * ${actualDurationSecs.toFixed(2)}s).`,
        algorithmDetails: {
          refillRate: `${refillRate.toFixed(1)} tokens/sec`,
          burstCapacity: `${burst} tokens`,
          tokensRemaining: algorithmState.tokensRemaining ?? 'N/A',
          starvationEvents: algorithmState.starvationEvents ?? traffic.blockedRequests,
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
