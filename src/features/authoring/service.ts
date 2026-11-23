import { authoringCommand } from '../../db/authoring';
import { AuthorizationError } from '../identity/policy';
import { requireSession } from '../identity/session';
import { authorRoles, canPublish, documentSchema, type BuilderCourse, type CourseDraft, type Mutation } from './policy';

export class AuthoringError extends Error {
  constructor(readonly status: 400 | 409) {
    super(status === 409 ? 'Draft conflict' : 'Invalid draft');
  }
}

async function execute<T>(token: string, command: string, id: string | null = null,
  payload: object | null = null, version: number | null = null): Promise<T> {
  try {
    return await authoringCommand<T>(token, command, id, payload, version);
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined;
    if (code === '42501') throw new AuthorizationError(403);
    if (code === '40001' || code === '23505') throw new AuthoringError(409);
    if (code === '22023') throw new AuthoringError(400);
    throw error;
  }
}

export async function listCourses(headers?: Headers) {
  const { token } = await requireSession(authorRoles, headers);
  return execute<BuilderCourse[]>(token, 'list');
}

export async function readDraft(id: string, headers?: Headers) {
  const { token } = await requireSession(authorRoles, headers);
  return execute<CourseDraft>(token, 'read', id);
}

export async function changeDraft(input: Mutation, headers: Headers) {
  const { token } = await requireSession(authorRoles, headers);
  if (input.operation === 'create') return execute<{ id: string }>(token, 'create', null, { slug: input.slug });
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
