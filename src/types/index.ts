/** Supported rate-limiting algorithms */
export type Algorithm = 'fixed_window' | 'sliding_window' | 'token_bucket';

/** Tier configuration as stored in Postgres */
export interface Tier {
  id: string;
  name: string;
  algorithm: Algorithm;
  limit: number;
  windowSecs: number;
  burstCapacity: number | null;
}

/** API key record joined with tier info */
export interface ApiKeyRecord {
  id: string;
  keyHash: string;
  tierId: string;
  createdAt: Date;
  revokedAt: Date | null;
  tier: Tier;
}

/** Result of a rate-limit check */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;       // Unix timestamp in seconds
  currentCount: number;  // For observability
}

/** Decorated request properties added by authenticate middleware */
export interface RequestContext {
  apiKeyId: string;
  tier: Tier;
}

/** Request log entry for observability */
export interface RequestLogEntry {
  timestamp: Date;
  apiKeyId: string;
  algorithm: Algorithm;
  allowed: boolean;
  latencyMs: number;
  statusCode: number;
}
