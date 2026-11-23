import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { Pool } from 'pg';
import { readDatabaseUrl } from '../../src/db/env';

export async function createTestLearner(name = 'Test learner') {
  if (!process.env.AUTH_TEST_OWNER_PASSWORD) throw new Error('Use the isolated identity verification database.');
  const id = randomUUID();
  const email = `learner-${id}@example.test`;
  const password = randomUUID();
  const passwordHash = await hashPassword(password);
  const pool = new Pool({ connectionString: readDatabaseUrl() });
  try {
    await pool.query(`
      WITH created AS (
        INSERT INTO identity."user" (id, name, email) VALUES ($1, $2, $3) RETURNING id
      )
      INSERT INTO identity.account (id, account_id, provider_id, user_id, password)
        SELECT $4, id, 'credential', id, $5 FROM created
    `, [id, name, email, randomUUID(), passwordHash]);
    return { id, email, password };
  } finally {
    await pool.end();
  }
}

export async function capturedInvitation(email: string) {
  const response = await fetch(`http://127.0.0.1:3101/messages?recipient=${encodeURIComponent(email)}`, {
    headers: { Authorization: 'Bearer isolated-playwright-mail' },
  });
  if (!response.ok) throw new Error(`Invitation capture returned HTTP ${response.status}`);
  const { text }: { text: string } = await response.json();
  const link = text.split('\n').find((line) => line.startsWith('http://127.0.0.1:3100/'));
  if (!link) throw new Error('Captured invitation has no local activation link');
  return new URL(link);
}
