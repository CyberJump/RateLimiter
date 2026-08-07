import { pgTable, uuid, text, integer, timestamp, pgEnum } from 'drizzle-orm/pg-core';

/** Algorithm enum for tier configuration */
export const algorithmEnum = pgEnum('algorithm', [
  'fixed_window',
  'sliding_window',
  'token_bucket',
]);

/** Rate-limit tiers (free, pro, enterprise, etc.) */
export const tiers = pgTable('tiers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  algorithm: algorithmEnum('algorithm').notNull(),
  limit: integer('limit').notNull(),
  windowSecs: integer('window_secs').notNull(),
  burstCapacity: integer('burst_capacity'),
});

/** API keys, each linked to a tier */
export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  keyHash: text('key_hash').notNull().unique(),
  tierId: uuid('tier_id')
    .references(() => tiers.id)
    .notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

/** Request logs for observability and benchmarking */
export const requestLogs = pgTable('request_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
  apiKeyId: uuid('api_key_id').references(() => apiKeys.id),
  algorithm: text('algorithm').notNull(),
  allowed: integer('allowed').notNull(), // 1 = allowed, 0 = blocked (pg doesn't have native bool in drizzle easily)
  latencyMs: integer('latency_ms').notNull(),
  statusCode: integer('status_code').notNull(),
});
