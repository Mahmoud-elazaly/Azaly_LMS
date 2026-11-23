'use client';

import { useState, type FormEvent } from 'react';
import { guidedCopy } from '@/features/guided/copy';
import type { GuidedAttempt, GuidedLab, ReviewEntry } from '@/features/guided/policy';
import type { Locale } from '@/i18n/locales';
import { postContent } from './content-request';

function Provenance({ attempt, locale }: { attempt: GuidedAttempt; locale: Locale }) {
  const text = guidedCopy(locale);
  const review = attempt.review;
  return <div className="guided-provenance">
    <span className="guided-badge">{text.selfReported}</span>
    {review ? <>
      <span className="guided-badge" data-reviewed>{text.instructorReviewed}</span>
      <p>{text[review.decision]}</p>
      {review.feedback && <p className="guided-text" dir="auto">{review.feedback}</p>}
      <time dateTime={review.reviewedAt}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' })
        .format(new Date(review.reviewedAt))}</time>
    </> : <p>{text.awaiting}</p>}
  </div>;
}

function LabInstructions({ lab, locale }: { lab: GuidedLab; locale: Locale }) {
  const text = guidedCopy(locale);
  return <>
    <p className="guided-text">{lab.instructions}</p>
    {(lab.commands || lab.starter) && <p>{text.informational}</p>}
    {lab.commands && <div>
      <h4>{text.commands}</h4>
      <pre className="guided-code" dir="ltr" translate="no" tabIndex={0} role="group" aria-label={text.commands}><code>{lab.commands}</code></pre>
    </div>}
    {lab.starter && <div>
      <h4>{text.starter}</h4>
      <pre className="guided-code" dir="ltr" translate="no" tabIndex={0} role="group" aria-label={text.starter}><code>{lab.starter}</code></pre>
    </div>}
  </>;
}

function LearnerLab({ lab, locale, enrollmentId }: { lab: GuidedLab; locale: Locale; enrollmentId: string }) {
  const text = guidedCopy(locale);
  const [attempt, setAttempt] = useState(lab.attempt);
  const [checkpoints, setCheckpoints] = useState(lab.attempt?.checkpointIds ?? []);
  const [evidence, setEvidence] = useState(lab.attempt?.evidence ?? '');
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; message: string }>();
  const submitted = attempt?.completionProvenance === 'SELF_REPORTED';
  const hasAll = checkpoints.length === lab.checkpoints.length;

  function toggle(id: string, checked: boolean) {
    setCheckpoints((current) => checked ? [...current, id] : current.filter((value) => value !== id));
  }

  async function save(operation: 'save' | 'complete') {
    if (pending || submitted || (operation === 'complete' && !hasAll)) return;
    setPending(true);
    setNotice(undefined);
    try {
      const saved = await postContent<GuidedAttempt>('/api/learning/guided-labs', {
        operation, locale, id: enrollmentId, labId: lab.id, checkpointIds: checkpoints, evidence,
        completionProvenance: 'SELF_REPORTED',
      });
      setAttempt(saved);
      setEvidence(saved.evidence);
      setNotice({ error: false, message: operation === 'complete' ? text.reported : text.saved });
    } catch {
      setNotice({ error: true, message: text.error });
    } finally {
      setPending(false);
    }
  }

  return <article className="notice builder-fields guided-card" aria-busy={pending}>
    <h3>{lab.title}</h3>
    <LabInstructions lab={lab} locale={locale} />
    <form className="builder-fields" method="post" action="/api/learning/guided-labs"
      onSubmit={(event) => { event.preventDefault(); void save('save'); }}>
      <fieldset className="builder-fields" disabled={pending || submitted}>
        <legend>{text.checkpoints}</legend>
        {lab.checkpoints.map((step) => <label className="learning-choice" key={step.id}>
          <input type="checkbox" checked={checkpoints.includes(step.id)}
            onChange={(event) => toggle(step.id, event.target.checked)} /> <span>{step.label}</span>
        </label>)}
      </fieldset>
      {submitted ? <Provenance attempt={attempt} locale={locale} /> : <>
        {lab.evidencePrompt && <p className="guided-text">{lab.evidencePrompt}</p>}
        <label>{text.evidence}<textarea name="evidence" dir="auto" rows={3} maxLength={4000} value={evidence}
          disabled={pending} onChange={(event) => setEvidence(event.target.value)} /></label>
        {!hasAll && <p>{text.allCheckpoints}</p>}
        <div className="builder-controls">
          <button type="submit" className="identity-button" disabled={pending}>{text.saveProgress}</button>
          <button type="button" className="identity-button" disabled={pending || !hasAll}
            onClick={() => void save('complete')}>{text.complete}</button>
        </div>
      </>}
      {submitted && evidence && <div><strong>{text.evidence}</strong><p className="guided-text" dir="auto">{evidence}</p></div>}
      {pending && <p role="status">{text.pending}</p>}
      {notice && <p role={notice.error ? 'alert' : 'status'}>{notice.message}</p>}
    </form>
  </article>;
}

export function GuidedLabs({ labs, locale, enrollmentId }: { labs: GuidedLab[]; locale: Locale; enrollmentId: string }) {
  if (labs.length === 0) return null;
  return <section className="builder-fields">
    <h2>{guidedCopy(locale).labs}</h2>
    {labs.map((lab) => <LearnerLab key={lab.id} lab={lab} locale={locale} enrollmentId={enrollmentId} />)}
  </section>;
}

export function GuidedReviewCard({ entry, locale }: { entry: ReviewEntry; locale: Locale }) {
  const text = guidedCopy(locale);
  const [attempt, setAttempt] = useState(entry.attempt);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const values = new FormData(event.currentTarget);
    setPending(true);
    setFailed(false);
    try {
      const reviewed = await postContent<GuidedAttempt>(`/api/guided-reviews?locale=${locale}`, {
        attemptId: attempt.id, decision: values.get('decision'), feedback: values.get('feedback'),
        completionProvenance: 'INSTRUCTOR_REVIEWED',
      });
      setAttempt(reviewed);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return <article className="notice builder-fields guided-card" aria-busy={pending}>
    <h2>{entry.title}</h2>
    <p>{entry.course} · {text.learner} <bdi>{entry.learner}</bdi></p>
    <Provenance attempt={attempt} locale={locale} />
    <h3>{text.checkpoints}</h3>
    <ol>{entry.checkpoints.map((checkpoint) => <li key={checkpoint.id}>{checkpoint.label}</li>)}</ol>
    <p className="guided-text" dir="auto">{attempt.evidence || text.noEvidence}</p>
    {!attempt.review && <form method="post" action={`/api/guided-reviews?locale=${locale}`} onSubmit={submit}>
      <fieldset className="builder-fields" disabled={pending}>
        <label>{text.decision}<select name="decision">
          <option value="APPROVED">{text.APPROVED}</option>
          <option value="NOT_APPROVED">{text.NOT_APPROVED}</option>
        </select></label>
        <label>{text.feedback}<textarea name="feedback" dir="auto" rows={3} maxLength={2000} /></label>
        <button type="submit" className="identity-button">{pending ? text.pending : text.recordReview}</button>
      </fieldset>
      {failed && <p role="alert">{text.error}</p>}
    </form>}
    {attempt.review && !entry.attempt.review && <p role="status">{text.reviewed}</p>}
  </article>;
}
