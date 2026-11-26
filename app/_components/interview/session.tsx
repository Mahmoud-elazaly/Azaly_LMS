import Markdown from 'react-markdown';
import { interviewCopy } from '@/features/interview/copy';
import { interviewLimits, type InterviewSession, type Scorecard } from '@/features/interview/model';
import type { Locale } from '@/i18n/locales';

function InterviewText({ text }: { text: string }) {
  return <div className="interview-text" dir="auto"><Markdown skipHtml unwrapDisallowed
    allowedElements={['p', 'pre', 'code', 'ul', 'ol', 'li', 'strong', 'em', 'blockquote', 'br']}
    components={{
      pre: ({ children }) => <pre dir="ltr" translate="no">{children}</pre>,
      code: ({ children }) => <code dir="ltr" translate="no">{children}</code>,
    }}>{text}</Markdown></div>;
}

export function InterviewTranscript({ session, locale }: { session: InterviewSession; locale: Locale }) {
  const t = interviewCopy(locale);
  const number = new Intl.NumberFormat(locale);
  const limits = [
    [t.turns, session.turns, interviewLimits.turns],
    [t.input, session.inputReserved, interviewLimits.inputTokens],
    [t.output, session.outputReserved, interviewLimits.outputTokens],
  ] as const;

  return <>
    <dl className="interview-metrics" aria-label={t.limits}>{limits.map(([name, used, max]) => <div key={name}>
      <dt>{name}</dt><dd><bdi>{number.format(used)} / {number.format(max)}</bdi></dd>
    </div>)}</dl>
    <ol className="interview-transcript" aria-label={t.transcript}>
      {session.messages.map(({ speaker, text }, index) => <li className="interview-turn" data-speaker={speaker} key={index}
        id={index === session.messages.length - 1 ? 'interview-latest-question' : undefined}
        tabIndex={index === session.messages.length - 1 ? -1 : undefined}>
        <p className="interview-speaker">{speaker === 'learner' ? t.learner : t.interviewer}</p>
        <InterviewText text={text} />
      </li>)}
    </ol>
  </>;
}

export function InterviewScorecard({ scorecard, locale }: { scorecard: Scorecard; locale: Locale }) {
  const t = interviewCopy(locale);
  const format = new Intl.NumberFormat(locale, { style: 'percent' });
  const scores = [[t.overall, scorecard.overall_score], [t.technical, scorecard.technical_accuracy],
    [t.production, scorecard.production_and_security_awareness]] as const;

  return <section className="interview-scorecard" aria-labelledby="interview-scorecard-title">
    <h3 id="interview-scorecard-title" tabIndex={-1}>{t.scorecard}</h3>
    <dl className="interview-metrics">{scores.map(([name, score]) => <div key={name}>
      <dt>{name}</dt><dd><bdi>{format.format(score / 100)}</bdi></dd>
    </div>)}</dl>
    <h4>{t.edgeCases}</h4>
    {scorecard.missing_edge_cases.length ? <ul className="interview-edge-cases">
      {scorecard.missing_edge_cases.map((text, index) => <li key={index}><InterviewText text={text} /></li>)}
    </ul> : <p>{t.noEdgeCases}</p>}
    <h4>{t.modelAnswer}</h4>
    <InterviewText text={scorecard.model_answer} />
    <h4>{t.practice}</h4>
    {scorecard.weak_concept_slugs.length ? <ul className="interview-concepts">
      {scorecard.weak_concept_slugs.map((slug) => <li key={slug}>
        <a href={`/${locale}/knowledge-graph?concept=${encodeURIComponent(slug)}`}><bdi dir="ltr">{slug}</bdi></a>
      </li>)}
    </ul> : <p>{t.noWeak}</p>}
    <a href={`/${locale}/knowledge-graph`}>{t.graph}</a>
  </section>;
}
