import type { FastifyInstance } from 'fastify';
import { requestLogs } from '../db/schema.js';
import type { RequestLogEntry } from '../types/index.js';

/**
 * Batched request logger that writes to Postgres.
 *
 * Buffers log entries and flushes them in bulk to avoid
 * per-request Postgres writes bottlenecking the proxy path.
 * Flushes every 100ms or when 50 entries are buffered, whichever comes first.
 */
export class RequestLogger {
  private buffer: RequestLogEntry[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private readonly BATCH_SIZE = 50;
  private readonly FLUSH_INTERVAL_MS = 100;

  constructor(private fastify: FastifyInstance) {}

  start(): void {
    this.flushInterval = setInterval(() => {
      this.flush().catch((err) => {
        this.fastify.log.error({ err }, 'Request log flush failed');
      });
    }, this.FLUSH_INTERVAL_MS);
  }

  stop(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    // Final flush
    this.flush().catch(() => {});
  }

  log(entry: RequestLogEntry): void {
    this.buffer.push(entry);
    if (this.buffer.length >= this.BATCH_SIZE) {
      this.flush().catch((err) => {
        this.fastify.log.error({ err }, 'Request log flush failed');
      });
    }
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const entries = this.buffer.splice(0);

    try {
      await this.fastify.db.insert(requestLogs).values(
        entries.map((e) => ({
          timestamp: e.timestamp,
          apiKeyId: e.apiKeyId,
          algorithm: e.algorithm,
          allowed: e.allowed ? 1 : 0,
          latencyMs: Math.round(e.latencyMs),
          statusCode: e.statusCode,
        })),
      );
    } catch (err) {
      // Put entries back if insert failed so they can be retried
      this.buffer.unshift(...entries);
      throw err;
    }
  }
}
