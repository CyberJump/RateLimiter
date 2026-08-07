import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 20 },  // Ramp up to 20 VUs
    { duration: '1m', target: 100 },  // Ramp up to 100 VUs
    { duration: '1m', target: 100 },  // Hold at 100 VUs
    { duration: '30s', target: 0 },   // Ramp down to 0
  ],
};

const BASE_URL = __ENV.GATEWAY_URL || 'http://localhost:8080';
const API_KEY = __ENV.API_KEY || 'rl_live_testkey';

export default function () {
  const res = http.get(`${BASE_URL}/api/resource`, {
    headers: {
      'X-API-Key': API_KEY,
    },
  });

  check(res, {
    'valid status': (r) => r.status === 200 || r.status === 429,
  });

  sleep(0.05);
}
