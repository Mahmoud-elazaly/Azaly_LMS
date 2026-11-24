import Link from 'next/link';
import { assessmentCopy } from '@/features/assessment/copy';
import { builderCopy } from '@/features/authoring/copy';
import { guidedCopy } from '@/features/guided/copy';
import type { Locale } from '@/i18n/locales';
import { copy } from '@/i18n/messages';

export function AuthoringNavigation({ locale, active }: { locale: Locale; active: 'builder' | 'question-bank' | 'guided-reviews' }) {
  const t = copy(locale);
  const links = [
    { path: 'question-bank', label: assessmentCopy(locale).bank },
    { path: 'guided-reviews', label: guidedCopy(locale).queue },
    { path: 'builder#course-importer', label: t('courseImporter') },
  ];
  return <div className="authoring-navigation">
    <nav className="authoring-tabs" aria-label={t('authoringTools')}>
      {links.map(({ path, label }) => path === active
        ? <span key={path} aria-current="page">{label}</span>
        : <Link key={path} href={active === 'builder' && path === 'builder#course-importer' ? '#course-importer' : `/${locale}/${path}`}>
          {label}
        </Link>)}
    </nav>
    {active !== 'builder' && <Link className="authoring-back" href={`/${locale}/builder`}>{builderCopy(locale).builder}</Link>}
  </div>;
}
