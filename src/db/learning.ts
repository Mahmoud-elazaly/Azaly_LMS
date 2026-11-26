import { Pool } from 'pg';
import { readDatabaseUrl } from './env';
import type { Locale } from '../i18n/locales';

let pool: Pool | undefined;
async function query<T>(statement: string, parameters: unknown[]) {
  pool ??= new Pool({
    connectionString: readDatabaseUrl({ DATABASE_URL: process.env.LEARNER_DATABASE_URL }),
    max: 4, connectionTimeoutMillis: 2500, statement_timeout: 5000,
  }).on('error', () => console.error('An idle learner database connection failed.'));
  const response = await pool.query<{ result: T }>(statement, parameters);
  const row = response.rows[0];
  if (!row) throw new Error('Student command returned no row');
  return row.result;
}

export function learningCommand<T>(token: string, operation: string, id: string | null, locale: Locale, payload?: object) {
  return query<T>('SELECT learning.student_command($1, $2, $3, $4, $5) AS result', [token, operation, id, locale, payload ?? null]);
}

export function guidedCommand<T>(token: string, context: { operation: string; id: string; locale: Locale }, payload?: object) {
  return query<T>('SELECT learning.guided_command($1, $2, $3, $4, $5) AS result',
    [token, context.operation, context.id, context.locale, payload ?? null]);
}

export function masteryEvidence<T>(token: string, locale: Locale) {
  return query<T>(`SELECT knowledge.learner_evidence($1, $2) ||
    jsonb_build_object('interviews', interview.mastery_evidence($1)) AS result`, [token, locale]);
}

export function interviewCommand<T>(token: string, operation: string, id: string | null, payload?: object) {
  return query<T>('SELECT interview.student_command($1, $2, $3, $4) AS result', [token, operation, id, payload ?? null]);
}
