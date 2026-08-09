import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { ValidationEngine } from '../validation/engine.js';
import { MetricsCollector } from './metrics-collector.js';
import { BenchmarkAnalyzer } from './benchmark-analyzer.js';
import { ReportGenerator } from './report-generator.js';
import type { PolicyInfo } from '../validation/types.js';
import type { ScenarioConfig, DetailedBenchmarkResult, ResumeMetrics } from './types.js';
import * as schema from '../db/schema.js';

const execAsync = promisify(exec);

export class BenchmarkRunner {
  private validationEngine = new ValidationEngine();
  private metricsCollector: MetricsCollector;
  private analyzer = new BenchmarkAnalyzer();
  private reportGen = new ReportGenerator();

  constructor(private redis: Redis, private db?: any) {
    this.metricsCollector = new MetricsCollector(redis);
  }

  getDefaultScenarioMatrix(): ScenarioConfig[] {
    const algorithms: Array<'token_bucket' | 'fixed_window' | 'sliding_window'> = [
      'token_bucket',
      'fixed_window',
      'sliding_window'
    ];

    const patterns: Array<{ name: string; pattern: 'constant' | 'ramp' | 'spike' | 'soak'; targetRate: number; durationSecs: number; vus: number }> = [
      { name: 'Smoke Test', pattern: 'constant', targetRate: 50, durationSecs: 3, vus: 5 },
      { name: 'Ramp Up Load', pattern: 'ramp', targetRate: 150, durationSecs: 5, vus: 10 },
      { name: 'Spike Handling', pattern: 'spike', targetRate: 300, durationSecs: 5, vus: 20 },
      { name: 'Soak Stability Check', pattern: 'soak', targetRate: 80, durationSecs: 10, vus: 10 },
    ];

    const matrix: ScenarioConfig[] = [];

    for (const algo of algorithms) {
      for (const p of patterns) {
        const algoTitle = algo === 'token_bucket' ? 'Token Bucket' : algo === 'fixed_window' ? 'Fixed Window' : 'Sliding Window Log';
        matrix.push({
          name: `${algoTitle} — ${p.name}`,
          algorithm: algo,
          targetRate: p.targetRate,
          durationSecs: p.durationSecs,
          vus: p.vus,
          pattern: p.pattern,
          tier: 'enterprise',
        });
      }
    }

    return matrix;
  }

  getCapacitySweepMatrix(): ScenarioConfig[] {
    const algorithms: Array<'token_bucket' | 'fixed_window' | 'sliding_window'> = ['token_bucket', 'fixed_window', 'sliding_window'];
    const rates = [50, 100, 150, 200, 250, 300];
    const matrix: ScenarioConfig[] = [];

    for (const algo of algorithms) {
      for (const r of rates) {
        const algoTitle = algo === 'token_bucket' ? 'Token Bucket' : algo === 'fixed_window' ? 'Fixed Window' : 'Sliding Window Log';
        matrix.push({
          name: `${algoTitle} — Capacity Sweep (${r} RPS)`,
          algorithm: algo,
          targetRate: r,
          durationSecs: 5,
          vus: 20,
          pattern: 'constant',
          tier: 'enterprise',
        });
      }
    }
    return matrix;
  }

  getConcurrencySweepMatrix(): ScenarioConfig[] {
    const algorithms: Array<'token_bucket' | 'fixed_window' | 'sliding_window'> = ['token_bucket', 'fixed_window', 'sliding_window'];
    const vusList = [5, 10, 20, 50, 100];
    const matrix: ScenarioConfig[] = [];

    for (const algo of algorithms) {
      for (const vus of vusList) {
        const algoTitle = algo === 'token_bucket' ? 'Token Bucket' : algo === 'fixed_window' ? 'Fixed Window' : 'Sliding Window Log';
        matrix.push({
          name: `${algoTitle} — Concurrency Sweep (${vus} VUs)`,
          algorithm: algo,
          targetRate: 100,
          durationSecs: 5,
          vus: vus,
          pattern: 'constant',
          tier: 'enterprise',
        });
      }
    }
    return matrix;
  }

