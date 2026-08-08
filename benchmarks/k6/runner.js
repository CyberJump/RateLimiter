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
  };
}

export const options = {
  scenarios: scenarios,
  discardResponseBodies: true,
  thresholds: {
    // Non-blocking thresholds to let validation proceed
    http_req_duration: ['p(95)<1000'],
  },
};

const BASE_URL = __ENV.GATEWAY_URL || 'http://nginx:8080';
const API_KEY = __ENV.API_KEY || 'rl_prod_user123';

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
