import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import redisPlugin from './plugins/redis.js';
import postgresPlugin from './plugins/postgres.js';
import proxyPlugin from './plugins/proxy.js';
import { healthRoutes } from './routes/health.js';
import { adminRoutes } from './routes/admin.js';
import { metricsRoutes } from './routes/metrics.js';
import { loadTestRoutes } from './routes/load-test.js';
import { telemetryRoutes } from './routes/telemetry.js';
import { authenticate } from './middleware/authenticate.js';
import { rateLimit } from './middleware/rate-limit.js';
import { RequestLogger } from './logging/request-logger.js';
import { randomUUID } from 'node:crypto';

const server = Fastify({
  logger: {
    level: config.nodeEnv === 'production' ? 'info' : 'debug',
  },
  genReqId: () => randomUUID(),
});

// ── Plugins ─────────────────────────────────────────────────────

await server.register(cors, { origin: true });
await server.register(redisPlugin, { url: config.redisUrl });
await server.register(postgresPlugin, { connectionString: config.databaseUrl });
await server.register(proxyPlugin, { backendUrl: config.backendUrl });

// ── Routes (no auth required) ───────────────────────────────────

await server.register(healthRoutes);
await server.register(adminRoutes);
await server.register(metricsRoutes);
await server.register(loadTestRoutes);
await server.register(telemetryRoutes);

// ── Request logger ──────────────────────────────────────────────

const requestLogger = new RequestLogger(server);
requestLogger.start();

server.addHook('onClose', async () => {
  requestLogger.stop();
});

// ── Proxied routes (auth + rate limit via setNotFoundHandler) ───

// Catch-all proxy for all backend routes not explicitly defined above (like /health or /admin)
server.setNotFoundHandler({
  preHandler: [authenticate, rateLimit],
}, async (request, reply) => {
  const startTime = Date.now();

  // Proxy the request to the backend
  await reply.from(request.url, {
    rewriteRequestHeaders: (_originalReq, headers) => {
      return {
        ...headers,
        'x-request-id': request.id,
        'x-forwarded-for': request.ip,
      };
    },
  });

  // Log the allowed request after proxying
  const latencyMs = Date.now() - startTime;

  if (request.rateLimit) {
    requestLogger.log({
      timestamp: new Date(),
      apiKeyId: request.rateLimit.apiKeyId,
      algorithm: request.rateLimit.tier.algorithm,
      allowed: true,
      latencyMs,
      statusCode: reply.statusCode,
    });
  }
});

// Also log rate-limited (429) and auth-failed (401) requests
server.addHook('onResponse', async (request, reply) => {
  if (reply.statusCode === 429 && request.rateLimit) {
    requestLogger.log({
      timestamp: new Date(),
      apiKeyId: request.rateLimit.apiKeyId,
      algorithm: request.rateLimit.tier.algorithm,
      allowed: false,
      latencyMs: reply.elapsedTime,
      statusCode: 429,
    });
  }
});

// ── Start ───────────────────────────────────────────────────────

const start = async () => {
  try {
    await server.listen({ port: config.port, host: '0.0.0.0' });
    server.log.info(`Gateway listening on port ${config.port}`);
    server.log.info(`Proxying to backend at ${config.backendUrl}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async (signal: string) => {
  server.log.info(`Received ${signal}, shutting down gracefully...`);
  await server.close();
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();