  async runScenario(scenario: ScenarioConfig): Promise<DetailedBenchmarkResult> {
    const keyId = scenario.apiKeyId || `benchmark-${scenario.algorithm}-${Date.now()}`;
    
    let lim = 100;
    let win = 60;
    let burst = 100;
    let source: 'Per-Key Override' | 'Tier Policy' | 'Global Default' = 'Tier Policy';
    let tierName = scenario.tier ? scenario.tier.toUpperCase() : 'ENTERPRISE';

    // Identical policy used for all algorithms to ensure scientific comparability

    const policy: PolicyInfo = {
      algorithm: scenario.algorithm,
      limit: lim,
      windowSecs: win,
      burstCapacity: burst,
      source,
      tierName,
    };

    // Pre-configure Redis policy cache
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
      // Redis fallback support
    }

    // Register/Upsert benchmark tier & key in PostgreSQL Drizzle DB
    if (this.db) {
      try {
        const benchmarkTierName = `benchmark_${scenario.algorithm}`;
        let tierId: string;

        const tierResult = await this.db
          .select()
          .from(schema.tiers)
          .where(eq(schema.tiers.name, benchmarkTierName))
          .limit(1);

        if (tierResult.length > 0) {
          tierId = tierResult[0].id;
          await this.db
            .update(schema.tiers)
            .set({
              algorithm: scenario.algorithm,
              limit: lim,
              windowSecs: win,
              burstCapacity: burst,
            })
            .where(eq(schema.tiers.id, tierId));
        } else {
          const inserted = await this.db
            .insert(schema.tiers)
            .values({
              name: benchmarkTierName,
              algorithm: scenario.algorithm,
              limit: lim,
              windowSecs: win,
              burstCapacity: burst,
            })
            .returning();
          tierId = inserted[0].id;
        }

        const keyHash = createHash('sha256').update(keyId).digest('hex');

        await this.db.insert(schema.apiKeys).values({
          keyHash,
          tierId,
        }).onConflictDoNothing();
      } catch (err) {
        // DB write fallback support
      }
    }

    const summaryExportPath = `/tmp/k6-summary-${keyId}.json`;
    const gatewayUrl = process.env.GATEWAY_URL || 'http://nginx:8080';

    // Map scenario horizontal_scale or standard pattern values
    const k6Pattern = scenario.pattern === 'horizontal_scale' ? 'constant' : scenario.pattern;

    
    const command = [
      'k6',
      'run',
      `-e RATE=${scenario.targetRate}`,
      `-e DURATION=${scenario.durationSecs}s`,
      `-e VUS=${scenario.vus}`,
      `-e PATTERN=${k6Pattern}`,
      `-e GATEWAY_URL=${gatewayUrl}`,
      `-e API_KEY=${keyId}`,
      `-e SUMMARY_EXPORT_PATH=${summaryExportPath}`,
      '/app/benchmarks/k6/runner.js'
    ].join(' ');

    const startTime = Date.now();
    
