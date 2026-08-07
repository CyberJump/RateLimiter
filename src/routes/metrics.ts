import type { FastifyInstance } from 'fastify';
import { sql, eq, gte, lte, and } from 'drizzle-orm';
import { requestLogs, apiKeys, tiers } from '../db/schema.js';

/**
 * Metrics routes for dashboard live monitoring and historical analysis.
 */
export async function metricsRoutes(fastify: FastifyInstance): Promise<void> {

  /**
   * Live traffic metrics for the last 60 seconds.
   * Returns per-second counts of allowed vs blocked requests.
   */
  fastify.get('/admin/metrics/live', async (request, reply) => {
    const pool = fastify.pgPool;

    // Get last 60 seconds aggregated by second
    const query = `
      SELECT
        to_char(date_trunc('second', "timestamp"), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as time_bucket,
        SUM(CASE WHEN allowed = 1 THEN 1 ELSE 0 END)::int as allowed,
        SUM(CASE WHEN allowed = 0 THEN 1 ELSE 0 END)::int as blocked,
        COUNT(*)::int as total,
        AVG(latency_ms)::float as avg_latency
      FROM request_logs
      WHERE "timestamp" >= NOW() - INTERVAL '60 seconds'
      GROUP BY time_bucket
      ORDER BY time_bucket ASC;
    `;

    const result = await pool.query(query);
    return { data: result.rows };
  });

  /**
   * Aggregate summary statistics.
   * Overall allowed/blocked ratio, counts by algorithm, top API keys.
   */
  fastify.get('/admin/metrics/summary', async (request, reply) => {
    const pool = fastify.pgPool;

    // Total counts
    const totalResult = await pool.query(`
      SELECT
        COUNT(*)::int as total_requests,
        SUM(CASE WHEN allowed = 1 THEN 1 ELSE 0 END)::int as allowed_requests,
        SUM(CASE WHEN allowed = 0 THEN 1 ELSE 0 END)::int as blocked_requests,
        AVG(latency_ms)::float as avg_latency_ms
      FROM request_logs;
    `);

    // Counts by algorithm
    const algoResult = await pool.query(`
      SELECT
        algorithm,
        COUNT(*)::int as total,
        SUM(CASE WHEN allowed = 1 THEN 1 ELSE 0 END)::int as allowed,
        SUM(CASE WHEN allowed = 0 THEN 1 ELSE 0 END)::int as blocked
      FROM request_logs
      GROUP BY algorithm;
    `);

    // Counts by key / tier
    const keyResult = await pool.query(`
      SELECT
        r.api_key_id,
        t.name as tier_name,
        t.algorithm,
        COUNT(*)::int as total,
        SUM(CASE WHEN r.allowed = 1 THEN 1 ELSE 0 END)::int as allowed,
        SUM(CASE WHEN r.allowed = 0 THEN 1 ELSE 0 END)::int as blocked
      FROM request_logs r
      LEFT JOIN api_keys k ON r.api_key_id = k.id
      LEFT JOIN tiers t ON k.tier_id = t.id
      GROUP BY r.api_key_id, t.name, t.algorithm
      ORDER BY total DESC
      LIMIT 10;
    `);

    return {
      summary: totalResult.rows[0] || {
        total_requests: 0,
        allowed_requests: 0,
        blocked_requests: 0,
        avg_latency_ms: 0,
      },
      byAlgorithm: algoResult.rows,
      topKeys: keyResult.rows,
    };
  });

  /**
   * Historical metrics filterable by time range, algorithm, or api_key_id.
   */
  fastify.get<{
    Querystring: {
      from?: string;
      to?: string;
      algorithm?: string;
      apiKeyId?: string;
    };
  }>('/admin/metrics/history', async (request, reply) => {
    const { from, to, algorithm, apiKeyId } = request.query;
    const pool = fastify.pgPool;

    const conditions: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    if (from) {
      conditions.push(`"timestamp" >= $${paramIdx++}`);
      values.push(from);
    }
    if (to) {
      conditions.push(`"timestamp" <= $${paramIdx++}`);
      values.push(to);
    }
    if (algorithm) {
      conditions.push(`algorithm = $${paramIdx++}`);
      values.push(algorithm);
    }
    if (apiKeyId) {
      conditions.push(`api_key_id = $${paramIdx++}`);
      values.push(apiKeyId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT
        to_char(date_trunc('minute', "timestamp"), 'YYYY-MM-DD"T"HH24:MI:00"Z"') as time_bucket,
        algorithm,
        SUM(CASE WHEN allowed = 1 THEN 1 ELSE 0 END)::int as allowed,
        SUM(CASE WHEN allowed = 0 THEN 1 ELSE 0 END)::int as blocked,
        COUNT(*)::int as total
      FROM request_logs
      ${whereClause}
      GROUP BY time_bucket, algorithm
      ORDER BY time_bucket ASC;
    `;

    const result = await pool.query(query, values);
    return { data: result.rows };
  });
}
