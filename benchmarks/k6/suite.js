import http from 'k6/http';
import { check } from 'k6';

export const options = {
  scenarios: {
    constant_traffic: {
      executor: 'constant-arrival-rate',
      rate: 100,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 20,
      maxVUs: 100,
      target: 'http://localhost:3000/api/resource',
    },
    spike_traffic: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 10,
      maxVUs: 200,
      stages: [
        { target: 10, duration: '10s' },
        { target: 500, duration: '5s' },
        { target: 10, duration: '10s' },
      ],
      startTime: '35s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<50', 'p(99)<100'],
  },
};

export default function () {
  const headers = {
    'X-API-Key': 'rl_prod_user123',
    'Content-Type': 'application/json',
  };

  const res = http.get('http://localhost:3000/api/resource', { headers });

  check(res, {
    'status is 200 or 429': (r) => r.status === 200 || r.status === 429,
  });
}
