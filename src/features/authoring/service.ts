import { isDeepStrictEqual } from 'node:util';
import { authoringCommand, questionCommand } from '../../db/authoring';
import { importBankQuestion, type BankQuestion } from '../assessment/policy';
import { AuthorizationError, type Role } from '../identity/policy';
import { requireSession } from '../identity/session';
import { authorRoles, canManageAuthorContent, canPublish, documentSchema, type BuilderCourse, type CourseDraft, type Mutation } from './policy';

export class AuthoringError extends Error {
  constructor(readonly status: 400 | 409) {
    super(status === 409 ? 'Draft conflict' : 'Invalid draft');
  }
}

export async function authorizeAuthoringResult<T>(command: Promise<T>): Promise<T> {
  try {
    return await command;
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined;
    if (code === '42501') throw new AuthorizationError(403);
    if (code === '40001' || code === '23505') throw new AuthoringError(409);
    if (code === '22023' || code === '22P02') throw new AuthoringError(400);
    throw error;
  }
}

function execute<T>(token: string, command: string, id: string | null = null,
  payload: object | null = null, version: number | null = null) {
  return authorizeAuthoringResult(authoringCommand<T>(token, command, id, payload, version));
}

export async function listCourses(headers?: Headers) {
  const { token } = await requireSession(authorRoles, headers);
  return execute<BuilderCourse[]>(token, 'list');
}

export async function readDraft(id: string, headers?: Headers) {
  const { token } = await requireSession(authorRoles, headers);
  return execute<CourseDraft>(token, 'read', id);
}

async function validateBankCopies(token: string, principal: { id: string; role: Role }, input: Extract<Mutation, { operation: 'save' }>) {
  const copies = input.document.quizzes?.flatMap((quiz) => quiz.questions).filter((question) => question.bankSource);
  if (!copies?.length) return;
  const prior = await execute<CourseDraft>(token, 'read', input.id);
  if (prior.version !== input.version) throw new AuthoringError(409);
  const saved = prior.document.quizzes?.flatMap((quiz) => quiz.questions) ?? [];
  for (const question of copies) {
    const existing = saved.find((entry) => entry.id === question.id && entry.bankSource);
    if (existing) {
      if (!isDeepStrictEqual(existing, question)) throw new AuthoringError(409);
      continue;
    }
    const record = await authorizeAuthoringResult(questionCommand<BankQuestion & { ownerId: string }>(token,
      { operation: 'read', id: question.bankSource?.id }));
    if (!canManageAuthorContent(principal, record.ownerId)) throw new AuthorizationError(403);
    if (record.archived || !isDeepStrictEqual(question, importBankQuestion(record, question.id))) throw new AuthoringError(409);
  }
}

export async function changeDraft(input: Mutation, headers: Headers) {
  const { token, principal } = await requireSession(authorRoles, headers);
  if (input.operation === 'create') return execute<{ id: string }>(token, 'create', null, { slug: input.slug });
  if (input.operation === 'save') await validateBankCopies(token, principal, input);
  if (input.operation === 'publish') {
    const current = await execute<CourseDraft>(token, 'read', input.id);
    if (current.version !== input.version) throw new AuthoringError(409);
    const parsed = documentSchema.safeParse(current.document);
    if (!parsed.success || !canPublish(parsed.data)) throw new AuthoringError(400);
  }
  return execute<{ id: string; version: number }>(
    token, input.operation, input.id, input.operation === 'save' ? input.document : null, input.version,
  );
}
