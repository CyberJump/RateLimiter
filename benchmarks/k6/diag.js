import http from 'k6/http';
import { check } from 'k6';

export const options = {
  scenarios: {
    short_test: {
      executor: 'constant-arrival-rate',
      rate: 20,
      timeUnit: '1s',
      duration: '3s',
      preAllocatedVUs: 3,
      maxVUs: 10,
      gracefulStop: '0s',
    },
  },
  discardResponseBodies: true,
  thresholds: {
    'http_req_duration': ['p(95)<9999', 'p(99)<9999'],
  },
};

const BASE_URL = __ENV.GATEWAY_URL || 'http://nginx:8080';

export default function () {
  const res = http.get(`${BASE_URL}/ping`, {
    headers: { 'X-API-Key': 'rl_prod_user123' },
    redirects: 0,
  });
  check(res, { 'ok': (r) => r.status === 200 || r.status === 429 });
}

export function handleSummary(data) {
  const d = data.metrics.http_req_duration;
  // Dump the exact structure so we know which keys are present
  const dump = JSON.stringify({
    type: d.type,
    valueKeys: d.values ? Object.keys(d.values) : null,
    values: d.values,
    thresholdKeys: d.thresholds ? Object.keys(d.thresholds) : null,
    // Also try direct access on d itself (legacy format)
    directKeys: Object.keys(d),
  }, null, 2);

  return {
    '/tmp/k6-diag.json': dump,
    stdout: '\nDone.\n',
  };
}
