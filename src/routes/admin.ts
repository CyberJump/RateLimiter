import type { FastifyInstance } from 'fastify';
import { randomUUID, createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { apiKeys, tiers } from '../db/schema.js';

/**
 * Admin routes for key and tier management.
 *
 * FR5: Create API keys via POST /admin/keys
 * FR7: Revoke keys via DELETE /admin/keys/:id
 * Plus: list keys, get key, list tiers, create tier, change key tier
 */
export async function adminRoutes(fastify: FastifyInstance): Promise<void> {

  // ── Tiers ────────────────────────────────────────────────────

  /** List all tiers */
  fastify.get('/admin/tiers', async (request, reply) => {
    const result = await fastify.db.select().from(tiers);
    return { tiers: result };
  });

  /** Create a new tier */
  fastify.post<{
    Body: {
      name: string;
      algorithm: 'fixed_window' | 'sliding_window' | 'token_bucket';
      limit: number;
      windowSecs: number;
      burstCapacity?: number;
    };
  }>('/admin/tiers', async (request, reply) => {
    const { name, algorithm, limit, windowSecs, burstCapacity } = request.body;

    const result = await fastify.db
      .insert(tiers)
      .values({
        name,
        algorithm,
        limit,
        windowSecs,
        burstCapacity: burstCapacity ?? null,
      })
      .returning();

    reply.code(201).send({ tier: result[0] });
  });

  // ── API Keys ─────────────────────────────────────────────────

  /** List all API keys (with tier info, key redacted) */
  fastify.get('/admin/keys', async (request, reply) => {
    const result = await fastify.db
      .select({
        id: apiKeys.id,
        tierId: apiKeys.tierId,
        tierName: tiers.name,
        algorithm: tiers.algorithm,
        createdAt: apiKeys.createdAt,
        revokedAt: apiKeys.revokedAt,
      })
      .from(apiKeys)
      .innerJoin(tiers, eq(apiKeys.tierId, tiers.id));

    return { keys: result };
  });

  /** Create a new API key (returns raw key ONCE) */
  fastify.post<{
    Body: { tierId: string };
  }>('/admin/keys', async (request, reply) => {
    const { tierId } = request.body;

    // Verify tier exists
    const tier = await fastify.db
      .select()
      .from(tiers)
      .where(eq(tiers.id, tierId))
      .limit(1);

    if (tier.length === 0) {
      reply.code(400).send({
        error: 'Bad Request',
        message: `Tier ${tierId} not found`,
      });
      return;
    }

    // Generate key with prefix for easy identification
    const rawKey = `rl_live_${randomUUID().replace(/-/g, '')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const result = await fastify.db
      .insert(apiKeys)
      .values({
        keyHash,
        tierId,
      })
      .returning();

    reply.code(201).send({
      key: {
        id: result[0].id,
        apiKey: rawKey, // Only returned once!
        tierId,
        tierName: tier[0].name,
        createdAt: result[0].createdAt,
      },
      warning: 'Store this API key securely — it will not be shown again.',
    });
  });

  /** Get a single API key's details */
  fastify.get<{
    Params: { id: string };
  }>('/admin/keys/:id', async (request, reply) => {
    const { id } = request.params;

    const result = await fastify.db
      .select({
        id: apiKeys.id,
        tierId: apiKeys.tierId,
        tierName: tiers.name,
        algorithm: tiers.algorithm,
        limit: tiers.limit,
        windowSecs: tiers.windowSecs,
        burstCapacity: tiers.burstCapacity,
        createdAt: apiKeys.createdAt,
        revokedAt: apiKeys.revokedAt,
      })
      .from(apiKeys)
      .innerJoin(tiers, eq(apiKeys.tierId, tiers.id))
      .where(eq(apiKeys.id, id))
      .limit(1);

    if (result.length === 0) {
      reply.code(404).send({
        error: 'Not Found',
        message: `API key ${id} not found`,
      });
      return;
    }

    return { key: result[0] };
  });

  /** Revoke an API key (FR7) */
  fastify.delete<{
    Params: { id: string };
  }>('/admin/keys/:id', async (request, reply) => {
    const { id } = request.params;

    const result = await fastify.db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(apiKeys.id, id))
      .returning();

    if (result.length === 0) {
      reply.code(404).send({
        error: 'Not Found',
        message: `API key ${id} not found`,
      });
      return;
    }

    return { key: result[0], message: 'API key revoked' };
  });

  /** Change a key's tier */
  fastify.put<{
    Params: { id: string };
    Body: { tierId: string };
  }>('/admin/keys/:id/tier', async (request, reply) => {
    const { id } = request.params;
    const { tierId } = request.body;

    // Verify tier exists
    const tier = await fastify.db
      .select()
      .from(tiers)
      .where(eq(tiers.id, tierId))
      .limit(1);

    if (tier.length === 0) {
      reply.code(400).send({
        error: 'Bad Request',
        message: `Tier ${tierId} not found`,
      });
      return;
    }

    const result = await fastify.db
      .update(apiKeys)
      .set({ tierId })
      .where(eq(apiKeys.id, id))
      .returning();

    if (result.length === 0) {
      reply.code(404).send({
        error: 'Not Found',
        message: `API key ${id} not found`,
      });
      return;
    }

    return {
      key: result[0],
      newTier: tier[0].name,
      message: 'Tier updated',
    };
  });
}
