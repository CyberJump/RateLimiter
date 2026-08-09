import { createHash, randomUUID } from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { apiKeys, tiers } from '../db/schema.js';
import type { Tier, RequestContext } from '../types/index.js';

// Local L1 Process Cache
const tierCache = new Map<string, { data: RequestContext; expiresAt: number }>();
// Single-flight in-flight promise map per process
const pendingQueries = new Map<string, Promise<RequestContext | null>>();
const CACHE_TTL_MS = 1000; // 1 second

declare module 'fastify' {
  interface FastifyRequest {
    rateLimit: RequestContext;
  }
}

/**
 * Fastify preHandler hook that validates the API key and decorates
 * the request with the key's tier configuration.
 *
 * Distributed Stampede Protection Architecture:
 * 1. Checks local in-memory L1 cache (`tierCache`)
 * 2. Checks shared L2 Redis cache (`ratelimit:cache:tier:${keyHash}`)
 * 3. Acquires Redis Distributed Lock (`SET lock:auth:${keyHash} lockVal NX PX 2000`)
 * 4. The single winning replica across the cluster queries PostgreSQL and populates L2 Redis + L1 local caches
 * 5. Other replicas poll the shared L2 Redis cache until populated
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const apiKey = request.headers['x-api-key'];

  if (!apiKey || typeof apiKey !== 'string') {
    reply.code(401).send({
      error: 'Unauthorized',
      message: 'Missing X-API-Key header',
    });
    return;
  }

  const keyHash = createHash('sha256').update(apiKey).digest('hex');
  const redis = request.server.redis;

  // 1. Check local L1 cache first
  const cachedL1 = tierCache.get(keyHash);
  if (cachedL1 && cachedL1.expiresAt > Date.now()) {
    request.rateLimit = cachedL1.data;
    return;
  }

  // 2. Check local single-flight in-flight promise map for this process
  let queryPromise = pendingQueries.get(keyHash);

  if (!queryPromise) {
    queryPromise = (async (): Promise<RequestContext | null> => {
      // 3. Check shared L2 Redis cache
      const redisCacheKey = `ratelimit:cache:tier:${keyHash}`;
      try {
        const cachedL2Json = await redis.get(redisCacheKey);
        if (cachedL2Json) {
          if (cachedL2Json === 'INVALID') return null;
          const context: RequestContext = JSON.parse(cachedL2Json);
          tierCache.set(keyHash, { data: context, expiresAt: Date.now() + CACHE_TTL_MS });
          return context;
        }
      } catch {
        // Fall back on Redis failure
      }

      // 4. Try acquiring Redis Distributed Lock across cluster
      const lockKey = `lock:auth:${keyHash}`;
      const lockVal = randomUUID();
      let acquired = false;

      try {
        const lockRes = await redis.set(lockKey, lockVal, 'PX', 2000, 'NX');
        acquired = lockRes === 'OK';
      } catch {
        acquired = true; // Fall back to executing query on Redis lock error
      }

      if (acquired) {
        try {
          // Increment global Redis-backed PostgreSQL query counter across cluster
          try {
            await redis.incr('ratelimit:metrics:postgres_queries');
          } catch {}

          // Query PostgreSQL
          const db = request.server.db;
          const result = await db
            .select({
              keyId: apiKeys.id,
              keyHash: apiKeys.keyHash,
              revokedAt: apiKeys.revokedAt,
              tierId: tiers.id,
              tierName: tiers.name,
              algorithm: tiers.algorithm,
              limit: tiers.limit,
              windowSecs: tiers.windowSecs,
              burstCapacity: tiers.burstCapacity,
            })
            .from(apiKeys)
            .innerJoin(tiers, eq(apiKeys.tierId, tiers.id))
            .where(eq(apiKeys.keyHash, keyHash))
            .limit(1);

          if (result.length === 0 || result[0].revokedAt !== null) {
            try {
              await redis.set(redisCacheKey, 'INVALID', 'EX', 1);
            } catch {}
            return null;
          }

          const row = result[0];
          const tier: Tier = {
            id: row.tierId,
            name: row.tierName,
            algorithm: row.algorithm,
            limit: row.limit,
            windowSecs: row.windowSecs,
            burstCapacity: row.burstCapacity,
          };

          const context: RequestContext = {
            apiKeyId: row.keyId,
            tier,
          };

          // Populate shared L2 Redis cache and local L1 cache
          try {
            await redis.set(redisCacheKey, JSON.stringify(context), 'EX', 2);
          } catch {}

          tierCache.set(keyHash, { data: context, expiresAt: Date.now() + CACHE_TTL_MS });
          return context;
        } finally {
          // Release Redis Distributed Lock safely if lockVal matches
          try {
            const currentLock = await redis.get(lockKey);
            if (currentLock === lockVal) {
              await redis.del(lockKey);
            }
          } catch {}
        }
      } else {
        // 5. Another replica acquired the lock — poll shared L2 Redis cache until populated
        for (let attempt = 0; attempt < 25; attempt++) {
          await new Promise((res) => setTimeout(res, 15));
          try {
            const cachedL2Json = await redis.get(redisCacheKey);
            if (cachedL2Json) {
              if (cachedL2Json === 'INVALID') return null;
              const context: RequestContext = JSON.parse(cachedL2Json);
              tierCache.set(keyHash, { data: context, expiresAt: Date.now() + CACHE_TTL_MS });
              return context;
            }
          } catch {}
        }
        return null;
      }
    })();

    pendingQueries.set(keyHash, queryPromise);
    queryPromise.finally(() => {
      pendingQueries.delete(keyHash);
    });
  }

  const context = await queryPromise;

  if (!context) {
    reply.code(401).send({
      error: 'Unauthorized',
      message: 'Invalid or revoked API key',
    });
    return;
  }

  request.rateLimit = context;
}
