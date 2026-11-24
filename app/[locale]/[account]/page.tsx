import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { identityCopy } from '@/features/identity/copy';
import { assessmentCopy } from '@/features/assessment/copy';
import { builderCopy } from '@/features/authoring/copy';
import { authorRoles } from '@/features/authoring/policy';
import { guidedCopy } from '@/features/guided/copy';
import type { Role } from '@/features/identity/policy';
import { returnPath } from '@/features/identity/return-path';
import { currentPrincipal } from '@/features/identity/session';
import { learningCopy } from '@/features/learning/copy';
import { isLocale, type Locale } from '@/i18n/locales';
import { copy } from '@/i18n/messages';
import type { ComponentProps } from 'react';
import { AccountIcon } from '../../_components/account-icon';
import { SignInForm } from '../../_components/auth-form';

function DashboardCards({ locale, role }: { locale: Locale; role: Role }) {
  const account = identityCopy(locale);
  const t = copy(locale);
  const actions: { path: string; title: string; description: string; icon: ComponentProps<typeof AccountIcon>['name'] }[] = [
    { path: 'profile', title: account.profile, description: t('profileAction'), icon: 'person' },
    { path: 'courses', title: t('courses'), description: t('catalogAction'), icon: 'book' },
  ];
  if (role === 'STUDENT') actions.push(
    { path: 'learning', title: learningCopy(locale).learning, description: t('learningAction'), icon: 'chart' },
  );
  if (authorRoles.some((author) => author === role)) actions.push(
    { path: 'builder', title: builderCopy(locale).builder, description: t('builderAction'), icon: 'terminal' },
    { path: 'question-bank', title: assessmentCopy(locale).bank, description: t('bankAction'), icon: 'grid' },
    { path: 'guided-reviews', title: guidedCopy(locale).queue, description: t('reviewsAction'), icon: 'shield' },
  );
  if (role === 'OWNER' || role === 'ADMIN') actions.push(
    { path: 'admin/users', title: account.admin, description: t('usersAction'), icon: 'users' },
  );
  return <section aria-labelledby="dashboard-actions">
    <h2 id="dashboard-actions">{t('quickActions')}</h2>
    <ul className="card-grid dashboard-grid">{actions.map(({ path, title, description, icon }) => {
      const id = `action-${path.replace('/', '-')}`;
      return <li key={path}><Link className="card workspace-card action-card" href={`/${locale}/${path}`} aria-labelledby={id}>
        <div className="action-card-top"><span className="card-icon"><AccountIcon name={icon} /></span>
          <span className="action-arrow"><AccountIcon name="arrow" /></span></div>
        <h3 id={id}>{title}</h3><p>{description}</p>
      </Link></li>;
    })}</ul>
  </section>;
}

export default async function AccountPage({ params, searchParams }: PageProps<'/[locale]/[account]'>) {
  const { locale, account } = await params;
  if (!isLocale(locale)) notFound();
  if (!['login', 'dashboard', 'profile', 'instructor', 'student'].includes(account)) notFound();

  const t = identityCopy(locale);
  const principal = await currentPrincipal();
  if (account === 'login') {
    const query = await searchParams;
    const destination = returnPath(locale, query.next);
    if (principal) redirect(destination);
    const loginTitle = locale === 'ar' ? <>تسجيل الدخول إلى <bdi dir="ltr" lang="en" translate="no">Azaly</bdi></> : t.loginTitle;
    return <div className="account-page">
      <div className="account-intro">
        <p className="account-eyebrow">{t.eyebrow}</p>
        <h1>{t.welcomeBack}</h1>
        <p>{t.loginIntro}</p>
      </div>
      <section className="account-card" aria-labelledby="login-title">
        <div className="account-card-heading">
          <span className="account-icon-tile"><AccountIcon name="lock" /></span>
          <div><h2 id="login-title">{loginTitle}</h2><p>{t.loginSubtitle}</p></div>
        </div>
        {query.activated === '1' && <p className="account-notice account-success" role="status">{t.activated}</p>}
        <SignInForm locale={locale} destination={destination} />
        <p className="account-managed"><AccountIcon name="shield" />{t.managed}</p>
      </section>
      <aside className="account-access">
        <AccountIcon name="info" />
        <div><h2>{t.needAccount}</h2><p>{t.requestAccess.split('Azaly LMS').map((part, index) =>
          index ? <span key={index}><bdi dir="ltr" lang="en" translate="no">Azaly LMS</bdi>{part}</span> : part,
        )}</p></div>
      </aside>
    </div>;
  }

  if (account !== 'dashboard' && account !== 'profile' && account !== 'instructor' && account !== 'student') notFound();
  if (!principal) redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/${account}`)}`);
  if ((account === 'instructor' && principal.role !== 'INSTRUCTOR') ||
      (account === 'student' && principal.role !== 'STUDENT')) {
    return <section className="page-copy"><h1>{t[account]}</h1><p>{t.denied}</p></section>;
  }

  return <section className="page-copy">
    <header className="workspace-page-heading">
      <h1>{t[account]}</h1>
      {account !== 'profile' && <><p>{t.welcome} <bdi>{principal.name}</bdi></p>
        <span className="workspace-pill">{t[principal.role]}</span></>}
    </header>
    {account === 'profile' ? <dl className="notice profile-facts">
      <div><dt>{t.name}</dt><dd><bdi>{principal.name}</bdi></dd></div>
      <div><dt>{t.email}</dt><dd><bdi className="profile-email" dir="ltr" translate="no">{principal.email}</bdi></dd></div>
      <div><dt>{t.role}</dt><dd><span className="workspace-pill">{t[principal.role]}</span></dd></div>
      <div><dt>{t.status}</dt><dd><span className="workspace-pill account-active">{t.active}</span></dd></div>
    </dl> : <>
      <DashboardCards locale={locale} role={principal.role} />
    </>}
  </section>;
}
