import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 50 },  // Ramp to 50 VUs
    { duration: '5m', target: 50 },   // Sustained soak for 5 minutes
    { duration: '30s', target: 0 },   // Ramp down
  ],
};

const BASE_URL = __ENV.GATEWAY_URL || 'http://localhost:8080';
const API_KEY = __ENV.API_KEY || 'rl_live_testkey';

export default function () {
  const res = http.get(`${BASE_URL}/api/soak`, {
    headers: {
      'X-API-Key': API_KEY,
    },
  });

  check(res, {
    'status valid': (r) => r.status === 200 || r.status === 429,
  });

  sleep(0.1);
}
