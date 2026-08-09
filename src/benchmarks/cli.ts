import { Redis } from 'ioredis';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { BenchmarkRunner } from './benchmark-runner.js';
import { ReportGenerator } from './report-generator.js';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from '../db/schema.js';

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:admin@localhost:5432/ratelimiter';

  console.log(`Connecting to Redis at ${redisUrl}...`);
  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });

  console.log(`Connecting to Postgres at ${dbUrl}...`);
  const pool = new Pool({ connectionString: dbUrl });
  const db = drizzle(pool, { schema });

  try {
    const runner = new BenchmarkRunner(redis, db);

    const modeArg = process.argv.find(arg => arg.startsWith('--mode='));
    const mode = modeArg ? modeArg.split('=')[1] : 'default';

    let matrix;
    if (mode === 'capacity') {
      console.log('⚡ Starting Production API Gateway CAPACITY SWEEP Suite...\n');
      matrix = runner.getCapacitySweepMatrix();
    } else if (mode === 'concurrency') {
      console.log('⚡ Starting Production API Gateway CONCURRENCY SWEEP Suite...\n');
      matrix = runner.getConcurrencySweepMatrix();
    } else if (mode === 'race') {
      console.log('⚡ Running Race Condition Tests via Vitest...\n');
      const { execSync } = require('child_process');
      execSync('npm run test:race', { stdio: 'inherit' });
      process.exit(0);
    } else {
      console.log('⚡ Starting Production API Gateway Benchmarking Matrix Suite...\n');
    }

    const { results, resume, consoleSummary } = await runner.runMatrix(matrix);
    console.log(consoleSummary);

    // Save artifacts
    const reportGen = new ReportGenerator();
    const mdContent = results.map(r => reportGen.generateMarkdownReport(r, resume)).join('\n\n---\n\n');
    const csvContent = reportGen.generateCsvReport(results);

    const outputDir = resolve(__dirname, '..', '..', 'benchmarks', 'reports');
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseFilename = `benchmark-results-${timestamp}`;

    writeFileSync(resolve(outputDir, `${baseFilename}.json`), JSON.stringify(results, null, 2));
    writeFileSync(resolve(outputDir, `benchmark-report-${timestamp}.md`), mdContent);
    writeFileSync(resolve(outputDir, `benchmark-data-${timestamp}.csv`), csvContent);

    console.log(`📁 Artifacts successfully generated in ${outputDir}:`);
    console.log(`  - Markdown Report: ${resolve(outputDir, `benchmark-report-${timestamp}.md`)}`);
    console.log(`  - CSV Data:        ${resolve(outputDir, `benchmark-data-${timestamp}.csv`)}`);
    console.log(`  - JSON Output:     ${resolve(outputDir, `${baseFilename}.json`)}\n`);

  } catch (err: any) {
    console.error('❌ Benchmark execution failed:', err);
    process.exit(1);
  } finally {
    await redis.quit();
    await pool.end();
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Unhandled benchmark error:', err);
  process.exit(1);
});
