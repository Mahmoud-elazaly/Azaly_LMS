import { notFound, redirect } from 'next/navigation';
import { assessmentCopy } from '@/features/assessment/copy';
import { listBankQuestions } from '@/features/assessment/service';
import { authorRoles } from '@/features/authoring/policy';
import { currentPrincipal } from '@/features/identity/session';
import { isLocale } from '@/i18n/locales';
import { QuestionBank } from '../../_components/question-bank';
import { AuthoringNavigation } from '../../_components/authoring-navigation';

export default async function QuestionBankPage({ params }: PageProps<'/[locale]/question-bank'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const text = assessmentCopy(locale);
  const principal = await currentPrincipal();
  if (!principal) redirect(`/${locale}/login?next=/${locale}/question-bank`);
  if (!authorRoles.some((role) => role === principal.role)) {
    return <section className="page-copy"><h1>{text.bank}</h1><p>{text.denied}</p></section>;
  }
  const questions = await listBankQuestions().catch(() => null);
  return <section className="page-copy">
    <h1>{text.bank}</h1>
    <AuthoringNavigation locale={locale} active="question-bank" />
    {questions ? <QuestionBank locale={locale} initial={questions} /> : <p role="alert">{text.unavailable}</p>}
  </section>;
}
