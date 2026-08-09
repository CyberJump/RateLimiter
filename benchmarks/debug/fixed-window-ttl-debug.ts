/**
 * Fixed Window TTL Debug Script
 *
 * Run this WHILE a k6 soak test is executing to watch the Redis key TTL
 * and counter value for a given API key over time. This will reveal:
 *
 *   (a) Whether the TTL is unexpectedly short (< 60s) — indicates the
 *       gateway is using a window_secs value other than 60.
 *   (b) Whether the key resets mid-test (counter drops to 1) — confirms
 *       a window rotation due to a short windowSecs config.
 *   (c) Whether EXPIRE was never set (TTL = -1) — persistent key bug.
 *
 * Usage:
 *   npx tsx benchmarks/debug/fixed-window-ttl-debug.ts <apiKeyId> [intervalMs]
 *
 * Example:
 *   npx tsx benchmarks/debug/fixed-window-ttl-debug.ts benchmark-fixed_window-1723190000000 500
 */

import { Redis } from 'ioredis';

const apiKeyId = process.argv[2];
const intervalMs = parseInt(process.argv[3] || '500', 10);

if (!apiKeyId) {
  console.error('Usage: npx tsx benchmarks/debug/fixed-window-ttl-debug.ts <apiKeyId> [intervalMs]');
  process.exit(1);
}

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redis = new Redis(redisUrl, { lazyConnect: false });

console.log(`\n🔍 Fixed Window TTL Monitor`);
console.log(`   API Key ID : ${apiKeyId}`);
console.log(`   Redis      : ${redisUrl}`);
console.log(`   Interval   : ${intervalMs}ms`);
console.log(`   Press Ctrl+C to stop.\n`);
console.log(`${'Time'.padEnd(10)} ${'Window#'.padEnd(12)} ${'Redis Key'.padEnd(55)} ${'Counter'.padEnd(10)} ${'TTL(s)'.padEnd(10)} ${'Status'}`);
console.log('-'.repeat(130));

let lastWindowNumber = -1;
let windowResetCount = 0;

async function poll() {
  const nowSec = Math.floor(Date.now() / 1000);

  // Check BOTH possible window sizes to detect which one the gateway is using.
  const windowSizesToCheck = [60, 10, 30]; // Typical candidates

  for (const windowSecs of windowSizesToCheck) {
    const windowNumber = Math.floor(nowSec / windowSecs);
    const key = `ratelimit:fixed:${apiKeyId}:${windowNumber}`;

    const [ttlResult, counterResult] = await Promise.all([
      redis.ttl(key),
      redis.get(key),
    ]);

    const ttl = ttlResult;
    const counter = counterResult ? parseInt(counterResult, 10) : 0;

    if (counter > 0) {
      // Only print keys that exist
      const status =
        ttl === -1 ? '⚠️  NO EXPIRY (persistent key!)' :
        ttl < windowSecs * 0.1 ? '🔴 EXPIRING SOON' :
        ttl < windowSecs * 0.5 ? '🟡 MID-WINDOW' :
        '✅ FRESH';

      const isNewWindow = windowNumber !== lastWindowNumber && windowSecs === 60;
      if (isNewWindow && lastWindowNumber !== -1) {
        windowResetCount++;
        console.log(`${'─'.repeat(130)}`);
        console.log(`⚡ WINDOW RESET DETECTED! (window_secs=${windowSecs}) — Reset #${windowResetCount} at ${new Date().toISOString()}`);
        console.log(`${'─'.repeat(130)}`);
      }
      if (windowSecs === 60) lastWindowNumber = windowNumber;

      const timeStr = new Date().toISOString().slice(11, 23);
      console.log(
        `${timeStr.padEnd(10)} ${String(windowNumber).padEnd(12)} ${key.padEnd(55)} ${String(counter).padEnd(10)} ${String(ttl).padEnd(10)} ${status}  [ws=${windowSecs}s]`
      );
    }
  }
}

const intervalId = setInterval(poll, intervalMs);

process.on('SIGINT', async () => {
  clearInterval(intervalId);
  console.log(`\n\n📊 Summary: Detected ${windowResetCount} window resets during monitoring.`);
  await redis.quit();
  process.exit(0);
});
