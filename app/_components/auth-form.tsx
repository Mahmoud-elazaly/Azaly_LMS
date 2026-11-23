'use client';

import { useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { identityCopy } from '@/features/identity/copy';
import { passwordMaximum, passwordMinimum } from '@/features/identity/directory';
import type { Locale } from '@/i18n/locales';
import { AccountIcon } from './account-icon';
import { AccountButton, AccountDialog, AccountInput, PasswordInput, useAccountFormReady } from './account-ui';

function post(action: string, body: object) {
  return fetch(action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

function requestError(t: ReturnType<typeof identityCopy>, status: number, rejected: string) {
  if (status === 429) return t.limited;
  return status >= 500 ? t.unavailable : rejected;
}

type Credentials = { email?: string; password?: string; confirmation?: string };

export function SignInForm({ locale, destination }: { locale: Locale; destination: string }) {
  const t = identityCopy(locale);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<Credentials>({});
  const [help, setHelp] = useState(false);
  const hydrated = useAccountFormReady();
  const busy = useRef(false);
  const action = '/api/auth/sign-in/email';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hydrated || busy.current) return;
    const form = event.currentTarget;
    const email = form.elements.namedItem('email') as HTMLInputElement;
    const password = form.elements.namedItem('password') as HTMLInputElement;
    const validation = {
      email: email.validity.valid ? undefined : t.emailError,
      password: password.validity.valid ? undefined : t.passwordError,
    };
    setErrors(validation);
    setError('');
    if (validation.email || validation.password) {
      (validation.email ? email : password).focus();
      return;
    }

    const values = new FormData(form);
    busy.current = true;
    setPending(true);
    try {
      const response = await post(action, {
        email: email.value.trim(), password: password.value, rememberMe: values.has('rememberMe'),
      });
      if (response.ok) {
        window.location.assign(destination);
        return;
      }
      setError(requestError(t, response.status, t.invalidCredentials));
    } catch {
      setError(t.unavailable);
    }
    busy.current = false;
    setPending(false);
  }

  return <>
    <form className="identity-form" action={action} method="post" noValidate onSubmit={submit} aria-busy={pending}>
      {error && <p className="account-notice" role="alert">{error}</p>}
      <AccountInput label={t.email} name="email" icon="mail" type="email" inputMode="email" autoComplete="username"
        dir="ltr" spellCheck={false} required maxLength={254} placeholder="name@company.com" error={errors.email} />
      <PasswordInput locale={locale} label={t.password} name="password" required maxLength={passwordMaximum}
        autoComplete="current-password" error={errors.password} aside={
          <button className="account-inline" type="button" onClick={() => setHelp(true)}>{t.help}</button>
        } />
      <label className="account-remember"><input type="checkbox" name="rememberMe" />{t.remember}</label>
      <AccountButton type="submit" disabled={!hydrated || pending} pending={pending}>
        {pending ? t.pending : t.login}{!pending && <AccountIcon name="arrow" />}
      </AccountButton>
      {!hydrated && <p>{t.formLoading}</p>}
    </form>
    {help && <AccountDialog locale={locale} title={t.helpTitle} description={t.helpBody} close={() => setHelp(false)}>
      <AccountButton type="button" onClick={() => setHelp(false)}>{t.gotIt}</AccountButton>
    </AccountDialog>}
  </>;
}

function subscribeToFragment(callback: () => void) {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
}

export function ActivationForm({ locale }: { locale: Locale }) {
  const t = identityCopy(locale);
  const token = useSyncExternalStore(subscribeToFragment, () => window.location.hash.slice(1), () => '');
  const hydrated = useAccountFormReady();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<Credentials>({});
  const validToken = /^[A-Za-z0-9_-]{43}$/.test(token);
  const action = '/api/auth/activate';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validToken || busy.current) return;
    const form = event.currentTarget;
    const password = form.elements.namedItem('password') as HTMLInputElement;
    const confirmation = form.elements.namedItem('confirmation') as HTMLInputElement;
    const validation = {
      password: password.value.length < passwordMinimum || password.value.length > passwordMaximum ? t.passwordLength : undefined,
      confirmation: password.value !== confirmation.value ? t.passwordMismatch : undefined,
    };
    setErrors(validation);
    setError('');
    if (validation.password || validation.confirmation) {
      (validation.password ? password : confirmation).focus();
      return;
    }

    busy.current = true;
    setPending(true);
    try {
      const response = await post(action, { token, password: password.value });
      if (response.ok) {
        window.history.replaceState(null, '', window.location.pathname);
        window.location.replace(`/${locale}/login?activated=1`);
        return;
      }
      setError(requestError(t, response.status, t.invalidInvitation));
    } catch {
      setError(t.unavailable);
    }
    busy.current = false;
    setPending(false);
  }

  if (hydrated && !validToken) return <p className="account-notice" role="alert">{t.invalidInvitation}</p>;
  return <form className="identity-form" action={action} method="post" noValidate onSubmit={submit} aria-busy={pending}>
    {error && <p className="account-notice" role="alert">{error}</p>}
    <PasswordInput locale={locale} name="password" label={t.password} autoComplete="new-password"
      minLength={passwordMinimum} maxLength={passwordMaximum} required error={errors.password} />
    <PasswordInput locale={locale} name="confirmation" label={t.passwordConfirmation} autoComplete="new-password"
      maxLength={passwordMaximum} required error={errors.confirmation} />
    <p className="account-form-hint">{t.passwordLength}</p>
    <AccountButton type="submit" disabled={!validToken || pending} pending={pending}>
      {pending ? t.pending : t.activate}
    </AccountButton>
    {!hydrated && <p>{t.formLoading}</p>}
  </form>;
}

export function SignOutForm({ locale }: { locale: Locale }) {
  const t = identityCopy(locale);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const action = '/api/auth/sign-out';
  const hydrated = useAccountFormReady();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError('');
    try {
      const response = await post(action, {});
      if (response.ok) {
        window.location.replace(`/${locale}`);
        return;
      }
      setError(requestError(t, response.status, t.rejected));
    } catch {
      setError(t.unavailable);
    }
    setPending(false);
  }

  return <form className="logout-form" action={action} method="post" onSubmit={submit}>
    <button className="identity-button" type="submit" disabled={!hydrated || pending}>{pending ? t.pending : t.logout}</button>
    {error && <p role="alert">{error}</p>}
  </form>;
}
