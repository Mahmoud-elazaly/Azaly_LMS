import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { cookies } from 'next/headers';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { version } from '../../package.json';
import { direction, isLocale } from '@/i18n/locales';
import { copy } from '@/i18n/messages';
import type { NavigationGroup } from '../_components/navigation';
import { WorkspaceShell } from '../_components/workspace-shell';
import { parseTheme, themes } from '../_components/theme';
import { saveTheme } from '../_components/theme-action';
import { identityCopy } from '@/features/identity/copy';
import { currentPrincipal } from '@/features/identity/session';
import { SignOutForm } from '../_components/auth-form';
import { learningCopy } from '@/features/learning/copy';
import { builderCopy } from '@/features/authoring/copy';
import { masteryCopy } from '@/features/mastery/copy';
import './styles.css';
import './account.css';
import './mastery.css';

const arabicFont = localFont({
  src: '../_fonts/noto-sans-arabic.woff2', weight: '100 900', display: 'swap',
  variable: '--font-workspace-arabic', preload: false, adjustFontFallback: false,
});

export async function generateMetadata({ params }: LayoutProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: copy(locale)('brand') } : {};
}

export default async function Layout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = copy(locale);
  const account = identityCopy(locale);
  const mastery = masteryCopy(locale);
  const principal = await currentPrincipal().catch(() => null);
  const groups: NavigationGroup[] = [{ label: t('learn'), links: [
    { path: '', label: t('home'), icon: 'home' },
    { path: '/courses', label: t('courses'), icon: 'book' },
    { path: '/about', label: t('about'), icon: 'info' },
  ] }];
  if (principal) {
    const links: NavigationGroup['links'] = [
      { path: '/dashboard', label: account.dashboard, icon: 'grid' },
      { path: '/profile', label: account.profile, icon: 'person' },
    ];
    if (principal.role === 'INSTRUCTOR') links.push({ path: '/instructor', label: account.instructor, icon: 'chart' });
    if (principal.role === 'STUDENT') links.push(
      { path: '/student', label: account.student, icon: 'chart' },
      { path: '/learning', label: learningCopy(locale).learning, icon: 'book' },
      { path: '/knowledge-graph', label: mastery.graph, icon: 'connections', documentNavigation: true },
      { path: '/mastery', label: mastery.mastery, icon: 'chart', documentNavigation: true },
    );
    groups.push({ label: t('workspace'), links });
    if (principal.role !== 'STUDENT') {
      const tools: NavigationGroup['links'] = [{ path: '/builder', label: builderCopy(locale).builder, icon: 'terminal' }];
      if (principal.role === 'OWNER' || principal.role === 'ADMIN') {
        tools.push({ path: '/admin/users', label: account.admin, icon: 'users' });
      }
      groups.push({ label: t('staff'), links: tools });
    }
  } else {
    groups.push({ links: [{ path: '/login', label: account.login, icon: 'lock' }] });
  }
  const theme = parseTheme((await cookies()).get('academy-theme')?.value);

  return <html lang={locale} dir={direction(locale)} data-theme={theme} className={arabicFont.variable}>
    <body>
      <a className="skip" href="#main">{t('skip')}</a>
      <WorkspaceShell locale={locale} groups={groups} navigationLabel={t('nav')} language={t('language')}
        openLabel={t('openMenu')} closeLabel={t('closeMenu')} brand={<Link className="brand" href={`/${locale}`}>
          <Image src="/icon.svg" alt="" width={36} height={36} loading="eager" unoptimized />
          <bdi lang="en" dir="ltr" translate="no">{t('brand')}</bdi>
        </Link>} utilities={<>
          <form action={saveTheme} aria-label={t('theme')} key={theme} className="theme-controls">
            {themes.map((option) => <button key={option} name="theme" value={option} aria-pressed={option === theme}>{t(option)}</button>)}
          </form>
          {principal && <SignOutForm locale={locale} />}
        </>}>
        <main className="container workspace-content" id="main" tabIndex={-1}>{children}</main>
        <footer className="site-footer">
          <div className="container footer-inner">
            <div className="footer-brand">
              <bdi lang="en" dir="ltr" translate="no">{t('brand')}</bdi>
              <span aria-hidden="true">·</span>
              <small className="app-version">{t('version')} <bdi dir="ltr">{version}</bdi></small>
            </div>
          </div>
        </footer>
      </WorkspaceShell>
    </body>
  </html>;
}
