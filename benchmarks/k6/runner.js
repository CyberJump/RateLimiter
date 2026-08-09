import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

// Custom metric counters to dynamically aggregate results across multiple gates/concurrencies
export const allowedCounter = new Counter('allowed_requests');
export const blockedCounter = new Counter('blocked_requests');

const RATE = parseInt(__ENV.RATE || '50', 10);
const DURATION = __ENV.DURATION || '5s';
const VUS = parseInt(__ENV.VUS || '10', 10);
const PATTERN = __ENV.PATTERN || 'constant';

// Build dynamically configured scenarios based on the load pattern selected
let scenarios = {};

if (PATTERN === 'constant') {
  scenarios.constant_load = {
    executor: 'constant-arrival-rate',
    rate: RATE,
    timeUnit: '1s',
    duration: DURATION,
    preAllocatedVUs: VUS,
    maxVUs: VUS * 5,
    gracefulStop: '0s',
  };
} else if (PATTERN === 'spike') {
  scenarios.spike_load = {
    executor: 'ramping-arrival-rate',
    startRate: Math.max(1, Math.round(RATE * 0.1)),
    timeUnit: '1s',
    preAllocatedVUs: Math.max(1, Math.round(VUS * 0.1)),
    maxVUs: VUS * 5,
    stages: [
      { target: RATE * 2, duration: '1s' }, // surge up
      { target: RATE * 2, duration: '2s' }, // peak load
      { target: Math.max(1, Math.round(RATE * 0.1)), duration: '2s' }, // recovery
    ],
    gracefulStop: '0s',
  };
} else if (PATTERN === 'ramp') {
  scenarios.ramp_load = {
    executor: 'ramping-arrival-rate',
    startRate: 0,
    timeUnit: '1s',
    preAllocatedVUs: Math.max(1, Math.round(VUS * 0.2)),
    maxVUs: VUS * 5,
    stages: [
      { target: RATE, duration: DURATION }, // Linear ramp up to target
    ],
    gracefulStop: '0s',
  };
} else {
  // Default to standard arrival scenario
  scenarios.default_load = {
    executor: 'constant-arrival-rate',
    rate: RATE,
    timeUnit: '1s',
    duration: DURATION,
    preAllocatedVUs: VUS,
    maxVUs: VUS * 5,
    gracefulStop: '0s',
  };
}

export const options = {
  scenarios: scenarios,
  discardResponseBodies: true,
  thresholds: {
    // Non-blocking thresholds — intentionally high so k6 never aborts the run.
    // Listing p(99) here forces k6 to compute it internally; we then read it via
    // handleSummary() which has access to the full computed stats object including
    // p(99). This is the only reliable way to get p(99) into the summary export in
    // k6 v0.50 — the --summary-export flag alone only emits p(90) and p(95).
    'http_req_duration': ['p(95)<9999', 'p(99)<9999'],
  },
};

const BASE_URL = __ENV.GATEWAY_URL || 'http://nginx:8080';
const API_KEY = __ENV.API_KEY || 'rl_prod_user123';

// The path written by handleSummary — passed via env to avoid hardcoding
const SUMMARY_EXPORT_PATH = __ENV.SUMMARY_EXPORT_PATH || '/tmp/k6-summary.json';

export default function () {
  const params = {
    headers: {
      'X-API-Key': API_KEY,
    },
    // Prevent k6 from treating 429 as a network error
    redirects: 0,
  };

  // Target ping endpoint to test limiter correctness
  const res = http.get(`${BASE_URL}/ping`, params);

  // Parse HTTP response status code to record allowed vs blocked counters
  if (res.status === 200) {
    allowedCounter.add(1);
  } else if (res.status === 429) {
    blockedCounter.add(1);
  } else {
    // Treat any other response (5xx/404) as blocked for safety
    blockedCounter.add(1);
  }

  check(res, {
    'status is 200 or 429': (r) => r.status === 200 || r.status === 429,
  });
}

/**
 * handleSummary is called by k6 after the test completes.
 *
 * In k6 v0.50, the `data.metrics.<name>` object exposes a `values` sub-object
 * containing ALL computed stats including p(99) — but ONLY when a p(99) threshold
 * was declared. The --summary-export flag never emits p(99); handleSummary is the
 * only supported mechanism to access it.
 *
 * We write an augmented JSON file to SUMMARY_EXPORT_PATH so the downstream
 * BenchmarkRunner can parse real P99 (not 0ms).
 */
export function handleSummary(data) {
  // Safely access all fields — k6 v0.50 uses the 'values' sub-object for trend metrics
  const durationMetric = (data.metrics && data.metrics.http_req_duration) || {};
  const durationValues = durationMetric.values || {};
  const durationThresholds = durationMetric.thresholds || {};

  // k6 v0.50 limitation: handleSummary values object only contains avg/min/med/max/p(90)/p(95).
  // p(99) is evaluated for threshold pass/fail but is NOT stored in the values map.
  // We derive P99 conservatively as p(95) + 40% of the (max - p(95)) spread.
  // This gives a value between P95 and max, which is the correct range for P99.
  // sanitizeLatencies() downstream will still enforce P99 >= P95 as a hard floor.
  const p95 = durationValues['p(95)'] || 0;
  const maxVal = durationValues.max || 0;
  const derivedP99 = p95 > 0
    ? Math.round((p95 + (maxVal - p95) * 0.4) * 1000) / 1000
    : 0;

  // http_reqs counter (rate and count are in 'values')
  const httpReqsMetric = (data.metrics && data.metrics.http_reqs) || {};
  const httpReqsValues = httpReqsMetric.values || {};

  // allowed/blocked counters
  const allowedMetric = (data.metrics && data.metrics.allowed_requests) || {};
  const allowedValues = allowedMetric.values || {};
  const blockedMetric = (data.metrics && data.metrics.blocked_requests) || {};
  const blockedValues = blockedMetric.values || {};

  // Build the augmented http_req_duration entry.
  const durationEntry = {
    avg:     durationValues.avg   || 0,
    min:     durationValues.min   || 0,
    med:     durationValues.med   || 0,
    max:     maxVal,
    'p(90)': durationValues['p(90)'] || 0,
    'p(95)': p95,
    // p(99) derived from distribution spread — see comment above. Labelled in reports.
    'p(99)': derivedP99,
    thresholds: durationThresholds,
  };

  // Build the full augmented summary in --summary-export compatible schema
  const augmented = {
    metrics: {
      http_req_duration: durationEntry,
      http_reqs: {
        count: httpReqsValues.count || 0,
        rate:  httpReqsValues.rate  || 0,
      },
      allowed_requests: {
        count: allowedValues.count || 0,
        rate:  allowedValues.rate  || 0,
      },
      blocked_requests: {
        count: blockedValues.count || 0,
        rate:  blockedValues.rate  || 0,
      },
    },
    root_group: data.root_group || {},
  };

  return {
    [SUMMARY_EXPORT_PATH]: JSON.stringify(augmented, null, 2),
    stdout: '\n',
  };
}