    // Spawn k6 load testing binary directly
    try {
      await execAsync(command);
    } catch (err: any) {
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

    // Extract exact telemetry values from k6 execution metrics.
    // http_reqs.rate is k6's own measured arrival rate — it excludes process startup
    // overhead, making it more accurate than wall-clock duration for RPS calculations.
    const allowedCount  = summary.metrics?.allowed_requests?.count ?? 0;
    const blockedCount  = summary.metrics?.blocked_requests?.count ?? 0;
    const k6TotalReqs   = summary.metrics?.http_reqs?.count ?? (allowedCount + blockedCount);
    const k6MeasuredRps = summary.metrics?.http_reqs?.rate ?? 0;

    // Extract all available latency percentiles from k6 summary.
    // p(99) is now present because runner.js declares a p(99)<9999 threshold.
    // med is k6's label for the 50th percentile (P50/median).
    const avgLatency = summary.metrics?.http_req_duration?.avg ?? 0;
    const medLatency = summary.metrics?.http_req_duration?.med ?? 0;
    const p90Latency = summary.metrics?.http_req_duration?.['p(90)'] ?? 0;
    const p95Latency = summary.metrics?.http_req_duration?.['p(95)'] ?? 0;
    const p99Latency = summary.metrics?.http_req_duration?.['p(99)'] ?? 0;
    const maxLatency = summary.metrics?.http_req_duration?.max ?? 0;

    const redisRttMs = await this.metricsCollector.measureRedisRttMs();
    
    const trafficMetrics = this.metricsCollector.buildTrafficMetrics(
      scenario.targetRate,
      allowedCount,
      blockedCount,
      k6MeasuredRps,
      lim / win
    );

    const latencyMetrics = this.metricsCollector.buildLatencyMetrics(
      avgLatency,
      medLatency,
      p90Latency,
      p95Latency,
      p99Latency,
      maxLatency,
      k6TotalReqs
    );

    const redisMetrics = this.metricsCollector.buildRedisMetrics(
      redisRttMs,
      trafficMetrics.generatedRequests,
      k6MeasuredRps,
      scenario.algorithm
    );

    const systemMetrics = this.metricsCollector.buildSystemMetrics(
      trafficMetrics.generatedRequests,
      k6MeasuredRps
    );

    const rateLimiterMetrics = await this.metricsCollector.captureRateLimiterMetrics(
      keyId,
      scenario.algorithm,
      lim,
      win,
      burst
    );

    
    const k6MeasuredDurationSecs = k6MeasuredRps > 0
      ? trafficMetrics.generatedRequests / k6MeasuredRps
      : actualDurationSecs;

    const validationMetrics = this.validationEngine.validate(
      policy,
      trafficMetrics,
      k6MeasuredDurationSecs,
      rateLimiterMetrics
    );

    const capacityMetrics = this.metricsCollector.buildCapacityMetrics(
      trafficMetrics.generatedRps,
      scenario.vus,
      validationMetrics.status === 'PASS'
    );

    const metricsConsistent = (trafficMetrics.generatedRequests === allowedCount + blockedCount);

    // Persist run results in PostgreSQL benchmark_runs table
    if (this.db) {
      try {
        await this.db.insert(schema.benchmarkRuns).values({
          algorithm: scenario.algorithm,
          pattern: scenario.pattern,
          targetKeyId: keyId,
          rateReqSec: scenario.targetRate,
          durationSecs: scenario.durationSecs,
          concurrency: scenario.vus,
          totalRequests: trafficMetrics.generatedRequests,
          allowedCount: trafficMetrics.allowedRequests,
          blockedCount: trafficMetrics.blockedRequests,
          actualRps: Math.round(trafficMetrics.generatedRps),
          avgLatencyMs: Math.round(latencyMetrics.avgLatencyMs),
          p95LatencyMs: Math.round(latencyMetrics.p95LatencyMs),
          p99LatencyMs: Math.round(latencyMetrics.p99LatencyMs),
          redisRttMs: Math.round(redisRttMs * 100),
          redisOpsCount: redisMetrics.redisOpsCount,
          accuracyPercent: Math.round(validationMetrics.accuracy),
          status: validationMetrics.status,
          detailsPayload: {
            policy,
            trafficMetrics,
            latencyMetrics,
            redisMetrics,
            systemMetrics,
            rateLimiterMetrics,
            validationMetrics,
            capacityMetrics,
            traffic: trafficMetrics,
            system: systemMetrics,
            validation: validationMetrics,
            algorithmState: rateLimiterMetrics,
          },
        });
      } catch (err) {
        
      }
    }

    return {
      timestamp: new Date().toISOString(),
      scenario,
      policy,
      trafficMetrics,
      latencyMetrics,
      redisMetrics,
      systemMetrics,
      rateLimiterMetrics,
      validationMetrics,
      capacityMetrics,
      metricsConsistent,
      totalElapsedMs,
      traffic: trafficMetrics,
      system: systemMetrics,
      algorithmState: rateLimiterMetrics,
      validation: validationMetrics,
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
