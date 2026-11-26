import { notFound, redirect } from 'next/navigation';
import { AuthorizationError } from '@/features/identity/policy';
import { requireSession } from '@/features/identity/session';
import { interviewCopy } from '@/features/interview/copy';
import { interviewHistory } from '@/features/interview/service';
import { studentRoles } from '@/features/learning/policy';
import { isLocale } from '@/i18n/locales';
import { InterviewWorkspace } from '../../_components/interview/workspace';
import './interview.css';

export default async function InterviewPage({ params }: PageProps<'/[locale]/interview'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = interviewCopy(locale);
  let history;
  try {
    const { token } = await requireSession(studentRoles);
    history = await interviewHistory(token, null);
  } catch (error) {
    if (error instanceof AuthorizationError && error.status === 401) redirect(`/${locale}/login?next=/${locale}/interview`);
    return <section className="page-copy"><h1>{t.title}</h1>
      <p role="alert">{error instanceof AuthorizationError ? t.denied : t.errors[503]}</p>
    </section>;
  }

  return <section className="page-copy interview-page">
    <header><h1>{t.title}</h1><p>{t.intro}</p></header>
    <InterviewWorkspace locale={locale} initialHistory={history} />
  </section>;
}
