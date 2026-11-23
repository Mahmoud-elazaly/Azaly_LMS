import { Pool } from 'pg';
import { readDatabaseUrl } from './env';

let pool: Pool | undefined;

async function query<T>(statement: string, parameters: unknown[]): Promise<T> {
  pool ??= new Pool({
    connectionString: readDatabaseUrl({ DATABASE_URL: process.env.AUTHORING_DATABASE_URL }),
    max: 4, connectionTimeoutMillis: 2500, statement_timeout: 5000,
  }).on('error', () => console.error('An idle authoring database connection failed.'));
  const result = await pool.query<{ result: T }>(statement, parameters);
  const row = result.rows[0];
  if (!row) throw new Error('Authoring command returned no row');
  return row.result;
}

export function authoringCommand<T>(token: string, command: string, id: string | null = null,
  payload: object | null = null, version: number | null = null) {
  return query<T>('SELECT authoring.course_command($1, $2, $3, $4, $5) AS result', [token, command, id, payload, version]);
}

export function questionCommand<T>(token: string, input: { operation: string; id?: string; question?: object; version?: number }) {
  return query<T>('SELECT authoring.bank_command($1, $2, $3, $4, $5) AS result',
    [token, input.operation, input.id ?? null, input.question ?? null, input.version ?? null]);
}

export function reviewCommand<T>(token: string, locale: string, review?: object) {
  return query<T>('SELECT authoring.guided_review_command($1, $2, $3) AS result', [token, locale, review ?? null]);
}
