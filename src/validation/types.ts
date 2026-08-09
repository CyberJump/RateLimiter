import type { Algorithm } from '../types/index.js';

export interface PolicyInfo {
  algorithm: Algorithm;
  limit: number;
  windowSecs: number;
  burstCapacity?: number;
  source: 'Per-Key Override' | 'Tier Policy' | 'Global Default';
  tierName: string;
}

export interface TrafficMetrics {
  targetRateReqSec: number;
  generatedRequests: number;
  allowedRequests: number;
  blockedRequests: number;
  generatedRps: number;
  allowedRps: number;
  blockedRps: number;
  loadFactor: number;
}

export interface LatencyMetrics {
  avgLatencyMs: number;
  p50LatencyMs: number;
  p90LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
}

export interface RedisMetrics {
  redisRttMs: number;
  redisOpsCount: number;
  redisOpsPerSec: number;
  avgRedisCommandTimeMs: number;
}

export interface SystemMetrics {
  gatewayProcessingThroughputRps: number;
  cpuSystemPercent: number | null;
  memoryUsageBytes: number | null;
}

export interface RateLimiterMetrics {
  type: Algorithm;
  tokensRemaining?: number;
  capacity?: number;
  refillRate?: number;
  tokensConsumed?: number;
  starvationEvents?: number;
  counter?: number;
  limit?: number;
  windowSecs?: number;
  windowNumber?: number;
  ttlRemainingSecs?: number;
  rollingCount?: number;
  windowUtilizationPercent?: number;
  [key: string]: any;
}

export interface ValidationExpectedBehavior {
  maxAllowedRequests: number;
  expectedBlockedRequests: number;
  description: string;
  algorithmDetails: Record<string, any>;
}

export interface ValidationActualBehavior {
  allowed: number;
  blocked: number;
  generated: number;
  actualRps: number;
}

export interface ValidationMetrics {
  status: 'PASS' | 'WARN' | 'FAIL';
  accuracy: number; // 0 to 100
  expectedBehavior: ValidationExpectedBehavior;
  actualBehavior: ValidationActualBehavior;
  reason: string;
  diagnostics: string[];
}

// Alias for backwards compatibility in validators
export type ValidationResult = ValidationMetrics;

export interface CapacityMetrics {
  peakObservedRps: number | null;
  maxStableConcurrencyVus: number | null;
  saturationPointVus: number | null;
  backpressureEvents: number | null;
}

export interface BenchmarkResultPayload {
  startTime: number;
  endTime: number;
  requestedDurationSecs: number;
  actualDurationSecs: number;
  policy: PolicyInfo;
  trafficMetrics: TrafficMetrics;
  latencyMetrics: LatencyMetrics;
  redisMetrics: RedisMetrics;
  systemMetrics: SystemMetrics;
  rateLimiterMetrics: RateLimiterMetrics;
  validationMetrics: ValidationMetrics;
  capacityMetrics: CapacityMetrics;
  metricsConsistent: boolean;
  // Legacy aliases for backward compatibility where payload was flat
  traffic?: TrafficMetrics;
  system?: SystemMetrics;
  algorithmState?: Record<string, any>;
  validation?: ValidationResult;
}

export interface AlgorithmValidator {
  validate(
    policy: PolicyInfo,
    traffic: TrafficMetrics,
    actualDurationSecs: number,
    algorithmState: Record<string, any>
  ): ValidationMetrics;
}
