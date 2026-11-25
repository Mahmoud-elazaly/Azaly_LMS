import Link from 'next/link';
import { masteryCopy } from '@/features/mastery/copy';
import type { Material } from '@/features/mastery/model';
import type { Locale } from '@/i18n/locales';

export function masteryFormat(locale: Locale) {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 });
}

export function PracticeLink({ item, locale, labsEnabled }: { item: Material; locale: Locale; labsEnabled: boolean }) {
  const t = masteryCopy(locale);
  const title = item.kind === 'real' ? t.realTitle : item.title;
  let href: string | undefined;
  if (item.kind === 'real') {
    if (labsEnabled) href = `/${locale}/real-lab`;
  } else if (item.enrollmentId) {
    const base = `/${locale}/learning?id=${item.enrollmentId}`;
    href = item.kind === 'lesson' ? `${base}&lesson=${item.id}#current-lesson`
      : `${base}#${item.kind === 'quiz' ? 'quiz' : 'guided'}-${item.id}`;
  } else {
    href = `/${locale}/courses/${item.courseSlug}`;
  }
  return <div className="mastery-practice">
    <span className="mastery-kind">{t[item.kind]}</span>
    {href ? <Link prefetch={false} href={href}><bdi>{title}</bdi></Link> : <span>{title}</span>}
    {item.kind !== 'real' && !item.enrollmentId && <small>{t.enroll} · <bdi>{item.courseTitle}</bdi></small>}
    {item.kind === 'lesson' && item.completed && <small>{t.complete}</small>}
    {item.kind === 'guided' && item.provenance && <small>{item.review === 'NOT_APPROVED' ? t.rejected
      : item.provenance === 'INSTRUCTOR_REVIEWED' ? t.instructorReviewed : t.selfReported}</small>}
    {item.kind === 'real' && item.provenance && <small>{t.verify}</small>}
  </div>;
}
