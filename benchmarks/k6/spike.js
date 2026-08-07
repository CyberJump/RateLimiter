import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 10 },   // Low baseline
    { duration: '5s', target: 200 },   // Extreme sudden spike to 200 VUs!
    { duration: '30s', target: 200 },  // Hold peak burst load
    { duration: '5s', target: 10 },    // Drop back down
    { duration: '10s', target: 0 },
  ],
};

const BASE_URL = __ENV.GATEWAY_URL || 'http://localhost:8080';
const API_KEY = __ENV.API_KEY || 'rl_live_testkey';

export default function () {
  const res = http.get(`${BASE_URL}/api/heavy`, {
    headers: {
      'X-API-Key': API_KEY,
    },
  });

  check(res, {
    'status 200 or 429': (r) => r.status === 200 || r.status === 429,
  });

  // Zero sleep during burst to maximize concurrent load
}
