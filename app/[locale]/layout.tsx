import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { direction, isLocale } from '@/i18n/locales';
import { copy } from '@/i18n/messages';
import { Navigation } from '@/ui/navigation';
import { parseTheme, themes } from '@/ui/theme';
import { saveTheme } from '@/ui/theme-action';
import { identityCopy } from '@/features/identity/copy';
import { currentPrincipal } from '@/features/identity/session';
import { AuthForm } from '@/ui/auth-form';
import './styles.css';

export async function generateMetadata({ params }: LayoutProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: copy(locale)('brand') } : {};
}

export default async function Layout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = copy(locale);
  const account = identityCopy(locale);
  const principal = await currentPrincipal().catch(() => null);
  const accountLinks = principal ? [
    { path: '/dashboard', label: account.dashboard },
    { path: '/profile', label: account.profile },
    ...(principal.role === 'INSTRUCTOR' ? [{ path: '/instructor', label: account.instructor }] : []),
    ...(principal.role === 'STUDENT' ? [{ path: '/student', label: account.student }] : []),
    ...(principal.role === 'OWNER' || principal.role === 'ADMIN' ? [{ path: '/admin', label: account.admin }] : []),
  ] : [{ path: '/login', label: account.login }, { path: '/register', label: account.register }];
  const theme = parseTheme((await cookies()).get('academy-theme')?.value);

  return <html lang={locale} dir={direction(locale)} data-theme={theme}>
    <body>
      <a className="skip" href="#main">{t('skip')}</a>
      <header className="site-header">
        <div className="container header-inner">
          <Link className="brand" href={`/${locale}`}><span className="mark" aria-hidden="true" dir="ltr">&gt;_</span>{t('brand')}</Link>
          <Navigation locale={locale} label={t('nav')} language={t('language')} links={[
            { path: '', label: t('home') },
            { path: '/courses', label: t('courses') },
            { path: '/about', label: t('about') },
            ...accountLinks,
          ]} />
          {principal && <AuthForm locale={locale} mode="logout" destination={`/${locale}`} />}
        </div>
      </header>
      <main className="container" id="main" tabIndex={-1}>{children}</main>
      <footer className="site-footer">
        <div className="container footer-inner">
          <span>{t('brand')}</span>
          <form action={saveTheme} aria-label={t('theme')} key={theme} className="theme-controls">
            {themes.map((option) => <button key={option} name="theme" value={option} aria-pressed={option === theme}>{t(option)}</button>)}
          </form>
        </div>
      </footer>
    </body>
  </html>;
}
