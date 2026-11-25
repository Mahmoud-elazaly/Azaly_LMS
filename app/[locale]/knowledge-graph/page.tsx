import { notFound } from 'next/navigation';
import { isLocale } from '@/i18n/locales';
import { MasteryPage } from '../../_components/mastery/page';

export default async function GraphPage({ params }: PageProps<'/[locale]/knowledge-graph'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <MasteryPage graph locale={locale} />;
}
