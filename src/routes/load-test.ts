import type { FastifyInstance } from 'fastify';
import { apiKeys, tiers } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { BenchmarkRunner } from '../benchmarks/benchmark-runner.js';

interface LoadTestOptions {
  apiKey?: string;
  targetKeyId?: string;
  algorithm?: 'fixed_window' | 'sliding_window' | 'token_bucket';
  limit?: number;
  windowSecs?: number;
  burstCapacity?: number;
  rateReqSec: number;
  durationSecs: number;
  concurrency: number;
  pattern: 'constant' | 'spike' | 'bursty' | 'ramp';
}

export async function loadTestRoutes(fastify: FastifyInstance): Promise<void> {

  /**
   * Resolve effective rate limiting policy using precedence:
   * Priority 1: Per-Key Override -> Priority 2: Tier Policy -> Priority 3: Global Default
   */
  fastify.get<{
    Querystring: { key: string };
  }>('/admin/keys/resolve', async (request, reply) => {
    const { key } = request.query;
    if (!key || key.trim() === '') {
      return {
        keyId: 'global-default',
        tierName: 'Global Default',
        source: 'Global Default',
        policy: {
          algorithm: 'token_bucket',
          limit: 20,
          windowSecs: 10,
          burstCapacity: 20,
        }
      };
    }

    try {
      const trimmed = key.trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
      const keyHash = createHash('sha256').update(trimmed).digest('hex');

      const found = await fastify.db
        .select({
          keyId: apiKeys.id,
          keyAlgo: apiKeys.algorithm,
          keyLimit: apiKeys.limit,
          keyWindowSecs: apiKeys.windowSecs,
          keyBurstCapacity: apiKeys.burstCapacity,
          tierName: tiers.name,
          tierAlgo: tiers.algorithm,
          tierLimit: tiers.limit,
          tierWindowSecs: tiers.windowSecs,
          tierBurstCapacity: tiers.burstCapacity,
        })
        .from(apiKeys)
        .innerJoin(tiers, eq(apiKeys.tierId, tiers.id))
        .where(isUuid ? eq(apiKeys.id, trimmed) : eq(apiKeys.keyHash, keyHash))
        .limit(1);

      if (found.length > 0) {
        const k = found[0];
        const hasOverride = k.keyAlgo !== null || k.keyLimit !== null || k.keyWindowSecs !== null || k.keyBurstCapacity !== null;
        const algo = k.keyAlgo || k.tierAlgo;
        const lim = k.keyLimit || k.tierLimit;
        const win = k.keyWindowSecs || k.tierWindowSecs;
        const burst = k.keyBurstCapacity ?? k.tierBurstCapacity ?? lim;

        return {
          keyId: k.keyId,
          tierName: k.tierName,
          source: hasOverride ? 'Per-Key Override' : 'Tier Policy',
          policy: {
            algorithm: algo,
            limit: lim,
            windowSecs: win,
            burstCapacity: burst,
          }
        };
      } else {
        return {
          keyId: `sim-${trimmed}`,
          tierName: 'Global Default',
          source: 'Global Default',
          policy: {
            algorithm: 'token_bucket',
            limit: 20,
            windowSecs: 10,
            burstCapacity: 20,
          }
        };
      }
    } catch (err) {
      return reply.code(500).send({ error: 'Internal Server Error', message: (err as Error).message });
    }
  });

  fastify.post<{ Body: LoadTestOptions }>('/admin/load-test/run', async (request, reply) => {
    try {
      const {
        apiKey,
        targetKeyId,
        rateReqSec = 50,
        durationSecs = 5,
        concurrency = 5,
        pattern = 'constant',
      } = request.body || {};

      const redis = fastify.redis;

      let keyId = targetKeyId || `test-key-${Date.now()}`;
      let algo = 'token_bucket';
      let lim = 20;
      let win = 10;
      let burst = 20;
      let source = 'Global Default';
      let tierName = 'Global Default';

      // If apiKey string was provided, look it up in DB
      if (apiKey && apiKey.trim() !== '') {
        const trimmed = apiKey.trim();
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
        const keyHash = createHash('sha256').update(trimmed).digest('hex');

        const found = await fastify.db
          .select({
            keyId: apiKeys.id,
            keyAlgo: apiKeys.algorithm,
            keyLimit: apiKeys.limit,
            keyWindowSecs: apiKeys.windowSecs,
            keyBurstCapacity: apiKeys.burstCapacity,
            tierName: tiers.name,
            tierAlgo: tiers.algorithm,
            tierLimit: tiers.limit,
            tierWindowSecs: tiers.windowSecs,
            tierBurstCapacity: tiers.burstCapacity,
          })
          .from(apiKeys)
          .innerJoin(tiers, eq(apiKeys.tierId, tiers.id))
          .where(isUuid ? eq(apiKeys.id, trimmed) : eq(apiKeys.keyHash, keyHash))
          .limit(1);

        if (found.length > 0) {
          const k = found[0];
          keyId = k.keyId;
          tierName = k.tierName;
          
          const hasOverride = k.keyAlgo !== null || k.keyLimit !== null || k.keyWindowSecs !== null || k.keyBurstCapacity !== null;
          source = hasOverride ? 'Per-Key Override' : 'Tier Policy';

          algo = (k.keyAlgo || k.tierAlgo) as any;
          lim = k.keyLimit || k.tierLimit;
          win = k.keyWindowSecs || k.tierWindowSecs;
          burst = k.keyBurstCapacity ?? k.tierBurstCapacity ?? lim;
        } else {
          keyId = `sim-${trimmed}`;
        }
      }

      // Execute scenario directly via Unified k6 BenchmarkRunner
      const runner = new BenchmarkRunner(redis, fastify.db);
      const benchmarkResult = await runner.runScenario({
        name: 'Workbench Load Test',
        algorithm: algo as any,
        targetRate: rateReqSec,
        durationSecs,
        vus: concurrency,
        pattern: pattern as any,
        apiKeyId: keyId,
        tier: tierName,
      });

      return {
        status: 'completed',
        algorithm: algo,
        targetKeyId: keyId,
        config: {
          limit: lim,
          windowSecs: win,
          burstCapacity: burst,
          source,
          tierName,
        },
        summary: {
          totalRequests: benchmarkResult.trafficMetrics.generatedRequests,
          allowed: benchmarkResult.trafficMetrics.allowedRequests,
          blocked: benchmarkResult.trafficMetrics.blockedRequests,
          successRatePercent: benchmarkResult.trafficMetrics.generatedRequests > 0 ? Math.round((benchmarkResult.trafficMetrics.allowedRequests / benchmarkResult.trafficMetrics.generatedRequests) * 1000) / 10 : 0,
          rejectionRatePercent: benchmarkResult.trafficMetrics.generatedRequests > 0 ? Math.round((benchmarkResult.trafficMetrics.blockedRequests / benchmarkResult.trafficMetrics.generatedRequests) * 1000) / 10 : 0,
          actualRps: benchmarkResult.trafficMetrics.generatedRps,
          durationMs: benchmarkResult.totalElapsedMs,
          avgLatencyMs: benchmarkResult.latencyMetrics.avgLatencyMs,
          p95LatencyMs: benchmarkResult.latencyMetrics.p95LatencyMs,
        },
        result: benchmarkResult,
      };
    } catch (err) {
      fastify.log.error({ err }, 'Load test endpoint failed');
      reply.code(500).send({ error: 'Internal Server Error', message: (err as Error).message });
    }
  });
}
