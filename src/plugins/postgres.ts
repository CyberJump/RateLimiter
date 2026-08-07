import fp from 'fastify-plugin';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { FastifyInstance } from 'fastify';
import * as schema from '../db/schema.js';

const { Pool } = pg;

export type Database = NodePgDatabase<typeof schema>;

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
    pgPool: pg.Pool;
  }
}

export default fp(async function postgresPlugin(fastify: FastifyInstance, opts: { connectionString: string }) {
  const pool = new Pool({
    connectionString: opts.connectionString,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pool.on('error', (err) => {
    fastify.log.error({ err }, 'Postgres pool error');
  });

  // Verify connection
  try {
    const client = await pool.connect();
    client.release();
    fastify.log.info('Postgres connected');
  } catch (err) {
    fastify.log.error({ err }, 'Postgres connection failed');
    throw err;
  }

  const db = drizzle(pool, { schema });

  fastify.decorate('db', db);
  fastify.decorate('pgPool', pool);

  fastify.addHook('onClose', async () => {
    await pool.end();
    fastify.log.info('Postgres pool closed');
  });
});
