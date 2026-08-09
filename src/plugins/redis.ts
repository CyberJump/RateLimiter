import fp from 'fastify-plugin';
import { Redis } from 'ioredis';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';

const __dirname = dirname(fileURLToPath(import.meta.url));

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
  }
}

export default fp(async function redisPlugin(fastify: FastifyInstance, opts: { url: string }) {
  const redis = new Redis(opts.url, {
    maxRetriesPerRequest: 3,
    retryStrategy(times: number) {
      const delay = Math.min(times * 200, 2000);
      return delay;
    },
    lazyConnect: false,
  });

  redis.on('error', (err: Error) => {
    fastify.log.error({ err }, 'Redis connection error');
  });

  redis.on('connect', () => {
    fastify.log.info('Redis connected');
  });

  // Load and register Lua scripts as custom commands
  const luaDir = resolve(__dirname, '..', 'rate-limiters', 'lua');

  try {
    const fixedWindowLua = readFileSync(resolve(luaDir, 'fixed-window.lua'), 'utf-8');
    redis.defineCommand('fixedWindowCheck', {
      numberOfKeys: 1,
      lua: fixedWindowLua,
    });

    const slidingWindowLua = readFileSync(resolve(luaDir, 'sliding-window.lua'), 'utf-8');
    redis.defineCommand('slidingWindowCheck', {
      numberOfKeys: 1,
      lua: slidingWindowLua,
    });

    const tokenBucketLua = readFileSync(resolve(luaDir, 'token-bucket.lua'), 'utf-8');
    redis.defineCommand('tokenBucketCheck', {
      numberOfKeys: 1,
      lua: tokenBucketLua,
    });

    fastify.log.info('Lua scripts registered');

    // Eagerly pre-cache Lua script SHA hashes in Redis to eliminate first-request NOSCRIPT fallbacks
    await Promise.all([
      redis.script('LOAD', fixedWindowLua).catch(() => {}),
      redis.script('LOAD', slidingWindowLua).catch(() => {}),
      redis.script('LOAD', tokenBucketLua).catch(() => {}),
    ]);
  } catch (err) {
    fastify.log.warn({ err }, 'Some Lua scripts not found — will be loaded when available');
  }

  fastify.decorate('redis', redis);

  fastify.addHook('onClose', async () => {
    await redis.quit();
    fastify.log.info('Redis connection closed');
  });
});
