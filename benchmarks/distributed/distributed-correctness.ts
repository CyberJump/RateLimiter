import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface RequestLogEntry {
  runIndex: number;
  requestIndex: number;
  algorithm: string;
  mode: 'shared' | 'isolated';
  status: number;
  replica: string;
  allowed: boolean;
  timestamp: string;
}

interface RunSummary {
  runIndex: number;
  algorithm: string;
  mode: 'shared' | 'isolated';
  totalRequests: number;
  allowedCount: number;
  blockedCount: number;
  replicaDistribution: Record<string, { total: number; allowed: number; blocked: number }>;
  passed: boolean;
  reason: string;
}

const BASE_URL = process.env.GATEWAY_URL || 'http://localhost:8080';
const NUM_REQUESTS = 300;
const LIMIT = 100;
const WINDOW_SECS = 60;
const BURST = 100;
const RUNS_PER_ALGO = 10;

// Helper to send HTTP requests to admin API
async function postJson(path: string, body: any) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

// Get or create tier + key for test
async function setupTestKey(algorithm: 'token_bucket' | 'fixed_window' | 'sliding_window', mode: string) {
  const tierName = `dist_tier_${algorithm}_${mode}_${Date.now()}`;
  
  // Create tier
  const tierRes = await postJson('/admin/tiers', {
    name: tierName,
    algorithm,
    limit: LIMIT,
    windowSecs: WINDOW_SECS,
    burstCapacity: BURST,
  });

  const tierId = tierRes.tier.id;

  // Create API key
  const keyRes = await postJson('/admin/keys', { tierId });
  return { apiKey: keyRes.key.apiKey, keyId: keyRes.key.id, tierId };
}

async function runSingleBurstTest(
  apiKey: string,
  algorithm: string,
  mode: 'shared' | 'isolated',
  runIndex: number
): Promise<{ summary: RunSummary; logs: RequestLogEntry[] }> {
  const logs: RequestLogEntry[] = [];

  // Fire 300 requests concurrently
  const requestPromises = Array.from({ length: NUM_REQUESTS }, (_, i) => {
    const reqIdx = i + 1;
    return fetch(`${BASE_URL}/api/v1/data`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'x-request-id': `dist-test-${runIndex}-${reqIdx}-${Date.now()}`,
      },
    }).then(async (res) => {
      const replica = res.headers.get('x-served-by') || 'unknown-replica';
      const status = res.status;
      const allowed = status === 200;

      const logEntry: RequestLogEntry = {
        runIndex,
        requestIndex: reqIdx,
        algorithm,
        mode,
        status,
        replica,
        allowed,
        timestamp: new Date().toISOString(),
      };
      return logEntry;
    }).catch(() => {
      return {
        runIndex,
        requestIndex: reqIdx,
        algorithm,
        mode,
        status: 500,
        replica: 'error',
        allowed: false,
        timestamp: new Date().toISOString(),
      } as RequestLogEntry;
    });
  });

  const results = await Promise.all(requestPromises);
  logs.push(...results);

  let allowedCount = 0;
  let blockedCount = 0;
  const replicaDistribution: Record<string, { total: number; allowed: number; blocked: number }> = {};

  for (const entry of results) {
    if (entry.allowed) allowedCount++;
    else blockedCount++;

    if (!replicaDistribution[entry.replica]) {
      replicaDistribution[entry.replica] = { total: 0, allowed: 0, blocked: 0 };
    }
    replicaDistribution[entry.replica].total++;
    if (entry.allowed) replicaDistribution[entry.replica].allowed++;
    else replicaDistribution[entry.replica].blocked++;
  }

  // Correctness evaluation:
  // In Shared Redis mode, limit is 100 globally. Max allowed across all replicas must be <= 101.
  // In Isolated Redis mode, each replica has limit 100, so 3 replicas will allow ~300 total.
  let passed = false;
  let reason = '';

  if (mode === 'shared') {
    // Shared Redis: Total allowed must NOT exceed LIMIT (with 2 req buffer for sub-millisecond refill)
    passed = allowedCount <= (LIMIT + 2);
    reason = passed
      ? `PASS: Global atomic limit enforced across cluster (${allowedCount}/${LIMIT} allowed, ${blockedCount} blocked).`
      : `FAIL: Over-admission detected in shared cluster! Allowed ${allowedCount} requests, limit is ${LIMIT}.`;
  } else {
    // Isolated Redis: Over-admission expected! Each replica independently permits ~100 reqs.
    passed = allowedCount > (LIMIT + 20); // Expect significantly > 100 allowed (e.g. ~300)
    reason = passed
      ? `CONFIRMED FAILURE MODE: Isolated state per replica resulted in over-admission (${allowedCount}/${NUM_REQUESTS} allowed across replicas).`
      : `UNEXPECTED: Isolated cluster allowed only ${allowedCount} requests.`;
  }

  const summary: RunSummary = {
    runIndex,
    algorithm,
    mode,
    totalRequests: NUM_REQUESTS,
    allowedCount,
    blockedCount,
    replicaDistribution,
    passed,
    reason,
  };

  return { summary, logs };
}

