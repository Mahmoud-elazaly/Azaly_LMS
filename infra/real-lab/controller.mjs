import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { blueDirective, checkRouting, greenDirective } from './checker.mjs';
import { HttpError, isUpstream, readJson, respond, sameSecret, serve, templateVersion, tokenPattern, uuid } from './protocol.mjs';

const { LAB_CONTROLLER_SECRET: secret, LAB_NAMESPACE: namespace, LAB_SANDBOX_IMAGE: image } = process.env;
if (!tokenPattern.test(secret ?? '') || !/^[a-z0-9][a-z0-9-]{0,42}$/.test(namespace ?? '') ||
    !/^sha256:[a-f0-9]{64}$/.test(image ?? '')) throw new Error('Invalid approved lab worker configuration.');

const projectLabel = 'azaly.real-lab.project';
const attemptLabel = 'azaly.real-lab.attempt';
const expiryLabel = 'azaly.real-lab.expires';
const filters = ['--filter', `label=${projectLabel}=${namespace}`];
const inFlight = new Map();
const dockerExec = promisify(execFile);

async function docker(...args) {
  const { stdout } = await dockerExec('docker', args, {
    timeout: 7000, maxBuffer: 65536, env: { PATH: process.env.PATH, DOCKER_HOST: 'unix:///var/run/docker.sock' },
  });
  return stdout.trim();
}

function serialize(id, operation) {
  const prior = inFlight.get(id) ?? Promise.resolve();
  const current = prior.catch(() => {}).then(operation);
  inFlight.set(id, current);
  return current.finally(() => {
    if (inFlight.get(id) === current) inFlight.delete(id);
  });
}

async function inventory() {
  const rows = await docker('ps', '-a', ...filters, '--format',
    `{{.Label "${attemptLabel}"}} {{.Label "${expiryLabel}"}}`);
  return rows ? rows.split('\n').flatMap((row) => {
    const [id, expiry] = row.split(' ');
    return uuid.test(id) && /^\d{13}$/.test(expiry) ? [{ id, expiry: Number(expiry) }] : [];
  }) : [];
}

async function findContainer(id) {
  const found = await docker('ps', '-aq', ...filters, '--filter', `label=${attemptLabel}=${id}`);
  if (found && !/^[a-f0-9]{12,64}$/.test(found)) throw new Error('Ambiguous lab instance');
  return found;
}

const sandbox = (container, ...args) => docker('exec', container, ...args);
const readConfig = (container) => sandbox(container, 'cat', '/run/azaly-lab/route.conf');
const readProxy = (container) => sandbox(container, 'wget', '-T', '1', '-qO-', 'http://127.0.0.1:8080/');

async function destroy(id) {
  const container = await findContainer(id);
  if (container) {
    try {
      await docker('rm', '-f', container);
    } catch (error) {
      if (await findContainer(id)) throw error;
    }
  }
  return { ok: true };
}

async function waitForProxy(container) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const body = await readProxy(container).catch(() => '');
    if (body === 'upstream-green' || body === 'upstream-blue') return;
    await delay(200);
  }
  throw new Error('NGINX did not become ready');
}

async function provision(id, expiresAt) {
  const expiry = Date.parse(expiresAt);
  if (!Number.isFinite(expiry) || expiry <= Date.now() || expiry > Date.now() + 16 * 60_000) throw new HttpError(409);
  let container = await findContainer(id);
  if (!container) {
    container = await docker('run', '-d', '--rm', '--pull=never', '--name', `azaly-lab-${namespace}-${id}`,
      '--label', `${projectLabel}=${namespace}`, '--label', `${attemptLabel}=${id}`, '--label', `${expiryLabel}=${expiry}`,
      '--env', `LAB_EXPIRES_EPOCH=${Math.floor(expiry / 1000)}`,
      '--network', 'none', '--cpus', '0.25', '--memory', '48m', '--memory-swap', '48m', '--pids-limit', '24',
      '--user', '101:101', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
      '--tmpfs', '/run/azaly-lab:rw,noexec,nosuid,nodev,size=1m,uid=101,gid=101,mode=0700',
      '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=1m,uid=101,gid=101,mode=0700',
      '--log-driver', 'none', image);
  }
  await waitForProxy(container);
  return { ok: true };
}

async function activeContainer(id) {
  const match = (await inventory()).find((entry) => entry.id === id);
  if (!match || match.expiry <= Date.now()) throw new HttpError(409);
  const container = await findContainer(id);
  if (!container) throw new HttpError(409);
  return container;
}

async function useSandbox(id, { operation, upstream }) {
  const container = await activeContainer(id);
  if (operation === 'check') {
    const result = await checkRouting(() => readConfig(container), () => readProxy(container));
    if (result.configurationOk && result.responseOk) {
      // A grant redeemed before the check can still arrive afterward.
      await sandbox(container, 'touch', '/run/azaly-lab/verified');
    }
    return result;
  }
  if (operation === 'apply') {
    if (!isUpstream(upstream)) throw new HttpError(400);
    try {
      await sandbox(container, '/bin/sh', '/opt/azaly-lab/sandbox-apply.sh', upstream);
    } catch (error) {
      if (error?.code === 75) throw new HttpError(409);
      throw error;
    }
  }
  if (operation === 'config' || operation === 'apply') {
    const configuration = await readConfig(container);
    if (configuration !== blueDirective && configuration !== greenDirective) throw new Error('Invalid sandbox configuration');
    return { configuration };
  }
  if (operation === 'preview') {
    const body = await readProxy(container);
    if (body !== 'upstream-blue' && body !== 'upstream-green') throw new Error('Invalid sandbox response');
    return { body };
  }
  throw new HttpError(400);
}

const server = createServer(serve(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health') return respond(response, 200, { ok: true });
  if (request.method !== 'POST' || request.url !== '/control') throw new HttpError(404);
  if (!sameSecret(request.headers.authorization, `Bearer ${secret}`)) throw new HttpError(403);
  const input = await readJson(request);
  if (input.operation === 'inventory') return respond(response, 200, { ids: (await inventory()).map(({ id }) => id) });
  if (typeof input.id !== 'string' || !uuid.test(input.id) || input.templateVersion !== templateVersion) throw new HttpError(400);

  const payload = await serialize(input.id, () => {
    if (input.operation === 'provision') return provision(input.id, input.expiresAt);
    if (input.operation === 'destroy') return destroy(input.id);
    return useSandbox(input.id, input);
  });
  respond(response, 200, payload);
}));
server.requestTimeout = 20_000;
server.listen(8401, '0.0.0.0');

async function sweepExpired() {
  try {
    for (const entry of await inventory()) {
      if (entry.expiry <= Date.now()) await serialize(entry.id, () => destroy(entry.id));
    }
  } catch {
    console.error('Lab worker expiry cleanup failed. Retrying.');
  } finally {
    setTimeout(sweepExpired, 3000).unref();
  }
}
void sweepExpired();
