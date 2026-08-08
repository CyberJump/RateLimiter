import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import type { Redis } from 'ioredis';
import { getRateLimiter } from '../rate-limiters/factory.js';
import { ValidationEngine } from '../validation/engine.js';
import { MetricsCollector } from './metrics-collector.js';
import { BenchmarkAnalyzer } from './benchmark-analyzer.js';
import { ReportGenerator } from './report-generator.js';
import type { PolicyInfo } from '../validation/types.js';
import type { ScenarioConfig, DetailedBenchmarkResult, ResumeMetrics } from './types.js';

const execAsync = promisify(exec);

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

    // Ensure the key exists in PostgreSQL and has policy details pre-configured
    // (Simulates a real Gateway Policy Resolver sync)
    try {
      const redisKey = `policy:cache:${keyId}`;
      await this.redis.hset(redisKey, {
        algorithm: scenario.algorithm,
        limit: lim.toString(),
        windowSecs: win.toString(),
        burstCapacity: burst.toString(),
      });
      await this.redis.expire(redisKey, 3600);
    } catch {
      // Direct Redis writes are decoupled so fallback is supported
    }

    const summaryExportPath = `/tmp/k6-summary-${keyId}.json`;
    const gatewayUrl = process.env.GATEWAY_URL || 'http://nginx:8080';

    // Map scenario horizontal_scale or standard pattern values
    const k6Pattern = scenario.pattern === 'horizontal_scale' ? 'constant' : scenario.pattern;

    // Construct precise environment execution variables for the k6 binary
    const command = [
      'k6',
      'run',
      `--summary-export=${summaryExportPath}`,
      `-e RATE=${scenario.targetRate}`,
      `-e DURATION=${scenario.durationSecs}s`,
      `-e VUS=${scenario.vus}`,
      `-e PATTERN=${k6Pattern}`,
      `-e GATEWAY_URL=${gatewayUrl}`,
      `-e API_KEY=${keyId}`,
      '/app/benchmarks/k6/runner.js'
    ].join(' ');

    const startTime = Date.now();
    
    // Spawn k6 load testing binary directly
    try {
      await execAsync(command);
    } catch (err: any) {
      // If k6 exits with non-zero due to threshold failure, we still parse the summary report file
      if (!existsSync(summaryExportPath)) {
        throw new Error(`k6 failed to execute and did not write summary: ${err.message}`);
      }
    }

    const totalElapsedMs = Date.now() - startTime;
    const actualDurationSecs = totalElapsedMs / 1000;

    // Parse the generated k6 JSON report
    if (!existsSync(summaryExportPath)) {
      throw new Error(`k6 execution report summary not found at: ${summaryExportPath}`);
    }

    const rawSummary = readFileSync(summaryExportPath, 'utf-8');
    const summary = JSON.parse(rawSummary);

    // Extract exact telemetry values from k6 execution metrics
    const allowedCount = summary.metrics?.allowed_requests?.values?.count ?? 0;
    const blockedCount = summary.metrics?.blocked_requests?.values?.count ?? 0;
    const avgLatency = summary.metrics?.http_req_duration?.values?.avg ?? 0;
    const p95Latency = summary.metrics?.http_req_duration?.values?.['p(95)'] ?? 0;
    const p99Latency = summary.metrics?.http_req_duration?.values?.['p(99)'] ?? 0;

    const redisRttMs = await this.metricsCollector.measureRedisRttMs();
    const traffic = this.metricsCollector.buildTrafficMetrics(
      scenario.targetRate,
      allowedCount,
      blockedCount,
      actualDurationSecs,
      lim / win
    );

    const latenciesMock = Array.from({ length: 10 }, (_, i) => 
      i === 9 ? p99Latency : i >= 8 ? p95Latency : avgLatency
    );

    const system = this.metricsCollector.buildSystemMetrics(traffic.generatedRequests, latenciesMock, redisRttMs);
    const algorithmState = await this.metricsCollector.captureAlgorithmState(keyId, scenario.algorithm, lim, win, burst);

    const totalRequests = traffic.generatedRequests;
    const metricsConsistent = (traffic.generatedRequests === allowedCount + blockedCount);
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
