'use client';

import { useState, type FormEvent } from 'react';
import { identityCopy } from '@/features/identity/copy';
import type { Locale } from '@/i18n/locales';

export function AuthForm({ locale, mode, destination }: {
  locale: Locale;
  mode: 'login' | 'register' | 'logout';
  destination: string;
}) {
  const t = identityCopy(locale);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const signingUp = mode === 'register';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    const values = new FormData(event.currentTarget);
    const body = mode === 'logout' ? {} : {
      email: String(values.get('email') ?? '').trim(),
      password: values.get('password'),
      ...(signingUp ? { name: String(values.get('name') ?? '').trim() } : {}),
    };
    const endpoint = mode === 'logout' ? 'sign-out' : signingUp ? 'sign-up/email' : 'sign-in/email';

    try {
      const response = await fetch(`/api/auth/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        window.location.assign(destination);
        return;
      }
      setError(response.status === 429 ? t.limited : t.rejected);
    } catch {
      setError(t.rejected);
    } finally {
      setPending(false);
    }
  }

  return <form className={mode === 'logout' ? 'logout-form' : 'identity-form'} onSubmit={submit}>
    {mode !== 'logout' && <>
      {signingUp && <label>{t.name}<input name="name" autoComplete="name" required maxLength={120} /></label>}
      <label>{t.email}<input name="email" type="email" autoComplete="email" dir="ltr" required maxLength={254} /></label>
      <label>{t.password}<input name="password" type="password" dir="ltr" required maxLength={128}
        minLength={signingUp ? 12 : undefined} autoComplete={signingUp ? 'new-password' : 'current-password'} /></label>
    </>}
    <button className="identity-button" disabled={pending}>{pending ? t.pending : t[mode]}</button>
    {error && <p role="alert">{error}</p>}
  </form>;
}
