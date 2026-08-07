import type { FastifyRequest, FastifyReply } from 'fastify';
import { getRateLimiter } from '../rate-limiters/factory.js';

/**
 * Fastify preHandler hook that enforces rate limits.
 *
 * Must run AFTER the authenticate middleware, which decorates
 * the request with `rateLimit: { apiKeyId, tier }`.
 *
 * - Selects the correct algorithm based on tier config
 * - Calls the atomic Lua script via Redis
 * - Sets rate-limit response headers (FR2)
 * - Returns 429 with JSON body if over limit (FR4)
 */
export async function rateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { apiKeyId, tier } = request.rateLimit;
  const redis = request.server.redis;

  // Fail closed: if Redis is unreachable, reject the request (NFR)
  try {
    const limiter = getRateLimiter(tier.algorithm, redis);

    const result = await limiter.check(
      apiKeyId,
      tier.limit,
      tier.windowSecs,
      tier.burstCapacity ?? undefined,
    );

    // Always set rate-limit headers (FR2)
    reply.header('X-RateLimit-Limit', tier.limit);
    reply.header('X-RateLimit-Remaining', result.remaining);
    reply.header('X-RateLimit-Reset', result.resetAt);

    // Store result on request for logging
    (request as any).rateLimitResult = result;

    if (!result.allowed) {
      const retryAfter = Math.max(1, result.resetAt - Math.floor(Date.now() / 1000));
      reply.header('Retry-After', retryAfter);

      reply.code(429).send({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Limit: ${tier.limit} requests per ${tier.windowSecs}s`,
        retryAfter,
      });
      return;
    }
  } catch (err) {
    // Fail closed: Redis error → reject request
    request.server.log.error({ err }, 'Rate limit check failed — failing closed');
    reply.code(503).send({
      error: 'Service Unavailable',
      message: 'Rate limiter temporarily unavailable',
    });
    return;
  }
}
