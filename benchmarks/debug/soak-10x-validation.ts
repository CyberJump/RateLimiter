/**
 * Fixed Window Soak Test — 10-Run Consecutive Validation Script
 *
 * Runs the exact Fixed Window Soak scenario 10 times in a row and validates
 * that allowed count never exceeds 100 (the configured limit) in any run.
 *
 * Additionally logs, per-run, the exact second-within-60s-window at which k6
 * started, so you can correlate boundary proximity with pass/fail outcomes.
 *
 * Usage (inside gateway-1 container, after npm run build):
 *   node dist/benchmarks/soak-10x-validation.js
 *
 * Or locally (requires local Redis + gateway stack):
 *   npx tsx benchmarks/debug/soak-10x-validation.ts
 */

import { Redis } from 'ioredis';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { BenchmarkRunner } from '../../dist/benchmarks/benchmark-runner.js';
import * as schema from '../../dist/db/schema.js';

const { Pool } = pg;

const WINDOW_SECS = 60;
const LIMIT = 100;
const SOAK_SCENARIO = {
  name: 'Fixed Window — Soak Stability Check (10x Validation)',
  algorithm: 'fixed_window' as const,
  targetRate: 80,
  durationSecs: 11,
  vus: 10,
  pattern: 'soak' as const,
  tier: 'enterprise',
};

async function main() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:admin@localhost:5432/ratelimiter';

  const redis = new Redis(redisUrl, { lazyConnect: false });
  const pool = new Pool({ connectionString: dbUrl });
  const db = drizzle(pool, { schema });
  const runner = new BenchmarkRunner(redis, db);

  const results: { run: number; allowed: number; status: string; secsIntoWindow: number; secsUntilBoundary: number }[] = [];

  console.log('\n🔬 Fixed Window Soak Test — 10-Run Consecutive Validation');
  console.log('═'.repeat(70));
  console.log(`  Limit: ${LIMIT} req | Window: ${WINDOW_SECS}s | Target RPS: ${SOAK_SCENARIO.targetRate} | Duration: ${SOAK_SCENARIO.durationSecs}s`);
  console.log('═'.repeat(70));

  for (let run = 1; run <= 10; run++) {
    const nowSec = Math.floor(Date.now() / 1000);
    const secsIntoWindow = nowSec % WINDOW_SECS;
    const secsUntilBoundary = WINDOW_SECS - secsIntoWindow;

    console.log(`\n[Run ${run}/10] Starting at second ${secsIntoWindow} of ${WINDOW_SECS}s window (${secsUntilBoundary}s until boundary)`);

    let result;
    try {
      result = await runner.runScenario(SOAK_SCENARIO);
    } catch (err: any) {
      console.error(`  ❌ Run ${run} failed with error: ${err.message}`);
      results.push({ run, allowed: -1, status: 'ERROR', secsIntoWindow, secsUntilBoundary });
      continue;
    }

    const allowed = result.trafficMetrics.allowedRequests;
    const status = allowed <= LIMIT ? 'PASS ✅' : 'FAIL ❌';
    results.push({ run, allowed, status: allowed <= LIMIT ? 'PASS' : 'FAIL', secsIntoWindow, secsUntilBoundary });

    console.log(`  Allowed: ${allowed} / ${result.trafficMetrics.generatedRequests} | Blocked: ${result.trafficMetrics.blockedRequests} | Accuracy: ${result.validationMetrics.accuracy}%`);
    console.log(`  ${status} | Boundary proximity: ${secsUntilBoundary}s remaining in window`);

    // TTL probe: check the fixed-window Redis key TTL immediately after run
    try {
      const keys = await redis.keys(`ratelimit:fixed:benchmark-fixed_window*`);
      for (const key of keys) {
        const [ttl, val] = await Promise.all([redis.ttl(key), redis.get(key)]);
        console.log(`  Redis key: ${key.split(':').slice(-2).join(':')} → counter=${val ?? 'n/a'} TTL=${ttl}s`);
      }
    } catch {
      // ignore
    }
  }

  console.log('\n' + '═'.repeat(70));
  console.log('  RESULTS SUMMARY');
  console.log('═'.repeat(70));
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  for (const r of results) {
    const boundaryWarning = r.secsUntilBoundary <= SOAK_SCENARIO.durationSecs + 2
      ? ` ⚠️  boundary in ${r.secsUntilBoundary}s`
      : '';
    console.log(`  Run ${r.run.toString().padStart(2)}: allowed=${String(r.allowed).padStart(3)} | ${r.status}${boundaryWarning}`);
  }

  console.log('═'.repeat(70));
  console.log(`  Pass: ${passed}/10 | Fail: ${failed}/10`);
  if (failed === 0) {
    console.log('  ✅ ALL 10 RUNS PASSED — Fixed Window boundary bug is confirmed fixed.');
  } else {
    console.log(`  ❌ ${failed} RUNS FAILED — Boundary alignment fix needs investigation.`);
    const failedRuns = results.filter(r => r.status === 'FAIL');
    console.log('  Failed runs started at:');
    for (const r of failedRuns) {
      console.log(`    Run ${r.run}: ${r.secsIntoWindow}s into window (${r.secsUntilBoundary}s to boundary)`);
    }
  }
  console.log('═'.repeat(70));

  await redis.quit();
  await pool.end();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
