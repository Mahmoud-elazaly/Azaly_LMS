import { z } from 'zod';

export const templateVersion = 'nginx-reverse-proxy@1';
export const starterDirective = 'proxy_pass http://127.0.0.1:8082;';
const upstreamByPort = { '8081': 'blue', '8082': 'green' } as const;

export function parseProxyDirective(configuration: string) {
  if (configuration.length > 96) return null;
  const port = /^proxy_pass[ \t]+http:\/\/127\.0\.0\.1:(8081|8082)[ \t]*;$/.exec(configuration.trim())?.[1];
  return port === '8081' || port === '8082' ? upstreamByPort[port] : null;
}

const attemptKey = { id: z.uuid() };
export const labRequest = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('start'), requestId: z.uuid() }),
  z.strictObject({ operation: z.enum(['stop', 'reset', 'validate', 'config', 'preview']), ...attemptKey }),
  z.strictObject({ operation: z.literal('apply'), ...attemptKey, configuration: z.string().max(96) }),
]);
export type LabRequest = z.infer<typeof labRequest>;

export const labAttempt = z.strictObject({
  id: z.uuid(),
  state: z.enum(['QUEUED', 'PROVISIONING', 'READY', 'RUNNING', 'VALIDATING', 'FAILED', 'PASSED', 'STOPPING', 'CLEANUP_FAILED', 'DESTROYED']),
  endReason: z.enum(['STOPPED', 'RESET', 'EXPIRED', 'CANCELLED', 'PROVISION_FAILED', 'INSTANCE_LOST']).nullable(),
  expiresAt: z.string(),
  templateVersion: z.literal(templateVersion),
  check: z.strictObject({
    configurationOk: z.boolean(), responseOk: z.boolean(),
    completionProvenance: z.literal('SYSTEM_VERIFIED').nullable(), checkedAt: z.string(),
  }).nullable(),
});
export type LabAttempt = z.infer<typeof labAttempt>;

export function canOpenWorkspace(state: LabAttempt['state']) {
  return state === 'READY' || state === 'RUNNING' || state === 'FAILED' || state === 'PASSED';
}
