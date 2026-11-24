import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isLocale } from '@/i18n/locales';
import { copy } from '@/i18n/messages';
import { AccountIcon } from '../_components/account-icon';

const topics = [
  ['linux', 'linuxDetail', 'terminal'],
  ['platform', 'platformDetail', 'grid'],
  ['operations', 'operationsDetail', 'chart'],
] as const;

export default async function Home({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = copy(locale);

  return <>
    <section className="hero">
      <h1>{t('hero')}</h1>
      <p>{t('intro')}</p>
      <Link className="cta" href={`/${locale}/courses`}>{t('browse')} <AccountIcon name="arrow" /></Link>
    </section>
    <section className="topics" aria-labelledby="topics">
      <h2 id="topics">{t('topics')}</h2>
      <ul className="card-grid">{topics.map(([name, detail, icon]) => <li className="card" key={name}>
        <span className="topic-icon"><AccountIcon name={icon} /></span>
        <h3>{t(name)}</h3><p>{t(detail)}</p>
      </li>)}</ul>
    </section>
  </>;
}
