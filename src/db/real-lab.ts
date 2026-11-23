import { Pool } from 'pg';
import { readDatabaseUrl } from './env';

let pool: Pool | undefined;

export async function studentLabCommand(token: string, operation: string, id: string | null) {
  pool ??= new Pool({
    connectionString: readDatabaseUrl({ DATABASE_URL: process.env.LEARNER_DATABASE_URL }),
    max: 3, connectionTimeoutMillis: 2500, statement_timeout: 5000,
  }).on('error', () => console.error('A real lab database connection failed.'));
  const { rows } = await pool.query<{ value: unknown }>('SELECT real_lab.student($1, $2, $3) AS value', [token, operation, id]);
  return rows[0].value;
}
