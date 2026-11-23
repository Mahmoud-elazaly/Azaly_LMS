'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from 'react';
import { identityCopy } from '@/features/identity/copy';
import type { Locale } from '@/i18n/locales';
import { AccountIcon } from './account-icon';

const subscribe = () => () => {};
export function useAccountFormReady() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

export function AccountButton({ pending, children, className, ...props }: ComponentProps<'button'> & { pending?: boolean }) {
  return <button className={`account-primary ${className ?? ''}`} {...props}>
    {pending && <span className="account-spinner" aria-hidden="true" />}
    {children}
  </button>;
}

export function AccountInput({ label, icon, aside, trailing, error, ...props }: ComponentProps<'input'> & {
  label: string;
  icon?: 'mail' | 'lock';
  aside?: ReactNode;
  trailing?: ReactNode;
  error?: string;
}) {
  const id = useId();
  return <div className="account-field">
    <div className="account-field-heading"><label htmlFor={id}>{label}</label>{aside}</div>
    <div className="account-input-wrap" data-icon={icon} data-trailing={trailing ? '' : undefined}>
      {icon && <span className="account-input-icon"><AccountIcon name={icon} /></span>}
      <input {...props} id={id} aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : props['aria-describedby']} />
      {trailing}
    </div>
    {error && <p id={`${id}-error`} className="account-field-error">{error}</p>}
  </div>;
}

export function PasswordInput({ locale, ...props }: ComponentProps<typeof AccountInput> & { locale: Locale }) {
  const t = identityCopy(locale);
  const [shown, setShown] = useState(false);
  return <AccountInput {...props} dir="ltr" icon="lock" type={shown ? 'text' : 'password'} trailing={
    <button className="account-password-toggle" type="button" onClick={() => setShown(!shown)}
      aria-label={shown ? t.hidePassword : t.showPassword}>
      <AccountIcon name={shown ? 'eyeOff' : 'eye'} />
    </button>
  } />;
}

export function AccountDialog({ locale, title, description, close, children }: {
  locale: Locale;
  title: string;
  description?: string;
  close: () => void;
  children: ReactNode;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    const trigger = document.activeElement;
    node?.showModal();
    return () => {
      node?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, []);
  return <dialog ref={dialog} className="account-dialog" aria-labelledby={id}
    aria-describedby={description ? `${id}-description` : undefined}
    onCancel={(event) => { event.preventDefault(); close(); }}>
    <header className="account-dialog-header">
      <div><h2 id={id}>{title}</h2>{description && <p id={`${id}-description`}>{description}</p>}</div>
      <button className="account-dialog-close" type="button" aria-label={identityCopy(locale).close} onClick={close}>
        <AccountIcon name="close" />
      </button>
    </header>
    <div className="account-dialog-body">{children}</div>
  </dialog>;
}
