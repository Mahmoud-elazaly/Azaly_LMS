import { notFound } from 'next/navigation';
import { isLocale } from '@/i18n/locales';
import { copy } from '@/i18n/messages';

export default async function About({ params }: PageProps<'/[locale]/about'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = copy(locale);

  return <article className="page-copy">
    <h1>{t('about')}</h1>
    <p>{t.rich('aboutIntro', {
      name: t('brand'),
      brand: (name) => <bdi lang="en" dir="ltr" translate="no">{name}</bdi>,
    })}</p>
    <h2>{t('practice')}</h2><p>{t('practiceDetail')}</p>
    <pre dir="ltr" aria-label={t('example')}><code>uname -r</code></pre>
  </article>;
}
