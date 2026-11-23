import { createServer } from 'node:http';
import { Pool } from 'pg';
import { checkerVersion, HttpError, isUpstream, readJson, respond, serve, templateVersion, tokenPattern, uuid } from './protocol.mjs';

const { REAL_LAB_DATABASE_URL: databaseUrl, LAB_CONTROLLER_URL: controllerUrl, LAB_CONTROLLER_SECRET: secret } = process.env;
const endpoint = new URL(controllerUrl ?? '');
if (!databaseUrl || !tokenPattern.test(secret ?? '') || endpoint.username || endpoint.password ||
    (endpoint.protocol !== 'https:' && endpoint.origin !== 'http://lab-controller:8401')) {
  throw new Error('Invalid lab gateway configuration.');
}
const db = new Pool({ connectionString: databaseUrl, max: 4, connectionTimeoutMillis: 2500, statement_timeout: 6000 });
db.on('error', () => console.error('Lab gateway database connection failed.'));

async function query(sql, parameters = []) {
  const { rows } = await db.query(sql, parameters);
  return rows[0].value;
}

async function control(input) {
  const response = await fetch(new URL('/control', endpoint), {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(16_000),
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ templateVersion, ...input }),
  });
  if (!response.ok) throw new HttpError(response.status === 409 ? 409 : 503);
  return response.json();
}

function validCheck(result) {
  return result?.checkerVersion === checkerVersion && typeof result.configurationOk === 'boolean' &&
    typeof result.responseOk === 'boolean';
}

async function dispatch(job) {
  let result;
  try {
    result = await control({ id: job.id, operation: job.operation, expiresAt: job.expiresAt });
    if (job.operation === 'check' ? !validCheck(result) : result?.ok !== true) throw new Error('Untrusted lab worker reply');
  } catch {
    result = null;
    console.error(JSON.stringify({ event: 'lab_job_failed', operation: job.operation, attempt: job.id }));
  }
  await query('SELECT real_lab.finish($1, $2, $3, $4, $5, $6) AS value', [
    job.id, job.lease, result !== null, result?.configurationOk ?? null, result?.responseOk ?? null,
    result?.checkerVersion ?? null,
  ]);
}

async function reconcile() {
  const { ids } = await control({ operation: 'inventory' });
  if (!Array.isArray(ids) || ids.length > 64 || !ids.every((id) => typeof id === 'string' && uuid.test(id))) {
    throw new Error('Invalid lab inventory');
  }
  const orphans = await query('SELECT real_lab.reconcile($1::uuid[]) AS value', [ids]);
  for (const id of orphans) {
    try {
      await control({ id, operation: 'destroy' });
      console.info(JSON.stringify({ event: 'lab_orphan_removed', attempt: id }));
    } catch {
      console.error(JSON.stringify({ event: 'lab_orphan_cleanup_failed', attempt: id }));
    }
  }
}

let reconcileAt = 0;
async function work() {
  try {
    const job = await query('SELECT real_lab.claim() AS value');
    if (job) await dispatch(job);
    if (Date.now() >= reconcileAt) {
      reconcileAt = Date.now() + 5000;
      await reconcile();
    }
  } catch {
    console.error('Lab job processing or reconciliation failed. Retrying.');
  } finally {
    setTimeout(work, 500).unref();
  }
}

const server = createServer(serve(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health') return respond(response, 200, { ok: true });
  if (request.method !== 'POST' || request.url !== '/session') throw new HttpError(404);
  const { grant, upstream, ...unknownFields } = await readJson(request);
  if (Object.keys(unknownFields).length || typeof grant !== 'string' || !tokenPattern.test(grant) ||
      (upstream !== undefined && !isUpstream(upstream))) throw new HttpError(400);

  const access = await query('SELECT real_lab.consume($1) AS value', [grant]);
  if (!access) throw new HttpError(403);
  if ((access.operation === 'apply') !== isUpstream(upstream)) throw new HttpError(400);
  const output = await control({ id: access.id, operation: access.operation, upstream });
  respond(response, 200, output);
}));
server.requestTimeout = 20_000;
server.listen(8400, '0.0.0.0');
void work();
