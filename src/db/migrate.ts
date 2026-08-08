import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { config } from '../config.js';
import * as schema from './schema.js';

const { Pool } = pg;

async function migrate() {
  // Extract database name from connection string and create if missing
  const dbUrl = new URL(config.databaseUrl);
  const targetDb = dbUrl.pathname.replace(/^\//, '');

  if (targetDb) {
    const rootUrl = new URL(config.databaseUrl);
    rootUrl.pathname = '/postgres';
    const rootPool = new Pool({ connectionString: rootUrl.toString() });
    try {
      const res = await rootPool.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [targetDb]);
      if (res.rowCount === 0) {
        console.log(`Database "${targetDb}" does not exist. Creating it...`);
        await rootPool.query(`CREATE DATABASE "${targetDb}"`);
        console.log(`Database "${targetDb}" created successfully.`);
      }
    } catch (err) {
      console.warn('Could not auto-create database (might require manual creation):', (err as Error).message);
    } finally {
      await rootPool.end();
    }
  }

  const pool = new Pool({ connectionString: config.databaseUrl });
  const db = drizzle(pool, { schema });

  console.log('Running migrations...');

  await pool.query(`
    DO $$ BEGIN
      CREATE TYPE algorithm AS ENUM ('fixed_window', 'sliding_window', 'token_bucket');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Create tiers table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tiers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
      algorithm algorithm NOT NULL,
      "limit" INTEGER NOT NULL,
      window_secs INTEGER NOT NULL,
      burst_capacity INTEGER
    );
  `);

  // Create api_keys table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      key_hash TEXT NOT NULL UNIQUE,
      tier_id UUID NOT NULL REFERENCES tiers(id),
      algorithm TEXT,
      "limit" INTEGER,
      window_secs INTEGER,
      burst_capacity INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      revoked_at TIMESTAMPTZ
    );
  `);

  // Ensure override columns exist for Priority 1 overrides
  await pool.query(`
    ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS algorithm TEXT;
    ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS "limit" INTEGER;
    ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS window_secs INTEGER;
    ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS burst_capacity INTEGER;
  `);

  // Create request_logs table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS request_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "timestamp" TIMESTAMPTZ NOT NULL DEFAULT now(),
      api_key_id UUID REFERENCES api_keys(id),
      algorithm TEXT NOT NULL,
      allowed INTEGER NOT NULL,
      latency_ms INTEGER NOT NULL,
      status_code INTEGER NOT NULL
    );
  `);

  // Create benchmark_runs table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS benchmark_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "timestamp" TIMESTAMPTZ NOT NULL DEFAULT now(),
      algorithm TEXT NOT NULL,
      pattern TEXT NOT NULL,
      target_key_id TEXT NOT NULL,
      rate_req_sec INTEGER NOT NULL,
      duration_secs INTEGER NOT NULL,
      concurrency INTEGER NOT NULL,
      total_requests INTEGER NOT NULL,
      allowed_count INTEGER NOT NULL,
      blocked_count INTEGER NOT NULL,
      actual_rps INTEGER NOT NULL,
      avg_latency_ms INTEGER NOT NULL,
      p95_latency_ms INTEGER NOT NULL,
      limiter_accuracy INTEGER NOT NULL,
      status TEXT NOT NULL,
      report_summary TEXT
    );
  `);

  console.log('Migrations complete.');
  await pool.end();
  process.exit(0);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
