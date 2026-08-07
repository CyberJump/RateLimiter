import fp from 'fastify-plugin';
import replyFrom from '@fastify/reply-from';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';

export default fp(async function proxyPlugin(fastify: FastifyInstance, opts: { backendUrl: string }) {
  await fastify.register(replyFrom, {
    base: opts.backendUrl,
    undici: {
      connections: 128,
      pipelining: 1,
      keepAliveTimeout: 60_000,
    },
  });

  fastify.log.info(`Proxy configured → ${opts.backendUrl}`);
});
