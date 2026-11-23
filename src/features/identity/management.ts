import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { activateAccount, changeInvitation, changeUser, consumeAccountLimit, selectUsers } from '../../db/identity';
import { isLocale } from '../../i18n/locales';
import { getAuth } from './auth';
import { directoryFilters, type ManagementInput } from './directory';
import { invitationMailer } from './invitation-mail';
import { AuthorizationError } from './policy';
import { clientIp } from './request';
import { requireSession } from './session';

export const managers = ['OWNER', 'ADMIN'] as const;

type AccountError = 'DUPLICATE_ACCOUNT' | 'MAIL_UNCONFIGURED' | 'RATE_LIMITED' | 'INVALID_INVITATION';
export class AccountOperationError extends Error {
  constructor(readonly code: AccountError, readonly status: 409 | 503 | 429 | 400) {
    super(code);
  }
}

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export async function listUsers(requestHeaders?: Headers, filters = directoryFilters({})) {
  const { principal } = await requireSession(managers, requestHeaders);
  return selectUsers(getAuth().db, principal.role === 'ADMIN', filters);
}

export async function manageUser(input: ManagementInput, requestHeaders: Headers) {
  const { principal, token } = await requireSession(managers, requestHeaders);
  const { db, origin } = getAuth();
  if (requestHeaders.get('origin') !== origin) throw new AuthorizationError(403);
  if (!await consumeAccountLimit(db, digest(`manage:${principal.id}`), 40, 60)) {
    throw new AccountOperationError('RATE_LIMITED', 429);
  }

  if (input.operation === 'edit' || input.operation === 'role' || input.operation === 'status') {
    if (!await changeUser(db, token, input)) throw new AuthorizationError(403);
    return { ok: true };
  }
  if (input.operation === 'invite' && input.role === 'ADMIN' && principal.role !== 'OWNER') throw new AuthorizationError(403);

  const send = input.operation === 'revoke' ? null : invitationMailer();
  if (input.operation !== 'revoke' && !send) throw new AccountOperationError('MAIL_UNCONFIGURED', 503);

  const id = input.operation === 'invite' ? randomUUID() : input.id;
  const secret = send ? randomBytes(32).toString('base64url') : null;
  const result = await changeInvitation(db, token, input, id, secret && digest(secret));
  if (result?.outcome === 'duplicate') throw new AccountOperationError('DUPLICATE_ACCOUNT', 409);
  if (result?.outcome !== 'ok') throw new AuthorizationError(403);
  if (!send || !secret) return { ok: true };

  const locale = result.language && isLocale(result.language) ? result.language : 'en';
  const sent = result.recipient && await send({
    to: result.recipient, locale, link: `${origin}/${locale}/activate#${secret}`,
  });
  return { ok: true, delivery: sent ? 'accepted' : 'failed' };
}

export async function activateInvitation(token: string, password: string, requestHeaders: Headers) {
  const { db, origin } = getAuth();
  if (requestHeaders.get('origin') !== origin) throw new AuthorizationError(403);
  if (!await consumeAccountLimit(db, digest(`activate:${clientIp(requestHeaders)}`), 12, 60)) {
    throw new AccountOperationError('RATE_LIMITED', 429);
  }
  if (!await activateAccount(db, digest(token), await hashPassword(password))) {
    throw new AccountOperationError('INVALID_INVITATION', 400);
  }
}
