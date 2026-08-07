import type { FastifyInstance } from 'fastify';

/**
 * Health check endpoint.
 * Verifies Redis and Postgres connectivity.
 */
export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/health', async (request, reply) => {
    const checks: Record<string, string> = {};

    // Check Redis
    try {
      const pong = await fastify.redis.ping();
      checks.redis = pong === 'PONG' ? 'ok' : 'degraded';
    } catch {
      checks.redis = 'error';
    }

    // Check Postgres
    try {
      const client = await fastify.pgPool.connect();
      await client.query('SELECT 1');
      client.release();
      checks.postgres = 'ok';
    } catch {
      checks.postgres = 'error';
    }

    const allOk = Object.values(checks).every((v) => v === 'ok');

    reply.code(allOk ? 200 : 503).send({
      status: allOk ? 'healthy' : 'unhealthy',
      checks,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });
}
