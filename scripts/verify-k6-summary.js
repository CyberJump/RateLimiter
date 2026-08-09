const fs = require('fs');
// Run a quick k6 test, read the summary, and print metric keys
const summary = JSON.parse(fs.readFileSync('/tmp/k6-verify.json', 'utf8'));
const d = summary.metrics && summary.metrics.http_req_duration || {};
const r = summary.metrics && summary.metrics.http_reqs || {};

const result = {
  latency_keys: Object.keys(d).filter(k => k !== 'thresholds'),
  avg: d.avg,
  med: d.med,
  'p(90)': d['p(90)'],
  'p(95)': d['p(95)'],
  'p(99)': d['p(99)'],
  max: d.max,
  http_reqs_rate: r.rate,
  http_reqs_count: r.count,
};

console.log(JSON.stringify(result, null, 2));