export async function runTestSuite(mode: 'shared' | 'isolated') {
  console.log(`\n===============================================================`);
  console.log(` STARTING DISTRIBUTED CORRECTNESS TEST SUITE — MODE: [${mode.toUpperCase()}]`);
  console.log(` Target Gateway URL: ${BASE_URL}`);
  console.log(` Concurrency: ${NUM_REQUESTS} requests | Configured Global Limit: ${LIMIT}`);
  console.log(` Runs Per Algorithm: ${RUNS_PER_ALGO}`);
  console.log(`===============================================================\n`);

  const algorithms: Array<'token_bucket' | 'fixed_window' | 'sliding_window'> = [
    'token_bucket',
    'fixed_window',
    'sliding_window',
  ];

  const allSummaries: RunSummary[] = [];
  const allLogs: RequestLogEntry[] = [];

  for (const algo of algorithms) {
    console.log(`\n--- Algorithm: ${algo.toUpperCase()} (${mode.toUpperCase()} MODE) ---`);

    for (let run = 1; run <= RUNS_PER_ALGO; run++) {
      // Create a fresh key for each run to avoid state carrying over across runs
      const { apiKey } = await setupTestKey(algo, mode);

      // Short delay for cluster sync
      await new Promise((res) => setTimeout(res, 250));

      const { summary, logs } = await runSingleBurstTest(apiKey, algo, mode, run);
      allSummaries.push(summary);
      allLogs.push(...logs);

      const statusTag = summary.passed ? '[PASS]' : '[FAIL]';
      const replicaSummary = Object.entries(summary.replicaDistribution)
        .map(([rep, stats]) => `${rep}: ${stats.allowed}/${stats.total}`)
        .join(' | ');

      console.log(
        `Run #${run.toString().padStart(2, ' ')} ${statusTag} Allowed: ${summary.allowedCount.toString().padStart(3, ' ')}/${NUM_REQUESTS} | Blocked: ${summary.blockedCount.toString().padStart(3, ' ')} | Distribution: [${replicaSummary}]`
      );
    }
  }

  return { summaries: allSummaries, logs: allLogs };
}

async function main() {
  const args = process.argv.slice(2);
  const modeArg = args.find((a: string) => a.startsWith('--mode='))?.split('=')[1] || 'shared';

  const mode = modeArg === 'isolated' ? 'isolated' : 'shared';

  const { summaries, logs } = await runTestSuite(mode);

  // Save logs to JSON file
  const reportsDir = resolve(__dirname, '..', 'reports');
  if (!existsSync(reportsDir)) {
    mkdirSync(reportsDir, { recursive: true });
  }

  const logPath = resolve(reportsDir, `distributed-routing-logs-${mode}.json`);
  writeFileSync(logPath, JSON.stringify({ summaries, logs }, null, 2), 'utf-8');
  console.log(`\nSaved per-request logs to: ${logPath}`);

  // Summary analysis
  const totalRuns = summaries.length;
  const passRuns = summaries.filter((s) => s.passed).length;
  const failRuns = totalRuns - passRuns;

  console.log(`\n===============================================================`);
  console.log(` TEST SUMMARY — ${mode.toUpperCase()} MODE`);
  console.log(` Total Runs Executed: ${totalRuns}`);
  console.log(` Passed Runs: ${passRuns}`);
  console.log(` Failed Runs: ${failRuns}`);
  console.log(`===============================================================\n`);

  if (failRuns > 0 && mode === 'shared') {
    console.error(`CRITICAL FINDING: ${failRuns} out of ${totalRuns} runs failed atomic limit enforcement!`);
    process.exit(1);
  }
}

// Execute main if run directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('distributed-correctness.ts')) {
  main().catch((err) => {
    console.error('Fatal error running distributed correctness test:', err);
    process.exit(1);
  });
}
