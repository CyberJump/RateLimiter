import type { Redis } from 'ioredis';
import { getRateLimiter } from '../rate-limiters/factory.js';
import { ValidationEngine } from '../validation/engine.js';
import { MetricsCollector } from './metrics-collector.js';
import { BenchmarkAnalyzer } from './benchmark-analyzer.js';
import { ReportGenerator } from './report-generator.js';
import type { PolicyInfo } from '../validation/types.js';
import type { ScenarioConfig, DetailedBenchmarkResult, ResumeMetrics } from './types.js';

export class BenchmarkRunner {
  private validationEngine = new ValidationEngine();
  private metricsCollector: MetricsCollector;
  private analyzer = new BenchmarkAnalyzer();
  private reportGen = new ReportGenerator();

  constructor(private redis: Redis) {
    this.metricsCollector = new MetricsCollector(redis);
  }

  getDefaultScenarioMatrix(): ScenarioConfig[] {
    return [
      { name: 'Smoke Test (Token Bucket Baseline)', algorithm: 'token_bucket', targetRate: 50, durationSecs: 3, vus: 5, pattern: 'constant', tier: 'enterprise' },
      { name: 'Spike Handling (Token Bucket Burst Surge)', algorithm: 'token_bucket', targetRate: 300, durationSecs: 5, vus: 20, pattern: 'spike', tier: 'enterprise' },
      { name: 'Ramp Up Load (Fixed Window Boundary Test)', algorithm: 'fixed_window', targetRate: 150, durationSecs: 5, vus: 10, pattern: 'ramp', tier: 'free' },
      { name: 'Sliding Log Accuracy (Rolling Window Benchmark)', algorithm: 'sliding_window', targetRate: 100, durationSecs: 5, vus: 10, pattern: 'constant', tier: 'pro' },
      { name: 'Horizontal Scaling Gateway Simulation', algorithm: 'token_bucket', targetRate: 500, durationSecs: 5, vus: 25, pattern: 'horizontal_scale', tier: 'enterprise', gatewaysCount: 4 },
      { name: 'Soak Stability Check (Extended Run)', algorithm: 'token_bucket', targetRate: 80, durationSecs: 10, vus: 10, pattern: 'soak', tier: 'enterprise' },
    ];
  }

  async runScenario(scenario: ScenarioConfig): Promise<DetailedBenchmarkResult> {
    const keyId = scenario.apiKeyId || `benchmark-${scenario.algorithm}-${Date.now()}`;
    
    // Resolve policy based on tier/algorithm
    let lim = 20;
    let win = 10;
    let burst = 20;
    let source: 'Per-Key Override' | 'Tier Policy' | 'Global Default' = 'Tier Policy';
    let tierName = scenario.tier ? scenario.tier.toUpperCase() : 'ENTERPRISE';

    if (scenario.algorithm === 'token_bucket') {
      lim = 500;
      win = 60;
      burst = 50;
    } else if (scenario.algorithm === 'sliding_window') {
      lim = 100;
      win = 60;
      burst = 100;
    } else if (scenario.algorithm === 'fixed_window') {
      lim = 10;
      win = 60;
      burst = 10;
    }

    const policy: PolicyInfo = {
      algorithm: scenario.algorithm,
      limit: lim,
      windowSecs: win,
      burstCapacity: burst,
      source,
      tierName,
    };

    const limiter = getRateLimiter(scenario.algorithm, this.redis);
    const totalRequests = Math.min(Math.max(10, scenario.targetRate * scenario.durationSecs), 1000);
    const batchSize = Math.max(1, scenario.vus);
    const totalBatches = Math.ceil(totalRequests / batchSize);

    let allowedCount = 0;
    let blockedCount = 0;
    const latencies: number[] = [];
    const startTime = Date.now();

    for (let b = 0; b < totalBatches; b++) {
      const currentBatchSize = Math.min(batchSize, totalRequests - b * batchSize);
      const batchPromises = Array.from({ length: currentBatchSize }, async () => {
        const reqStart = Date.now();
        try {
          const res = await limiter.check(keyId, lim, win, burst);
          latencies.push(Date.now() - reqStart);
          if (res.allowed) {
            allowedCount++;
          } else {
            blockedCount++;
          }
        } catch {
          latencies.push(1);
          blockedCount++;
        }
      });

      await Promise.all(batchPromises);

      // Deterministic arrival rate delay pacing
      const expectedElapsed = ((b + 1) * batchSize / scenario.targetRate) * 1000;
      const actualElapsed = Date.now() - startTime;
      if (expectedElapsed > actualElapsed) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(expectedElapsed - actualElapsed, 50)));
      }
    }

    const totalElapsedMs = Math.max(1, Date.now() - startTime);
    const actualDurationSecs = Math.max(0.01, totalElapsedMs / 1000);

    const redisRttMs = await this.metricsCollector.measureRedisRttMs();
    const traffic = this.metricsCollector.buildTrafficMetrics(
      scenario.targetRate,
      allowedCount,
      blockedCount,
      actualDurationSecs,
      lim / win
    );
    const system = this.metricsCollector.buildSystemMetrics(traffic.generatedRequests, latencies, redisRttMs);
    const algorithmState = await this.metricsCollector.captureAlgorithmState(keyId, scenario.algorithm, lim, win, burst);

    const metricsConsistent = (traffic.generatedRequests === totalRequests) && (allowedCount + blockedCount === totalRequests);
    const validation = this.validationEngine.validate(policy, traffic, actualDurationSecs, algorithmState);

    return {
      timestamp: new Date().toISOString(),
      scenario,
      policy,
      traffic,
      system,
      algorithmState,
      validation,
      metricsConsistent,
      totalElapsedMs,
    };
  }

  async runMatrix(matrix?: ScenarioConfig[]): Promise<{ results: DetailedBenchmarkResult[]; resume: ResumeMetrics; consoleSummary: string }> {
    const scenarios = matrix && matrix.length > 0 ? matrix : this.getDefaultScenarioMatrix();
    const results: DetailedBenchmarkResult[] = [];

    for (const scenario of scenarios) {
      const res = await this.runScenario(scenario);
      results.push(res);
    }

    const resume = this.analyzer.calculateResumeMetrics(results);
    const consoleSummary = this.reportGen.generateConsoleSummary(results, resume);

    return { results, resume, consoleSummary };
  }
}
