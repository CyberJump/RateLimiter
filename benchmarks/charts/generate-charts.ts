import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

async function generateReport() {
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:admin@localhost:5432/ratelimiter';
  const pool = new Pool({ connectionString: databaseUrl });

  console.log('Generating Algorithm Benchmark & Evaluation Report...\n');

  try {
    // 1. Overview Statistics
    const overviewRes = await pool.query(`
      SELECT
        COUNT(*)::int as total_requests,
        SUM(CASE WHEN allowed = 1 THEN 1 ELSE 0 END)::int as allowed_requests,
        SUM(CASE WHEN allowed = 0 THEN 1 ELSE 0 END)::int as blocked_requests,
        ROUND(AVG(latency_ms)::numeric, 2) as avg_latency_ms
      FROM request_logs;
    `);

    // 2. Algorithm Comparison Breakdown
    const algoRes = await pool.query(`
      SELECT
        algorithm,
        COUNT(*)::int as total_requests,
        SUM(CASE WHEN allowed = 1 THEN 1 ELSE 0 END)::int as allowed,
        SUM(CASE WHEN allowed = 0 THEN 1 ELSE 0 END)::int as blocked,
        ROUND((SUM(CASE WHEN allowed = 0 THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0) * 100), 2) as block_percentage,
        ROUND(AVG(latency_ms)::numeric, 2) as avg_latency_ms
      FROM request_logs
      GROUP BY algorithm
      ORDER BY algorithm;
    `);

    // 3. Peak Throughput per Algorithm (Requests / Sec)
    const peakRes = await pool.query(`
      SELECT
        algorithm,
        MAX(sec_count)::int as max_req_per_sec
      FROM (
        SELECT
          algorithm,
          date_trunc('second', "timestamp") as sec,
          COUNT(*) as sec_count
        FROM request_logs
        GROUP BY algorithm, sec
      ) sub
      GROUP BY algorithm;
    `);

    const overview = overviewRes.rows[0] || {};
    const algos = algoRes.rows;
    const peaks = new Map(peakRes.rows.map((r) => [r.algorithm, r.max_req_per_sec]));

    console.log('=== BENCHMARK SUMMARY ===');
    console.log(`Total Requests Analyzed : ${overview.total_requests || 0}`);
    console.log(`Allowed Requests        : ${overview.allowed_requests || 0}`);
    console.log(`Blocked Requests (429)  : ${overview.blocked_requests || 0}`);
    console.log(`Average Latency Overhead: ${overview.avg_latency_ms || 0} ms\n`);

    console.log('| Algorithm | Total Requests | Allowed | Blocked (429) | Block % | Max Req/s | Avg Latency |');
    console.log('|---|---|---|---|---|---|---|');

    for (const a of algos) {
      const maxRps = peaks.get(a.algorithm) || 0;
      console.log(`| **${a.algorithm}** | ${a.total_requests} | ${a.allowed} | ${a.blocked} | ${a.block_percentage}% | ${maxRps} r/s | ${a.avg_latency_ms} ms |`);
    }

  } catch (err) {
    console.error('Error generating report:', (err as Error).message);
  } finally {
    await pool.end();
  }
}

generateReport();
