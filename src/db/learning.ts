import { Pool } from 'pg';
import { readDatabaseUrl } from './env';
import type { Locale } from '../i18n/locales';

let pool: Pool | undefined;
export async function learningCommand<T>(token: string, operation: string, id: string | null, locale: Locale, payload?: object) {
  pool ??= new Pool({
    connectionString: readDatabaseUrl({ DATABASE_URL: process.env.LEARNER_DATABASE_URL }),
    max: 4, connectionTimeoutMillis: 2500, statement_timeout: 5000,
  }).on('error', () => console.error('An idle learner database connection failed.'));
  const response = await pool.query<{ result: T }>(
    'SELECT learning.student_command($1, $2, $3, $4, $5) AS result',
    [token, operation, id, locale, payload ?? null],
  );
  const row = response.rows[0];
  if (!row) throw new Error('Student command returned no row');
  return row.result;
}
