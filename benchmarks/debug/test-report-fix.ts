import { ReportGenerator } from '../../src/benchmarks/report-generator.js';
import type { DetailedBenchmarkResult } from '../../src/benchmarks/types.js';

const reportGen = new ReportGenerator();

// Scenario 1: Token Bucket Smoke Test
const result1: DetailedBenchmarkResult = {
  timestamp: new Date().toISOString(),
  scenario: {
    name: 'Token Bucket — Smoke Test',
    algorithm: 'token_bucket',
    targetRate: 50,
    durationSecs: 3,
    vus: 5,
    pattern: 'constant',
  },
  policy: {
    algorithm: 'token_bucket',
    limit: 100,
    windowSecs: 60,
    burstCapacity: 100,
    source: 'Tier Policy',
    tierName: 'ENTERPRISE',
  },
  trafficMetrics: {
    targetRateReqSec: 50,
    generatedRequests: 150,
    allowedRequests: 104,
    blockedRequests: 46,
    generatedRps: 50,
    allowedRps: 34.6,
    blockedRps: 15.4,
    loadFactor: 0.5,
  },
  latencyMetrics: {
    avgLatencyMs: 4.42,
    p50LatencyMs: 4.42,
    p90LatencyMs: 6.06,
    p95LatencyMs: 6.69,
    p99LatencyMs: 19.77,
  },
  redisMetrics: {
    redisRttMs: 0.4,
    redisOpsCount: 150,
    redisOpsPerSec: 150,
    avgRedisCommandTimeMs: 0.1,
  },
  systemMetrics: {
    gatewayProcessingThroughputRps: 50,
    cpuSystemPercent: null,
    memoryUsageBytes: null,
  },
  rateLimiterMetrics: { type: 'token_bucket' },
  validationMetrics: {
    status: 'PASS',
    accuracy: 99,
    reason: 'Token Bucket correctly enforced bounds.',
    expectedBehavior: {
      maxAllowedRequests: 104,
      expectedBlockedRequests: 46,
      description: 'Continuous refill model.',
      algorithmDetails: { refillRate: '1.7 tokens/sec', burstCapacity: '100 tokens' }
    },
    actualBehavior: {
      allowed: 104,
      blocked: 46,
      generated: 150,
      actualRps: 50,
    },
    diagnostics: [],
  },
  capacityMetrics: {
    peakObservedRps: 50,
    maxStableConcurrencyVus: 5,
    saturationPointVus: null,
    backpressureEvents: 0,
  },
  metricsConsistent: true,
  totalElapsedMs: 3000,
  coldStartLatencyMs: 12.5,
  traffic: {} as any,
  system: {} as any,
  algorithmState: {},
  validation: {} as any,
};

// Scenario 2: Fixed Window Spike Test
const result2: DetailedBenchmarkResult = {
  timestamp: new Date().toISOString(),
  scenario: {
    name: 'Fixed Window — Spike Handling',
    algorithm: 'fixed_window',
    targetRate: 300,
    durationSecs: 5,
    vus: 20,
    pattern: 'spike',
  },
  policy: {
    algorithm: 'fixed_window',
    limit: 100,
    windowSecs: 60,
    burstCapacity: 100,
    source: 'Tier Policy',
    tierName: 'ENTERPRISE',
  },
  trafficMetrics: {
    targetRateReqSec: 300,
    generatedRequests: 2143,
    allowedRequests: 100,
    blockedRequests: 2043,
    generatedRps: 428.5,
    allowedRps: 20,
    blockedRps: 408.5,
    loadFactor: 4.28,
  },
  latencyMetrics: {
    avgLatencyMs: 0.96,
    p50LatencyMs: 0.96,
    p90LatencyMs: 1.44,
    p95LatencyMs: 2.1,
    p99LatencyMs: 4.15,
  },
  redisMetrics: {
    redisRttMs: 0.64,
    redisOpsCount: 2143,
    redisOpsPerSec: 667.8,
    avgRedisCommandTimeMs: 0.1,
  },
  systemMetrics: {
    gatewayProcessingThroughputRps: 428.5,
    cpuSystemPercent: null,
    memoryUsageBytes: null,
  },
  rateLimiterMetrics: { type: 'fixed_window' },
  validationMetrics: {
    status: 'PASS',
    accuracy: 100,
    reason: 'Fixed Window correctly enforced bounds.',
    expectedBehavior: {
      maxAllowedRequests: 100,
      expectedBlockedRequests: 2043,
      description: 'Window capacity model.',
      algorithmDetails: { limit: 100, windowSecs: 60 }
    },
    actualBehavior: {
      allowed: 100,
      blocked: 2043,
      generated: 2143,
      actualRps: 428.5,
    },
    diagnostics: [],
  },
  capacityMetrics: {
    peakObservedRps: 428.5,
    maxStableConcurrencyVus: 20,
    saturationPointVus: null,
    backpressureEvents: 0,
  },
  metricsConsistent: true,
  totalElapsedMs: 5000,
  coldStartLatencyMs: 3.2,
  traffic: {} as any,
  system: {} as any,
  algorithmState: {},
  validation: {} as any,
};

const report1 = reportGen.generateMarkdownReport(result1);
const report2 = reportGen.generateMarkdownReport(result2);

console.log('=== REPORT 1 (Token Bucket Smoke Test) PORTFOLIO SECTION ===');
console.log(report1.slice(report1.indexOf('## 5. Portfolio Metrics Highlights')));

console.log('\n=== REPORT 2 (Fixed Window Spike Test) PORTFOLIO SECTION ===');
console.log(report2.slice(report2.indexOf('## 5. Portfolio Metrics Highlights')));
