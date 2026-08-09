import type { DetailedBenchmarkResult, ResumeMetrics, AlgorithmComparison } from './types.js';

export class BenchmarkAnalyzer {
  calculateResumeMetrics(runs: DetailedBenchmarkResult[]): ResumeMetrics {
    if (runs.length === 0) {
      return {
        peakSustainedThroughputRps: 0,
        maxConcurrentRequests: 0,
        p95LatencyMs: 0,
        p99LatencyMs: 0,
        maxRedisThroughputRps: 0,
        maxStableConcurrencyVus: 0,
        largestBenchmarkTotalRequests: 0,
        totalRequestsProcessed: 0,
        algorithmValidationAccuracyPercent: 0,
      };
    }

    let maxThroughput = -1;
    let maxVus = 0;
    let maxRedisOpsRps = 0;
    let maxRequestsInRun = 0;
    let totalProcessed = 0;
    let totalAccuracySum = 0;
    let peakRun: DetailedBenchmarkResult = runs[0];

    for (const run of runs) {
      // Access via new hierarchy or backwards compatibility property
      const system = run.systemMetrics || run.system;
      const traffic = run.trafficMetrics || run.traffic;
      const redis = run.redisMetrics;
      const validation = run.validationMetrics || run.validation;

      const throughput = system?.gatewayProcessingThroughputRps ?? traffic?.generatedRps ?? 0;
      if (throughput > maxThroughput) {
        maxThroughput = throughput;
        peakRun = run;
      }
      
      const isPassed = validation?.status === 'PASS';
      if (isPassed && run.scenario.vus > maxVus) {
        maxVus = run.scenario.vus;
      }

      const redisOpsRps = redis?.redisOpsPerSec ?? 0;
      if (redisOpsRps > maxRedisOpsRps) maxRedisOpsRps = redisOpsRps;

      const generatedReqs = traffic?.generatedRequests ?? 0;
      if (generatedReqs > maxRequestsInRun) maxRequestsInRun = generatedReqs;
      
      totalProcessed += generatedReqs;
      totalAccuracySum += validation?.accuracy ?? 0;
    }

    // Sourced from peak load run: pairing peak throughput with actual SLA latency measured at peak load
    const peakLat = peakRun.latencyMetrics || (peakRun.systemMetrics as any) || {};
    const p95 = peakLat.p95LatencyMs ?? 0;
    const p99 = peakLat.p99LatencyMs ?? 0;

    const avgAccuracy = runs.length > 0 ? totalAccuracySum / runs.length : 0;

    return {
      peakSustainedThroughputRps: Math.round(maxThroughput * 10) / 10,
      maxConcurrentRequests: maxRequestsInRun,
      p95LatencyMs: Math.round(p95 * 10) / 10,
      p99LatencyMs: Math.round(p99 * 10) / 10,
      maxRedisThroughputRps: Math.round(maxRedisOpsRps * 10) / 10,
      maxStableConcurrencyVus: maxVus > 0 ? maxVus : 0,
      largestBenchmarkTotalRequests: maxRequestsInRun,
      totalRequestsProcessed: totalProcessed,
      algorithmValidationAccuracyPercent: Math.round(avgAccuracy * 10) / 10,
    };
  }

  compareAlgorithms(runA: DetailedBenchmarkResult, runB: DetailedBenchmarkResult): AlgorithmComparison {
    const systemA = runA.systemMetrics || runA.system;
    const systemB = runB.systemMetrics || runB.system;
    const trafficA = runA.trafficMetrics || runA.traffic;
    const trafficB = runB.trafficMetrics || runB.traffic;
    const latencyAObj = runA.latencyMetrics || systemA;
    const latencyBObj = runB.latencyMetrics || systemB;
    const redisA = runA.redisMetrics;
    const redisB = runB.redisMetrics;
    const validationA = runA.validationMetrics || runA.validation;
    const validationB = runB.validationMetrics || runB.validation;

    const throughputA = systemA?.gatewayProcessingThroughputRps || trafficA?.generatedRps || 0;
    const throughputB = systemB?.gatewayProcessingThroughputRps || trafficB?.generatedRps || 0;
    const throughputDelta = throughputA > 0 ? Math.round(((throughputB - throughputA) / throughputA) * 1000) / 10 : 0;

    const latencyA = latencyAObj?.avgLatencyMs || 1;
    const latencyB = latencyBObj?.avgLatencyMs || 1;
    const latencyDelta = Math.round(((latencyB - latencyA) / latencyA) * 1000) / 10;

    const redisOpsA = redisA?.redisOpsPerSec || 0;
    const redisOpsB = redisB?.redisOpsPerSec || 0;
    const redisOpsDelta = redisOpsA > 0 ? Math.round(((redisOpsB - redisOpsA) / redisOpsA) * 1000) / 10 : 0;

    const accuracyA = validationA?.accuracy ?? 0;
    const accuracyB = validationB?.accuracy ?? 0;
    const accuracyDelta = Math.round((accuracyB - accuracyA) * 10) / 10;

    let winner = runA.policy.algorithm;
    if (accuracyB > accuracyA || (accuracyB === accuracyA && latencyB < latencyA)) {
      winner = runB.policy.algorithm;
    }

    const algoAName = runA.policy.algorithm.replace('_', ' ').toUpperCase();
    const algoBName = runB.policy.algorithm.replace('_', ' ').toUpperCase();

    return {
      algoA: runA.policy.algorithm,
      algoB: runB.policy.algorithm,
      throughputDeltaPercent: throughputDelta,
      latencyDeltaPercent: latencyDelta,
      redisOpsDeltaPercent: redisOpsDelta,
      accuracyDeltaPercent: accuracyDelta,
      winner,
      summary: `${winner.replace('_', ' ').toUpperCase()} demonstrated superior overall performance profile. ${algoBName} exhibited ${throughputDelta >= 0 ? '+' : ''}${throughputDelta}% throughput difference and ${latencyDelta >= 0 ? '+' : ''}${latencyDelta}% latency delta compared to ${algoAName}.`,
    };
  }

  findCapacityCeiling(runs: DetailedBenchmarkResult[], algo: string): number {
    const algoRuns = runs.filter(r => r.policy.algorithm === algo);
    let maxCeiling = 0;
    for (const run of algoRuns) {
      const validation = run.validationMetrics || run.validation;
      const latency = run.latencyMetrics;
      // Define stability criteria: PASS status (implies accuracy >= 85), p95 <= 100ms
      if (validation?.status === 'PASS' && latency?.p95LatencyMs <= 100) {
        if (run.scenario.targetRate > maxCeiling) {
          maxCeiling = run.scenario.targetRate;
        }
      }
    }
    return maxCeiling;
  }

  findMaxStableVus(runs: DetailedBenchmarkResult[], algo: string): number {
    const algoRuns = runs.filter(r => r.policy.algorithm === algo);
    let maxVus = 0;
    for (const run of algoRuns) {
      const validation = run.validationMetrics || run.validation;
      const latency = run.latencyMetrics;
      if (validation?.status === 'PASS' && latency?.p95LatencyMs <= 100) {
        if (run.scenario.vus > maxVus) {
          maxVus = run.scenario.vus;
        }
      }
    }
    return maxVus;
  }
}
