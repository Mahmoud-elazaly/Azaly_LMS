import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { hashPassword } from 'better-auth/crypto';
import pg from 'pg';
import { z } from 'zod';

class OperatorError extends Error {}

const { Pool } = pg;
const ownerInput = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().max(254).toLowerCase().pipe(z.email()),
  password: z.string().min(12).max(128),
});

function readInput() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    throw new OperatorError('Provide the requested credentials as JSON on stdin.');
  }
}

async function bootstrap(client) {
  const owner = await client.query('SELECT id, banned FROM identity."user" WHERE role = $1 LIMIT 1', ['OWNER']);
  if (owner.rowCount) {
    if (owner.rows[0].banned) throw new OperatorError('An inactive Owner already exists. Contact the database operator.');
    return 'An Owner already exists. No changes made.';
  }

  const result = ownerInput.safeParse(readInput());
  if (!result.success) throw new OperatorError('Provide a name, a valid email, and a password of 12–128 characters.');
  const { name, email, password } = result.data;
  const id = randomUUID();
  const created = await client.query(
    'INSERT INTO identity."user" (id, name, email) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING RETURNING id',
    [id, name, email],
  );
  if (!created.rowCount) throw new OperatorError('An account already uses that email. Choose an unused address.');

  await client.query(
    'INSERT INTO identity.account (id, account_id, provider_id, user_id, password) VALUES ($1, $2, $3, $2, $4)',
    [randomUUID(), id, 'credential', await hashPassword(password)],
  );
  await client.query('UPDATE identity."user" SET role = $1, updated_at = now() WHERE id = $2', ['OWNER', id]);
  await client.query(
    'INSERT INTO identity.audit_event (actor_id, target_id, previous_role, new_role) VALUES ($1, $2, $3, $4)',
    ['system:owner-bootstrap', id, 'STUDENT', 'OWNER'],
  );
  return 'Owner initialized.';
}

const databaseLogins = {
  provision: ['academy_auth', 'academy_auth_runtime'],
  'provision-authoring': ['academy_author', 'academy_authoring_runtime'],
  'provision-real-lab': ['academy_real_lab_bridge', 'academy_real_lab_runtime'],
  'provision-learner': ['academy_learner', 'academy_learner_runtime'],
};

async function provision(client, [login, group]) {
  const result = z.object({ password: z.string().regex(/^[a-f0-9]{64}$/) }).safeParse(readInput());
  if (!result.success) throw new OperatorError('Provide a password generated with openssl rand -hex 32.');
  const existing = await client.query(
    `SELECT rolcanlogin AND rolinherit AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
      AND pg_has_role(login.oid, $2::name, 'USAGE')
      AND NOT EXISTS (
        SELECT FROM pg_roles other
        WHERE other.rolname IN ('academy_reader', 'academy_auth_runtime', 'academy_authoring_runtime', 'academy_learner_runtime', 'academy_real_lab_runtime', 'academy_real_lab_definer')
          AND other.rolname <> $2 AND pg_has_role(login.oid, other.oid, 'MEMBER')
      ) AS permitted
      FROM pg_roles login WHERE rolname = $1`, [login, group],
  );
  if (existing.rowCount) {
    if (!existing.rows[0].permitted) throw new OperatorError('Existing database login has unexpected privileges.');
    return 'Database login already exists. Its password was preserved.';
  }

  // The migration role owns PostgreSQL administration. Keep credentials out of
  // statement and bind-parameter logs for this provisioning transaction.
  await client.query("SET LOCAL log_statement = 'none'");
  await client.query('SET LOCAL log_parameter_max_length = 0');
  await client.query('SET LOCAL log_parameter_max_length_on_error = 0');
  await client.query("SET LOCAL log_min_error_statement = 'panic'");
  const statement = await client.query(
    "SELECT format('CREATE ROLE %I LOGIN INHERIT PASSWORD %L', $1::text, $2::text) AS ddl",
    [login, result.data.password],
  );
  await client.query(statement.rows[0].ddl);
  await client.query(`GRANT ${group} TO ${login}`);
  return 'Database login created.';
}

async function main() {
  const command = process.argv[2];
  if (command !== 'bootstrap' && !Object.hasOwn(databaseLogins, command)) throw new OperatorError('Unknown identity command.');
  if (!process.env.DATABASE_URL) throw new OperatorError('A migration-owner DATABASE_URL is required.');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 2500 });
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Serialize each administrative operation across CLI invocations.
      await client.query('SELECT pg_advisory_xact_lock($1, $2)', [1861653101, command === 'bootstrap' ? 1 : 2]);
      const message = await (command === 'bootstrap' ? bootstrap(client) : provision(client, databaseLogins[command]));
      await client.query('COMMIT');
      console.log(message);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof OperatorError ? error.message : 'Identity operation failed. No changes were applied.');
  process.exitCode = 1;
});
