import { createHash } from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { apiKeys, tiers } from '../db/schema.js';
import type { Tier, RequestContext } from '../types/index.js';

const tierCache = new Map<string, { data: RequestContext; expiresAt: number }>();
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
 * - Extracts `X-API-Key` header
 * - SHA-256 hashes the key
 * - Looks up key + tier in Postgres (with 1s LRU cache)
 * - Rejects with 401 if invalid or revoked
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

  // Check cache first
  const cached = tierCache.get(keyHash);
  if (cached && cached.expiresAt > Date.now()) {
    request.rateLimit = cached.data;
    return;
  }

  // Look up in Postgres
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

  if (result.length === 0) {
    reply.code(401).send({
      error: 'Unauthorized',
      message: 'Invalid API key',
    });
    return;
  }

  const row = result[0];

  if (row.revokedAt !== null) {
    reply.code(401).send({
      error: 'Unauthorized',
      message: 'API key has been revoked',
    });
    return;
  }

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

  // Cache for 1s
  tierCache.set(keyHash, {
    data: context,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  request.rateLimit = context;
}
