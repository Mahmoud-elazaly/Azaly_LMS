import { redirect } from 'next/navigation';
import { currentPrincipal } from '@/features/identity/session';
import { masteryCopy } from '@/features/mastery/copy';
import { readMastery } from '@/features/mastery/service';
import { realLabEnabled } from '@/features/real-lab/service';
import type { Locale } from '@/i18n/locales';
import { MasteryDashboard } from './dashboard';
import { KnowledgeGraph } from './graph';
import { RefreshMastery } from './refresh';

export async function MasteryPage({ locale, graph }: { locale: Locale; graph: boolean }) {
  const t = masteryCopy(locale);
  const path = graph ? 'knowledge-graph' : 'mastery';
  const principal = await currentPrincipal();
  if (!principal) redirect(`/${locale}/login?next=/${locale}/${path}`);
  const data = principal.role === 'STUDENT' ? await readMastery(locale).catch(() => null) : null;
  const labsEnabled = realLabEnabled();
  return <section className="page-copy mastery-page">
    <header className="mastery-heading">
      <div><h1>{graph ? t.graph : t.mastery}</h1>
        {principal.role === 'STUDENT' && <p>{graph ? t.graphIntro : t.masteryIntro}</p>}
      </div>
      {principal.role === 'STUDENT' && <div className="mastery-heading-actions">
        <a className="identity-button" href={`/${locale}/${graph ? 'mastery' : 'knowledge-graph'}`}>
          {graph ? t.mastery : t.graph}
        </a>
        <RefreshMastery locale={locale} />
      </div>}
    </header>
    {principal.role !== 'STUDENT' ? <p>{t.denied}</p> : data === null ? <p role="alert">{t.error}</p>
      : graph ? <KnowledgeGraph concepts={data.concepts} edges={data.edges} locale={locale} labsEnabled={labsEnabled} />
        : <MasteryDashboard data={data} locale={locale} labsEnabled={labsEnabled} />}
  </section>;
}
