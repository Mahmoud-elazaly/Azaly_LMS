import { Pool } from 'pg';
import { readDatabaseUrl } from './env';

let pool: Pool | undefined;

export async function authoringCommand<T>(token: string, command: string, id: string | null = null,
  payload: object | null = null, version: number | null = null): Promise<T> {
  pool ??= new Pool({
    connectionString: readDatabaseUrl({ DATABASE_URL: process.env.AUTHORING_DATABASE_URL }),
    max: 4, connectionTimeoutMillis: 2500, statement_timeout: 5000,
  }).on('error', () => console.error('An idle authoring database connection failed.'));
  const result = await pool.query<{ result: T }>(
    'SELECT authoring.course_command($1, $2, $3, $4, $5) AS result',
    [token, command, id, payload, version],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Authoring command returned no row');
  return row.result;
}
