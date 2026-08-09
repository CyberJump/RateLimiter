import { execSync } from 'child_process';

const BASE_URL = process.env.GATEWAY_URL || 'http://localhost:8080';

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

async function runFailClosedTest() {
  console.log('\n===============================================================');
  console.log(' STARTING FAIL-CLOSED RESILIENCE TEST (REDIS OUTAGE SIMULATION)');
  console.log(` Target Gateway URL: ${BASE_URL}`);
  console.log('===============================================================\n');

  // 1. Setup a valid API key
  const tierName = `failclosed_tier_${Date.now()}`;
  const tierRes = await postJson('/admin/tiers', {
    name: tierName,
    algorithm: 'token_bucket',
    limit: 10,
    windowSecs: 60,
  });

  const keyRes = await postJson('/admin/keys', { tierId: tierRes.tier.id });
  const apiKey = keyRes.key.apiKey;

  // 2. Verify baseline normal behavior (HTTP 200)
  const baselineRes = await fetch(`${BASE_URL}/api/v1/data`, {
    headers: { 'x-api-key': apiKey },
  });
  console.log(`1. Healthy Baseline Request Status: ${baselineRes.status} (Expected: 200 OK)`);

  if (baselineRes.status !== 200) {
    throw new Error(`Baseline check failed with status ${baselineRes.status}`);
  }

  // 3. Simulate Redis failure by stopping the Redis container
  console.log('\n🔥 Stopping Redis container to simulate Redis outage...');
  execSync('docker compose stop redis', { stdio: 'inherit' });

  // Wait 1s for connections to drop
  await new Promise((res) => setTimeout(res, 1000));

  // 4. Fire 10 requests during Redis outage
  console.log('\n⚡ Sending requests during Redis outage...');
  const outageResults: { reqIndex: number; status: number; body: any }[] = [];

  for (let i = 1; i <= 10; i++) {
    const res = await fetch(`${BASE_URL}/api/v1/data`, {
      headers: { 'x-api-key': apiKey },
    });
    let body = {};
    try {
      body = await res.json();
    } catch {}
    outageResults.push({ reqIndex: i, status: res.status, body });
    console.log(`   Request #${i}: HTTP ${res.status} | Body: ${JSON.stringify(body)}`);
  }

  const all503 = outageResults.every((r) => r.status === 503);

  // 5. Restore Redis container
  console.log('\n🟢 Restoring Redis container...');
  execSync('docker compose start redis', { stdio: 'inherit' });

  // Wait 3s for Redis to become healthy again
  await new Promise((res) => setTimeout(res, 3000));

  // 6. Verify recovery (HTTP 200)
  const recoveryRes = await fetch(`${BASE_URL}/api/v1/data`, {
    headers: { 'x-api-key': apiKey },
  });
  console.log(`\n2. Post-Recovery Request Status: ${recoveryRes.status} (Expected: 200 OK)`);

  const recovered = recoveryRes.status === 200;

  console.log('\n===============================================================');
  console.log(' RESULTS SUMMARY');
  console.log('===============================================================');
  console.log(` Outage Rejections (503 Service Unavailable) : ${outageResults.filter(r => r.status === 503).length}/10`);
  console.log(` Fail-Closed Assertion                      : ${all503 ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(` Service Recovery Assertion                 : ${recovered ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log('===============================================================\n');

  if (!all503 || !recovered) {
    console.error('❌ FAIL-CLOSED RESILIENCE TEST FAILED');
    process.exit(1);
  } else {
    console.log('✅ FAIL-CLOSED RESILIENCE TEST PASSED: Gateway strictly rejected requests with 503 during Redis failure.');
  }
}

runFailClosedTest().catch((err) => {
  console.error('Fatal error during fail-closed test:', err);
  // Ensure Redis is started even if test errors out
  try {
    execSync('docker compose start redis', { stdio: 'ignore' });
  } catch {}
  process.exit(1);
});
