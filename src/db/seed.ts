import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { config } from '../config.js';
import * as schema from './schema.js';

const { Pool } = pg;

async function seed() {
  const pool = new Pool({ connectionString: config.databaseUrl });
  const db = drizzle(pool, { schema });

  console.log('Seeding default tiers...');

  // Upsert default tiers (idempotent)
  await pool.query(`
    INSERT INTO tiers (name, algorithm, "limit", window_secs, burst_capacity)
    VALUES
      ('free', 'fixed_window', 10, 60, NULL),
      ('pro', 'sliding_window', 100, 60, NULL),
      ('enterprise', 'token_bucket', 500, 60, 50)
    ON CONFLICT (name) DO UPDATE SET
      algorithm = EXCLUDED.algorithm,
      "limit" = EXCLUDED."limit",
      window_secs = EXCLUDED.window_secs,
      burst_capacity = EXCLUDED.burst_capacity;
  `);

  console.log('Seeded tiers: free (fixed_window, 10/60s), pro (sliding_window, 100/60s), enterprise (token_bucket, 500/60s, burst=50)');
  await pool.end();
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
