import { readLimitedJson } from '../../lib/limited-json';
import { z } from 'zod';
import { studentLabCommand } from '../../db/real-lab';
import { AuthorizationError } from '../identity/policy';
import { requireSession } from '../identity/session';
import { studentRoles } from '../learning/policy';
import { labAttempt, parseProxyDirective, type LabRequest } from './policy';

export class RealLabError extends Error {
  constructor(readonly status: 400 | 404 | 409 | 429 | 503) {
    super('Real lab request failed');
  }
}

function bridgeUrl() {
  const configured = process.env.REAL_LAB_BRIDGE_URL;
  if (!configured) return null;
  const target = new URL(configured);
  if (target.username || target.password ||
      (target.protocol !== 'https:' && target.origin !== 'http://lab-bridge:8400')) {
    throw new RealLabError(503);
  }
  return target;
}

export function realLabEnabled() {
  return Boolean(process.env.REAL_LAB_BRIDGE_URL);
}

async function command(token: string, operation: string, id: string | null) {
  try {
    return await studentLabCommand(token, operation, id);
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined;
    if (code === '42501') throw new AuthorizationError(403);
    if (code === '23505' || code === '40001') throw new RealLabError(409);
    if (code === '54000') throw new RealLabError(429);
    if (code === '22023') throw new RealLabError(400);
    throw error;
  }
}

export async function readRealLab(headers?: Headers) {
  const { token } = await requireSession(studentRoles, headers);
  if (!bridgeUrl()) throw new RealLabError(404);
  return labAttempt.nullable().parse(await command(token, 'get', null));
}

const grantResponse = z.strictObject({ grant: z.string().regex(/^[a-f0-9]{64}$/) });
const configOutput = z.strictObject({ configuration: z.string().max(96).refine((value) => parseProxyDirective(value) !== null) });
const previewOutput = z.strictObject({ body: z.enum(['upstream-blue', 'upstream-green']) });

async function openWorkspace(target: URL, token: string, input: Extract<LabRequest, { id: string }>) {
  const upstream = input.operation === 'apply' ? parseProxyDirective(input.configuration) : undefined;
  if (upstream === null) throw new RealLabError(400);
  const { grant } = grantResponse.parse(await command(token, input.operation, input.id));
  const result = await fetch(new URL('/session', target), {
    method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(19_000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant, upstream }),
  });
  if (!result.ok) throw new RealLabError(result.status === 403 || result.status === 409 ? 409 : 503);
  return (input.operation === 'preview' ? previewOutput : configOutput).parse(await readLimitedJson(result, 4096));
}

export async function changeRealLab(input: LabRequest, token: string) {
  const target = bridgeUrl();
  if (!target) throw new RealLabError(404);
  if (input.operation === 'config' || input.operation === 'apply' || input.operation === 'preview') {
    return openWorkspace(target, token, input);
  }
  return labAttempt.parse(await command(token, input.operation, input.operation === 'start' ? input.requestId : input.id));
}
