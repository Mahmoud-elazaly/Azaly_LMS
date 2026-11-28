import { z } from 'zod';

import { templateVersions } from './catalog';

export { parseProxyDirective, starterDirective, templateVersion } from './catalog';

const approvedTemplate = z.enum(templateVersions);
const attemptKey = { id: z.uuid() };
export const labRequest = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('start'), requestId: z.uuid(), templateVersion: approvedTemplate.optional() }),
  z.strictObject({ operation: z.enum(['stop', 'reset', 'validate', 'config', 'preview']), ...attemptKey }),
  z.strictObject({ operation: z.literal('apply'), ...attemptKey, configuration: z.string().max(96) }),
]);
export type LabRequest = z.infer<typeof labRequest>;

export const labAttempt = z.strictObject({
  id: z.uuid(),
  state: z.enum(['QUEUED', 'PROVISIONING', 'READY', 'RUNNING', 'VALIDATING', 'FAILED', 'PASSED', 'STOPPING', 'CLEANUP_FAILED', 'DESTROYED']),
  endReason: z.enum(['STOPPED', 'RESET', 'EXPIRED', 'CANCELLED', 'PROVISION_FAILED', 'INSTANCE_LOST']).nullable(),
  expiresAt: z.string(),
  templateVersion: approvedTemplate,
  check: z.strictObject({
    configurationOk: z.boolean(), responseOk: z.boolean(),
    completionProvenance: z.literal('SYSTEM_VERIFIED').nullable(), checkedAt: z.string(),
  }).nullable(),
});
export type LabAttempt = z.infer<typeof labAttempt>;

export function canOpenWorkspace(state: LabAttempt['state']) {
  return state === 'READY' || state === 'RUNNING' || state === 'FAILED' || state === 'PASSED';
}
