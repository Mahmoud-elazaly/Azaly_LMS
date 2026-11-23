import type { z } from 'zod';
import { questionCommand } from '../../db/authoring';
import { authorRoles, canManageAuthorContent } from '../authoring/policy';
import { authorizeAuthoringResult } from '../authoring/service';
import { AuthorizationError, type Role } from '../identity/policy';
import { requireSession } from '../identity/session';
import type { BankQuestion, bankMutation } from './policy';

type BankRecord = BankQuestion & { ownerId: string };

function scopedQuestion(record: BankRecord, principal: { id: string; role: Role }): BankQuestion {
  const { ownerId, ...question } = record;
  if (!canManageAuthorContent(principal, ownerId)) throw new AuthorizationError(403);
  return question;
}

export async function listBankQuestions(headers?: Headers) {
  const { token, principal } = await requireSession(authorRoles, headers);
  const records = await authorizeAuthoringResult(questionCommand<BankRecord[]>(token, { operation: 'list' }));
  return records.map((record) => scopedQuestion(record, principal));
}

export async function readBankQuestion(id: string, headers: Headers) {
  const { token, principal } = await requireSession(authorRoles, headers);
  const record = await authorizeAuthoringResult(questionCommand<BankRecord>(token, { operation: 'read', id }));
  return scopedQuestion(record, principal);
}

export async function changeBankQuestion(input: z.infer<typeof bankMutation>, headers: Headers) {
  const { token, principal } = await requireSession(authorRoles, headers);
  if (input.operation !== 'create') {
    const prior = await authorizeAuthoringResult(questionCommand<BankRecord>(token, { operation: 'read', id: input.id }));
    scopedQuestion(prior, principal);
  }
  const record = await authorizeAuthoringResult(questionCommand<BankRecord>(token, input));
  return scopedQuestion(record, principal);
}
