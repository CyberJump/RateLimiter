import { Redis } from 'ioredis';
import { BenchmarkRunner } from './benchmark-runner.js';
import { ReportGenerator } from './report-generator.js';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);

  const redis = new Redis({
    host: redisHost,
    port: redisPort,
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });

  console.log(`Connecting to Redis at ${redisHost}:${redisPort}...`);

  try {
    const runner = new BenchmarkRunner(redis);
    console.log('⚡ Starting Production API Gateway Benchmarking Matrix Suite...\n');

    const { results, resume, consoleSummary } = await runner.runMatrix();
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
    const mdPath = resolve(outputDir, `benchmark-report-${timestamp}.md`);
    const csvPath = resolve(outputDir, `benchmark-data-${timestamp}.csv`);
    const jsonPath = resolve(outputDir, `benchmark-results-${timestamp}.json`);

    writeFileSync(mdPath, mdContent, 'utf-8');
    writeFileSync(csvPath, csvContent, 'utf-8');
    writeFileSync(jsonPath, JSON.stringify({ results, resume }, null, 2), 'utf-8');

    console.log(`📁 Artifacts successfully generated in ${outputDir}:`);
    console.log(`  - Markdown Report: ${mdPath}`);
    console.log(`  - CSV Data:        ${csvPath}`);
    console.log(`  - JSON Output:     ${jsonPath}`);
  } catch (err) {
    console.error('❌ Benchmark CLI Execution Failed:', err);
  } finally {
    await redis.quit();
  }
}

main().catch(console.error);
