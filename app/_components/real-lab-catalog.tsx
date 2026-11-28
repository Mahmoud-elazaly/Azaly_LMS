import Link from 'next/link';
import { realLabHref, templateVersions, type LabTemplateVersion } from '@/features/real-lab/catalog';
import { realLabCopy } from '@/features/real-lab/copy';
import type { Locale } from '@/i18n/locales';

export function RealLabCatalog({ locale, selected, locked }: {
  locale: Locale; selected?: LabTemplateVersion; locked?: boolean;
}) {
  return <nav aria-label={realLabCopy(locale).catalog} className="builder-controls real-lab-catalog">
    {templateVersions.map((version) => {
      const title = realLabCopy(locale, version).title;
      return locked && version !== selected
        ? <span key={version}><bdi>{title}</bdi></span>
        : <Link key={version} href={realLabHref(locale, version)} aria-current={version === selected ? 'page' : undefined}>
          <bdi>{title}</bdi>
        </Link>;
    })}
  </nav>;
}
