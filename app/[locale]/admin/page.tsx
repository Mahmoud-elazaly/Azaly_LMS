import { notFound, redirect } from 'next/navigation';
import { isLocale } from '@/i18n/locales';

export default async function AdminPage({ params }: PageProps<'/[locale]/admin'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  redirect(`/${locale}/admin/users`);
}
