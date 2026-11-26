'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { interviewCopy } from '@/features/interview/copy';
import { answerBytes, interviewLimits, interviewRoles, interviewTracks, seniorities, type InterviewSession,
  type InterviewSummary, type InterviewTrack } from '@/features/interview/model';
import type { Locale } from '@/i18n/locales';
import { InterviewScorecard, InterviewTranscript } from './session';

const historyPageSize = 20;

async function request<T>(path: string, payload?: object): Promise<T> {
  const response = await fetch(`/api/interview/${path}`, payload ? {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  } : { cache: 'no-store' });
  if (!response.ok) throw response.status;
  return response.json();
}

export function InterviewWorkspace({ locale, initialHistory }: { locale: Locale; initialHistory: InterviewSummary[] }) {
  const t = interviewCopy(locale);
  const [history, setHistory] = useState(initialHistory);
  const [hasOlder, setHasOlder] = useState(initialHistory.length === historyPageSize);
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [selected, setSelected] = useState<InterviewTrack[]>(['observability']);
  const [answer, setAnswer] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [focusId, setFocusId] = useState('');

  useEffect(() => {
    if (focusId) document.getElementById(focusId)?.focus();
  }, [focusId]);

  async function update(action: () => Promise<void>) {
    setWorking(true);
    setError('');
    setFeedback('');
    setFocusId('');
    try {
      await action();
    } catch (status) {
      setError(typeof status === 'number' && status in t.errors ? t.errors[status as keyof typeof t.errors] : t.errors[503]);
    } finally {
      setWorking(false);
    }
  }

  function open(next: InterviewSession) {
    setSession(next);
    const summary: InterviewSummary = {
      id: next.id, createdAt: next.createdAt, completedAt: next.completedAt, role: next.role,
      seniority: next.seniority, tracks: next.tracks, locale: next.locale, turns: next.turns,
      inputReserved: next.inputReserved, outputReserved: next.outputReserved,
    };
    setHistory((entries) => {
      const index = entries.findIndex(({ id }) => id === next.id);
      return index < 0 ? [summary, ...entries] : entries.map((entry) => entry.id === summary.id ? summary : entry);
    });
    setAnswer('');
    setFeedback(t.updated);
  }

  function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void update(async () => {
      open(await request<InterviewSession>('start', {
        role: form.get('role'), seniority: form.get('seniority'), tracks: selected, locale,
      }));
      setFocusId('interview-transcript-title');
    });
  }

  function advance(action: 'message' | 'evaluate') {
    if (!session) return;
    void update(async () => {
      try {
        open(await request<InterviewSession>(action, {
          id: session.id, turn: session.turns, ...(action === 'message' && { answer }),
        }));
        setFocusId(action === 'evaluate' ? 'interview-scorecard-title' : 'interview-latest-question');
      } catch (status) {
        if (status === 409 || status === 422 || status === 502 || status === 503) {
          const refreshed = await request<InterviewSession>(`history?id=${session.id}`).catch(() => null);
          if (refreshed) setSession(refreshed);
        }
        throw status;
      }
    });
  }

  const bytes = answerBytes(answer);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'UTC' });
  return <>
    <div className="interview-feedback">
      <p role="status" aria-atomic="true">{working ? t.working : feedback}</p>
      {error && <p role="alert">{error}</p>}
    </div>
    <div className="interview-layout">
      <section className="interview-panel" aria-labelledby={session ? 'interview-transcript-title' : 'interview-setup-title'}>
        {session ? <>
          <header className="interview-panel-header">
            <div><h2 id="interview-transcript-title" tabIndex={-1}>{t.transcript}</h2>
              <p><bdi>{t.roles[session.role]}</bdi> · {t.levels[session.seniority]}</p>
              <p>{session.tracks.map((track) => t.scopes[track]).join(locale === 'ar' ? '، ' : ', ')}</p>
            </div>
            <button type="button" className="identity-button" disabled={working} onClick={() => {
              setSession(null);
              setAnswer('');
              setError('');
              setFeedback('');
              setFocusId('interview-setup-title');
            }}>{t.newInterview}</button>
          </header>
          <InterviewTranscript session={session} locale={locale} />
          {session.scorecard ? <InterviewScorecard scorecard={session.scorecard} locale={locale} /> :
            <form className="interview-answer" onSubmit={(event) => { event.preventDefault(); advance('message'); }}>
              {session.turns < interviewLimits.turns && <>
                <label htmlFor="interview-answer">{t.answer}</label>
                <textarea id="interview-answer" dir="auto" rows={5} required maxLength={interviewLimits.answerBytes}
                  value={answer} onChange={(event) => setAnswer(event.target.value)} disabled={working}
                  aria-invalid={bytes > interviewLimits.answerBytes} aria-describedby="interview-answer-limit" />
                <p id="interview-answer-limit">{t.answerLimit}</p>
              </>}
              <div className="interview-actions">
                {session.turns < interviewLimits.turns && <button className="identity-button primary-action" type="submit"
                  disabled={working || !answer.trim() || bytes > interviewLimits.answerBytes}>{t.send}</button>}
                <button className={`identity-button${session.turns === interviewLimits.turns ? ' primary-action' : ''}`}
                  type="button" disabled={working || !session.turns} onClick={() => advance('evaluate')}>{t.evaluate}</button>
              </div>
            </form>}
        </> : <>
          <h2 id="interview-setup-title" tabIndex={-1}>{t.setup}</h2>
          <form className="interview-setup" onSubmit={start} aria-describedby="interview-disclosure">
            <div className="interview-selects">
              <label>{t.role}<select name="role" defaultValue="devops" disabled={working}>
                {interviewRoles.map((role) => <option key={role} value={role}>{t.roles[role]}</option>)}
              </select></label>
              <label>{t.seniority}<select name="seniority" defaultValue="mid" disabled={working}>
                {seniorities.map((level) => <option key={level} value={level}>{t.levels[level]}</option>)}
              </select></label>
            </div>
            <fieldset disabled={working}>
              <legend>{t.tracks}</legend>
              <div className="interview-tracks">{interviewTracks.map((track) => <label key={track}>
                <input type="checkbox" checked={selected.includes(track)} onChange={(event) => {
                  setSelected(event.target.checked ? [...selected, track] : selected.filter((scope) => scope !== track));
                }} /> <bdi>{t.scopes[track]}</bdi>
              </label>)}</div>
            </fieldset>
            <p id="interview-disclosure">{t.disclosure}</p>
            <div><button className="identity-button primary-action" disabled={working || !selected.length}>{t.start}</button></div>
          </form>
        </>}
      </section>
      <section className="interview-panel interview-history" aria-labelledby="interview-history-title">
        <h2 id="interview-history-title" tabIndex={-1}>{t.history}</h2>
        {history.length ? <ol>{history.map((entry) => <li key={entry.id}>
          <button className="identity-button" type="button" aria-current={entry.id === session?.id ? 'true' : undefined}
            disabled={working} onClick={() => void update(async () => {
              open(await request<InterviewSession>(`history?id=${entry.id}`));
              setFocusId('interview-transcript-title');
            })}>
            <strong><bdi>{t.roles[entry.role]}</bdi> · {t.levels[entry.seniority]}</strong>
            <span>{entry.tracks.map((track) => t.scopes[track]).join(locale === 'ar' ? '، ' : ', ')}</span>
            <time dateTime={entry.createdAt}><bdi>{date.format(new Date(entry.createdAt))}</bdi> UTC</time>
            <span>{entry.completedAt ? t.completed : t.active}</span>
          </button>
        </li>)}</ol> : <p>{t.empty}</p>}
        {hasOlder && <button className="identity-button" type="button" disabled={working} onClick={() => void update(async () => {
          const older = await request<InterviewSummary[]>(`history?before=${history.at(-1)?.id}`);
          setHistory((entries) => [...entries, ...older]);
          setHasOlder(older.length === historyPageSize);
          setFeedback(older.length ? t.updated : t.noOlder);
          setFocusId('interview-history-title');
        })}>{t.older}</button>}
      </section>
    </div>
  </>;
}
