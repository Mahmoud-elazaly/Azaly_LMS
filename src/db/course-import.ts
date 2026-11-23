import { Client } from 'pg';
import type { CourseDocument } from '../features/authoring/policy.ts';
import { readDatabaseUrl } from './env.ts';

export async function importCourseDraft(document: CourseDocument, token: string) {
  const database = new Client({
    connectionString: readDatabaseUrl({ DATABASE_URL: process.env.AUTHORING_DATABASE_URL }),
    connectionTimeoutMillis: 2500, statement_timeout: 5000,
  });
  try {
    await database.connect();
    const result = await database.query<{ result: { id: string; version: number; status: 'created' | 'updated' | 'unchanged' } }>(
      'SELECT authoring.import_draft($1, $2) AS result', [token, document],
    );
    return result.rows[0].result;
  } finally {
    await database.end();
  }
}
