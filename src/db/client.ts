import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { readDatabaseUrl } from './env';

const state = globalThis as typeof globalThis & { academyPool?: Pool };

export function database() {
  const pool = state.academyPool ??= new Pool({
    connectionString: readDatabaseUrl(),
    connectionTimeoutMillis: 2500,
    statement_timeout: 3000,
    max: 8,
  }).on('error', () => console.error('An idle database connection failed.'));
  return drizzle(pool);
}
