import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 5,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.5'], // Fail rate threshold
    http_req_duration: ['p(95)<500'], // 95% of requests under 500ms
  },
};

const BASE_URL = __ENV.GATEWAY_URL || 'http://localhost:8080';
const API_KEY = __ENV.API_KEY || 'rl_live_testkey';

export default function () {
  const res = http.get(`${BASE_URL}/ping`, {
    headers: {
      'X-API-Key': API_KEY,
    },
  });

  check(res, {
    'status is 200 or 429': (r) => r.status === 200 || r.status === 429,
    'has rate limit headers': (r) => r.headers['X-Ratelimit-Limit'] !== undefined,
  });

  sleep(0.1);
}
