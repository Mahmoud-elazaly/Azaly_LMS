'use client';

import { useRef, useState, type FormEvent } from 'react';
import { identityCopy } from '@/features/identity/copy';
import { assignableRoles, managementInput, type DirectoryUser, type ManagementInput } from '@/features/identity/directory';
import { canAssignRole, type Role } from '@/features/identity/policy';
import type { Locale } from '@/i18n/locales';
import { AccountButton, AccountDialog, AccountInput } from './account-ui';

export type UserDialogState = { action: 'invite' } | {
  action: 'edit' | 'status' | 'resend' | 'revoke';
  user: DirectoryUser;
};

export function UserDialog({ dialog, locale, actorRole, close, done }: {
  dialog: UserDialogState;
  locale: Locale;
  actorRole: Role;
  close: () => void;
  done: (message: string) => void;
}) {
  const t = identityCopy(locale);
  const user = 'user' in dialog ? dialog.user : undefined;
  const { action } = dialog;
  const [role, setRole] = useState<Role>(user?.role ?? 'STUDENT');
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; email?: string }>({});
  const busy = useRef(false);
  const options = assignableRoles.filter((option) => canAssignRole(actorRole, user?.role ?? 'STUDENT', option));
  const roleChanging = action === 'edit' && role !== user?.role;
  const fields = action === 'invite' || action === 'edit';
  const labels = {
    invite: { title: t.inviteTitle, details: t.inviteIntro, submit: t.invite },
    edit: { title: t.editTitle, details: undefined, submit: t.save },
    status: user?.banned ? { title: t.enable, details: t.enableWarning, submit: t.enable } :
      { title: t.disable, details: t.disableWarning, submit: t.disable },
    resend: { title: t.resend, details: t.resendWarning, submit: t.resend },
    revoke: { title: t.revoke, details: t.revokeWarning, submit: t.revoke },
  }[action];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || (roleChanging && !confirmed)) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const name = form.elements.namedItem('name') as HTMLInputElement | null;
    const email = form.elements.namedItem('email') as HTMLInputElement | null;
    const validation = {
      name: name && (!name.validity.valid || !name.value.trim()) ? t.nameError : undefined,
      email: email && !email.validity.valid ? t.emailError : undefined,
    };
    setFieldErrors(validation);
    setError('');
    if (validation.name || validation.email) {
      (validation.name ? name : email)?.focus();
      return;
    }
    const input = managementInput.safeParse({
      operation: action, id: user?.id, name: values.get('name'), email: values.get('email'), role,
      locale: values.get('locale') || locale, banned: user ? !user.banned : undefined,
    });
    if (!input.success) {
      setError(t.rejected);
      return;
    }
    busy.current = true;
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input.data satisfies ManagementInput),
      });
      if (response.ok) {
        const message = response.status === 202 ? t.deliveryFailed :
          action === 'invite' || action === 'resend' ? t.inviteAccepted : action === 'revoke' ? t.revoked : t.updated;
        done(message);
        return;
      }
      const reply: { error?: string } = await response.json();
      const errors: Record<string, string> = {
        DUPLICATE_ACCOUNT: t.duplicate, MAIL_UNCONFIGURED: t.mailUnavailable, RATE_LIMITED: t.limited,
        FORBIDDEN: t.staleAction, UNAUTHENTICATED: t.staleAction, UNAVAILABLE: t.unavailable,
      };
      setError(errors[reply.error ?? ''] ?? t.rejected);
    } catch {
      setError(t.unavailable);
    }
    busy.current = false;
    setPending(false);
  }

  function dismiss() {
    if (!busy.current) close();
  }

  return <AccountDialog locale={locale} title={labels.title} description={labels.details} close={dismiss}>
    <form className="admin-dialog-form" method="post" noValidate onSubmit={submit} aria-busy={pending}>
      {user && <p className="admin-dialog-person"><bdi>{user.name}</bdi> · <bdi dir="ltr">{user.email}</bdi> · {t[user.status]}</p>}
      {fields && <>
        <AccountInput label={t.name} name="name" autoComplete="off" dir="auto" defaultValue={user?.name} required maxLength={120} error={fieldErrors.name} />
        {action === 'invite' && <AccountInput label={t.email} name="email" type="email" autoComplete="off"
          dir="ltr" spellCheck={false} required maxLength={254} error={fieldErrors.email} />}
        <label className="account-field">{t.role}
          <select name="role" value={role} onChange={(event) => {
            const selected = options.find((value) => value === event.target.value);
            if (selected) setRole(selected);
            setConfirmed(false);
          }}>
            {options.map((option) => <option key={option} value={option}>{t[option]}</option>)}
          </select>
        </label>
        {action === 'invite' && <label className="account-field">{t.preferredLanguage}
          <select name="locale" defaultValue={locale}><option value="en">{t.english}</option><option value="ar">{t.arabic}</option></select>
        </label>}
        {roleChanging && <label className="account-remember">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} required />
          {user?.status === 'invited' ? t.inviteRoleWarning : t.roleWarning}
        </label>}
      </>}
      {error && <p className="account-notice" role="alert">{error}</p>}
      <div className="admin-dialog-actions">
        <button className="account-secondary" type="button" disabled={pending} onClick={dismiss}>{t.cancel}</button>
        <AccountButton disabled={pending} pending={pending} type="submit">{pending ? t.pending : labels.submit}</AccountButton>
      </div>
    </form>
  </AccountDialog>;
}
