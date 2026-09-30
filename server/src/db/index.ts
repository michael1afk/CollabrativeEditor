import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export { schema };

const DATABASE_URL = process.env['DATABASE_URL'];

if (!DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set. Copy server/.env.example to server/.env, or run `docker compose up -d`.',
  );
}

/**
 * The connection pool.
 *
 * postgres-js pools by default; `max` caps concurrent connections so a burst of
 * snapshot writes cannot exhaust Postgres. Snapshot rows hold binary state, so
 * the driver must hand back Buffers untouched - it does for bytea, and
 * db/schema.ts maps that column accordingly.
 */
export const sql = postgres(DATABASE_URL, {
  max: Number(process.env['DATABASE_POOL_MAX'] ?? 10),
  idle_timeout: 20,
  connect_timeout: 10,
  onnotice: () => {},
});

export const db = drizzle(sql, { schema });

export type Database = typeof db;

/** Closes the pool. Called on shutdown so the process can exit cleanly. */
export async function closeDb(): Promise<void> {
  await sql.end({ timeout: 5 });
}
