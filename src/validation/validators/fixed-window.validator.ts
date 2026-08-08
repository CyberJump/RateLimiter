import type { AlgorithmValidator, PolicyInfo, TrafficMetrics, ValidationResult } from '../types.js';

export class FixedWindowValidator implements AlgorithmValidator {
  validate(
    policy: PolicyInfo,
    traffic: TrafficMetrics,
    actualDurationSecs: number,
    algorithmState: Record<string, any>
  ): ValidationResult {
    const windowSecs = policy.windowSecs;
    const limit = policy.limit;

    // CORRECT SEMANTICS: Fixed Window is window-based, NOT rate-based.
    // The limit applies per discrete window period. A benchmark can span 1 or 2
    // window boundaries depending on timing. The max allowed is therefore:
    //   windowsCrossed × limit
    // NOT the rate-prorated (limit/windowSecs)*duration which gives absurd results
    // like nominalExpected=1 when limit=10 and the run lasted 5s of a 60s window.
    const windowsCrossed = Math.max(1, Math.ceil(actualDurationSecs / windowSecs));
    const maxBoundaryAllowed = windowsCrossed * limit;

    // The nominal expected is the max boundary allowed, capped to generated requests
    const nominalExpected = Math.min(traffic.generatedRequests, maxBoundaryAllowed);
    const expectedBlocked = Math.max(0, traffic.generatedRequests - nominalExpected);

    // Accuracy: how close allowed is to the window budget
    const deviation = Math.abs(traffic.allowedRequests - nominalExpected);
    let rawAccuracy = 100;
    if (nominalExpected > 0) {
      rawAccuracy = 100 * (1 - (deviation / nominalExpected));
    }
    const accuracy = Math.max(0, Math.min(100, Math.round(rawAccuracy * 10) / 10));

    let status: 'PASS' | 'WARN' | 'FAIL' = 'PASS';
    const diagnostics: string[] = [];

    // FAIL only if allowed exceeded the absolute theoretical maximum
    if (traffic.allowedRequests > maxBoundaryAllowed) {
      status = 'FAIL';
      diagnostics.push(`Fixed Window counter exceeded absolute boundary maximum of ${maxBoundaryAllowed} (${windowsCrossed} window(s) × ${limit} limit).`);
      diagnostics.push('Counter overflow or Redis INCR/EXPIRE non-atomicity detected.');
    } else if (accuracy < 80 && traffic.allowedRequests > 0) {
      status = 'WARN';
      diagnostics.push('Fixed Window counter is below expected budget. Possible TTL misconfiguration or premature expiry.');
    }

    // Boundary spike note: allowed slightly above (duration/windowSecs)*limit is NORMAL
    if (status === 'PASS' && traffic.allowedRequests === maxBoundaryAllowed && windowsCrossed > 1) {
      diagnostics.push('Boundary spike observed: requests crossed window reset boundary as designed (expected behavior).');
    }

    const reason = status === 'PASS'
      ? 'Fixed Window correctly enforced window capacity bounds.'
      : status === 'WARN'
      ? 'Fixed Window exhibited under-enforcement. Verify TTL and INCR atomicity.'
      : 'Fixed Window failed policy: counter exceeded max boundary limit.';

    return {
      status,
      accuracy,
      expectedBehavior: {
        maxAllowedRequests: nominalExpected,
        expectedBlockedRequests: expectedBlocked,
        description: `Fixed window: ${windowsCrossed} window(s) × limit ${limit} = max ${maxBoundaryAllowed} requests allowed. Run duration: ${actualDurationSecs.toFixed(2)}s, window size: ${windowSecs}s.`,
        algorithmDetails: {
          windowSize: `${windowSecs} seconds`,
          limit: `${limit} requests`,
          currentWindowCounter: algorithmState.counter ?? 'N/A',
          ttlRemaining: `${algorithmState.ttlRemainingSecs ?? 'N/A'}s`,
          windowNumber: algorithmState.windowNumber ?? 'N/A',
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
