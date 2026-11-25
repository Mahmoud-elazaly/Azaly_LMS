import { notFound } from 'next/navigation';
import { isLocale } from '@/i18n/locales';
import { MasteryPage } from '../../_components/mastery/page';

export default async function AnalyticsPage({ params }: PageProps<'/[locale]/mastery'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <MasteryPage graph={false} locale={locale} />;
}
