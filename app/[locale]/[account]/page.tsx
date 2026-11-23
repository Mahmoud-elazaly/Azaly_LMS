import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { identityCopy } from '@/features/identity/copy';
import { returnPath } from '@/features/identity/return-path';
import { currentPrincipal } from '@/features/identity/session';
import { learningCopy } from '@/features/learning/copy';
import { isLocale } from '@/i18n/locales';
import { AccountIcon } from '../../_components/account-icon';
import { SignInForm } from '../../_components/auth-form';

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
    <h1>{t[account]}</h1>
    {account === 'profile' ? <dl className="notice">
      <dt>{t.name}</dt><dd><bdi>{principal.name}</bdi></dd>
      <dt>{t.email}</dt><dd><bdi dir="ltr">{principal.email}</bdi></dd>
      <dt>{t.role}</dt><dd>{t[principal.role]}</dd>
      <dt>{t.status}</dt><dd>{t.active}</dd>
    </dl> : <>
      <p>{t.welcome} <bdi>{principal.name}</bdi></p>
      <p>{t[principal.role]}</p>
      <Link href={`/${locale}/profile`}>{t.profile}</Link>
      {principal.role === 'STUDENT' && <p><Link href={`/${locale}/learning`}>{learningCopy(locale).learning}</Link></p>}
      {account === 'dashboard' && (principal.role === 'OWNER' || principal.role === 'ADMIN')
        && <p><Link href={`/${locale}/admin/users`}>{t.admin}</Link></p>}
    </>}
  </section>;
}
