import Fastify from 'fastify';

const PORT = parseInt(process.env.PORT || '3001', 10);
const SIMULATED_LATENCY_MS = parseInt(process.env.SIMULATED_LATENCY_MS || '0', 10);

const server = Fastify({ logger: true });

/**
 * Mock backend echo server.
 * Returns request details for any path/method.
 * Optionally adds configurable latency to simulate real backend response times.
 */
server.all('/*', async (request, reply) => {
  // Simulate backend processing latency if configured
  if (SIMULATED_LATENCY_MS > 0) {
    await new Promise((resolve) => setTimeout(resolve, SIMULATED_LATENCY_MS));
  }

  return {
    service: 'mock-backend',
    method: request.method,
    url: request.url,
    headers: {
      'x-request-id': request.headers['x-request-id'] || null,
      'x-forwarded-for': request.headers['x-forwarded-for'] || null,
      'x-api-key': request.headers['x-api-key'] ? '[REDACTED]' : null,
    },
    timestamp: new Date().toISOString(),
    message: 'Hello from the backend! If you see this, the gateway proxy is working.',
  };
});

const start = async () => {
  try {
    await server.listen({ port: PORT, host: '0.0.0.0' });
    server.log.info(`Mock backend listening on port ${PORT}`);
    if (SIMULATED_LATENCY_MS > 0) {
      server.log.info(`Simulated latency: ${SIMULATED_LATENCY_MS}ms`);
    }
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
