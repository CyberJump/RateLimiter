import type { PolicyInfo, TrafficMetrics, SystemMetrics, ValidationResult } from '../validation/types.js';

export interface ScenarioConfig {
  name: string;
  algorithm: 'token_bucket' | 'sliding_window' | 'fixed_window';
  targetRate: number;
  durationSecs: number;
  vus: number;
  pattern: 'constant' | 'spike' | 'bursty' | 'ramp' | 'soak' | 'horizontal_scale';
  tier?: string;
  apiKeyId?: string;
  gatewaysCount?: number;
}

export interface DetailedBenchmarkResult {
  id?: string;
  timestamp: string;
  scenario: ScenarioConfig;
  policy: PolicyInfo;
  traffic: TrafficMetrics;
  system: SystemMetrics;
  algorithmState: Record<string, any>;
  validation: ValidationResult;
  metricsConsistent: boolean;
  totalElapsedMs: number;
}

export interface ResumeMetrics {
  peakSustainedThroughputRps: number;
  maxConcurrentRequests: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  maxRedisThroughputRps: number;
  maxStableConcurrencyVus: number;
  largestBenchmarkTotalRequests: number;
  totalRequestsProcessed: number;
  algorithmValidationAccuracyPercent: number;
}

export interface AlgorithmComparison {
  algoA: string;
  algoB: string;
  throughputDeltaPercent: number;
  latencyDeltaPercent: number;
  redisOpsDeltaPercent: number;
  accuracyDeltaPercent: number;
  winner: string;
  summary: string;
}
