import Link from 'next/link';
import { notFound } from 'next/navigation';
import { identityCopy } from '@/features/identity/copy';
import { isLocale } from '@/i18n/locales';
import { AccountIcon } from '../../_components/account-icon';
import { ActivationForm } from '../../_components/auth-form';

export default async function ActivatePage({ params }: PageProps<'/[locale]/activate'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = identityCopy(locale);
  return <div className="account-page">
    <div className="account-intro">
      <h1>{t.activationTitle}</h1>
      <p>{t.activationIntro}</p>
    </div>
    <section className="account-card" aria-label={t.activationTitle}>
      <div className="account-card-heading"><span className="account-icon-tile"><AccountIcon name="shield" /></span></div>
      <ActivationForm locale={locale} />
      <p className="account-managed"><Link href={`/${locale}/login`}>{t.login}</Link></p>
    </section>
  </div>;
}
