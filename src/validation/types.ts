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

export interface SystemMetrics {
  gatewayProcessingThroughputRps: number;
  redisRttMs: number;
  redisOpsCount: number;
  avgRedisCommandTimeMs: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
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

export interface ValidationResult {
  status: 'PASS' | 'WARN' | 'FAIL';
  accuracy: number; // 0 to 100
  expectedBehavior: ValidationExpectedBehavior;
  actualBehavior: ValidationActualBehavior;
  reason: string;
  diagnostics: string[];
}

export interface BenchmarkResultPayload {
  startTime: number;
  endTime: number;
  requestedDurationSecs: number;
  actualDurationSecs: number;
  policy: PolicyInfo;
  traffic: TrafficMetrics;
  system: SystemMetrics;
  algorithmState: Record<string, any>;
  validation: ValidationResult;
  metricsConsistent: boolean;
}

export interface AlgorithmValidator {
  validate(
    policy: PolicyInfo,
    traffic: TrafficMetrics,
    actualDurationSecs: number,
    algorithmState: Record<string, any>
  ): ValidationResult;
}
