import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.GATEWAY_URL || 'http://localhost:8080';
const CONCURRENT_REQUESTS = 1000;

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

async function getJson(path: string) {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function runCacheStampedeTest() {
  console.log('\n===============================================================');
  console.log(' STARTING CACHE STAMPEDE RESILIENCE TEST');
  console.log(` Target Gateway URL: ${BASE_URL}`);
  console.log(` Concurrent Requests: ${CONCURRENT_REQUESTS} for uncached API key`);
  console.log('===============================================================\n');

  // 1. Create a brand new tier and uncached API key
  const tierName = `stampede_tier_${Date.now()}`;
  const tierRes = await postJson('/admin/tiers', {
    name: tierName,
    algorithm: 'token_bucket',
    limit: 100,
    windowSecs: 60,
    burstCapacity: 100,
  });

  const keyRes = await postJson('/admin/keys', { tierId: tierRes.tier.id });
  const uncachedApiKey = keyRes.key.apiKey;

  // 2. Reset query counter
  await postJson('/admin/db-query-count/reset', {});

  // 3. Fire 1,000 concurrent requests simultaneously
  console.log(`🚀 Firing ${CONCURRENT_REQUESTS} parallel requests for uncached key...`);
  const startTime = Date.now();

  const promises = Array.from({ length: CONCURRENT_REQUESTS }, (_, i) => {
    return fetch(`${BASE_URL}/api/v1/data`, {
      method: 'GET',
      headers: {
        'x-api-key': uncachedApiKey,
      },
    }).then((res) => res.status);
  });

  const statuses = await Promise.all(promises);
  const durationMs = Date.now() - startTime;

  const status200 = statuses.filter((s) => s === 200).length;
  const status429 = statuses.filter((s) => s === 429).length;
  const status401 = statuses.filter((s) => s === 401).length;
  const status500 = statuses.filter((s) => s >= 500).length;

  // 4. Query Postgres query counter
  const queryMetric = await getJson('/admin/db-query-count');
  const observedQueries = queryMetric.count;

  const queryLabel = observedQueries === 1 ? 'query' : 'queries';
  console.log(`\n📊 Execution Completed in ${durationMs} ms`);
  console.log(`  • Allowed (200 OK)       : ${status200}`);
  console.log(`  • Rate Limited (429)     : ${status429}`);
  console.log(`  • Unauthorized (401)     : ${status401}`);
  console.log(`  • Server Errors (500)    : ${status500}`);
  console.log(`  • Observed DB Queries    : ${observedQueries} ${queryLabel}`);

  // Assertions:
  // Distributed lock in Redis ensures that 1,000 concurrent requests across 3 gateway replicas
  // trigger ONLY 1 PostgreSQL query globally.
  const passed = observedQueries <= 2 && status401 === 0 && (status200 + status429) === CONCURRENT_REQUESTS;

  console.log('\n===============================================================');
  if (passed) {
    console.log(`✅ CACHE STAMPEDE TEST PASSED: ${CONCURRENT_REQUESTS} requests triggered only ${observedQueries} DB ${queryLabel} across the cluster.`);
  } else {
    console.error(`❌ CACHE STAMPEDE TEST FAILED: Observed ${observedQueries} DB ${queryLabel} for ${CONCURRENT_REQUESTS} requests.`);
  }
  console.log('===============================================================\n');

  if (!passed) process.exit(1);
}

runCacheStampedeTest().catch((err) => {
  console.error('Fatal error during cache stampede test:', err);
  process.exit(1);
});
