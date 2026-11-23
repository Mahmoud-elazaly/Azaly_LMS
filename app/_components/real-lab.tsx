'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { realLabCopy } from '@/features/real-lab/copy';
import { canOpenWorkspace, parseProxyDirective, starterDirective, type LabAttempt, type LabRequest } from '@/features/real-lab/policy';
import type { Locale } from '@/i18n/locales';
import { postContent } from './content-request';

type LabCopy = ReturnType<typeof realLabCopy>;

function message(error: unknown, copy: LabCopy) {
  if (error instanceof Error && error.message === '409') return copy.conflict;
  if (error instanceof Error && error.message === '429') return copy.quota;
  return copy.unavailable;
}

function Result({ attempt, copy }: { attempt: LabAttempt; copy: LabCopy }) {
  const check = attempt.check;
  if (!check) return null;
  return <div className="notice builder-fields" role="status">
    {check.completionProvenance === 'SYSTEM_VERIFIED' && <strong>{copy.verified}</strong>}
    <ul>
      <li>{check.configurationOk ? copy.correctConfig : copy.wrongConfig}</li>
      <li>{check.responseOk ? copy.correctResponse : copy.wrongResponse}</li>
    </ul>
  </div>;
}

function Workspace({ attempt, copy, busy, validate }: {
  attempt: LabAttempt; copy: LabCopy; busy: boolean; validate: () => void;
}) {
  const [configuration, setConfiguration] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [preview, setPreview] = useState('');
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ error?: boolean; text: string }>();
  const editor = useRef<HTMLTextAreaElement>(null);
  const dirty = configuration !== saved;
  const open = canOpenWorkspace(attempt.state);
  const editable = open && configuration !== null && attempt.state !== 'PASSED';
  const id = attempt.id;

  useEffect(() => {
    if (!open || saved !== null) return;
    let current = true;
    void postContent<{ configuration: string }>('/api/real-lab', { operation: 'config', id }).then((response) => {
      if (current) {
        setConfiguration(response.configuration);
        setSaved(response.configuration);
      }
    }).catch((error) => {
      if (current) setNotice({ error: true, text: message(error, copy) });
    });
    return () => { current = false; };
  }, [copy, id, open, saved]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function command(operation: 'config' | 'apply' | 'preview') {
    if (operation === 'apply' && !parseProxyDirective(configuration ?? '')) {
      setNotice({ error: true, text: copy.invalidConfig });
      editor.current?.focus();
      return;
    }
    setPending(true);
    setNotice(undefined);
    try {
      if (operation === 'preview') {
        const response = await postContent<{ body: string }>('/api/real-lab', { operation, id });
        setPreview(response.body);
      } else {
        const response = await postContent<{ configuration: string }>('/api/real-lab',
          operation === 'apply' ? { operation, id, configuration } : { operation, id });
        setConfiguration(response.configuration);
        setSaved(response.configuration);
        if (operation === 'apply') {
          setPreview('');
          setNotice({ text: copy.applied });
        }
      }
    } catch (error) {
      setNotice({ error: true, text: message(error, copy) });
    } finally {
      setPending(false);
    }
  }

  function apply(event: FormEvent) {
    event.preventDefault();
    void command('apply');
  }

  const disabled = pending || busy || !open;
  return <div className="real-lab-workspace">
    <form className="notice builder-fields" onSubmit={apply} aria-busy={pending}>
      <h2>{copy.editor}</h2>
      <p id="lab-config-hint">{copy.hint}</p>
      <label htmlFor="lab-configuration">{copy.directive}</label>
      <textarea ref={editor} id="lab-configuration" name="configuration" aria-describedby="lab-config-hint"
        dir="ltr" translate="no" spellCheck={false} autoComplete="off" rows={3} maxLength={96}
        value={configuration ?? starterDirective} readOnly={!editable || disabled}
        onChange={(event) => setConfiguration(event.target.value)} />
      <div className="builder-controls">
        {editable && <button type="submit" className="identity-button" disabled={disabled}>{copy.apply}</button>}
        <button type="button" className="identity-button" disabled={disabled} onClick={() => void command('config')}>{copy.reload}</button>
      </div>
      {notice && <p role={notice.error ? 'alert' : 'status'}>{notice.text}</p>}
      {pending && <p role="status">{copy.working}</p>}
    </form>
    <section className="notice builder-fields">
      <h2>{copy.proxy}</h2>
      {preview && <pre dir="ltr" translate="no" tabIndex={0} role="group" aria-label={copy.proxy}><code>{preview}</code></pre>}
      <div className="builder-controls">
        <button type="button" className="identity-button" disabled={disabled}
          onClick={() => void command('preview')}>{copy.preview}</button>
        <button type="button" className="identity-button" disabled={disabled || dirty || !editable}
          onClick={validate}>{copy.check}</button>
      </div>
      <Result attempt={attempt} copy={copy} />
    </section>
  </div>;
}

export function RealLab({ locale, initial }: { locale: Locale; initial: LabAttempt | null }) {
  const copy = realLabCopy(locale);
  const [attempt, setAttempt] = useState(initial);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const startId = useRef<string | null>(null);
  const active = Boolean(attempt && attempt.state !== 'DESTROYED');

  useEffect(() => {
    if (!active || pending) return;
    const controller = new AbortController();
    async function refresh() {
      try {
        const response = await fetch('/api/real-lab', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error(String(response.status));
        const latest: LabAttempt | null = await response.json();
        if (!controller.signal.aborted) setAttempt(latest);
      } catch (error) {
        if (!controller.signal.aborted) setNotice(message(error, copy));
      }
    }
    const interval = window.setInterval(() => void refresh(), 1200);
    return () => { controller.abort(); window.clearInterval(interval); };
  }, [active, copy, pending]);

  async function submit(input: LabRequest) {
    setPending(true);
    setNotice('');
    try {
      setAttempt(await postContent<LabAttempt>('/api/real-lab', input));
      if (input.operation === 'start') startId.current = null;
    } catch (error) {
      setNotice(message(error, copy));
    } finally {
      setPending(false);
    }
  }

  function start() {
    startId.current ??= crypto.randomUUID();
    void submit({ operation: 'start', requestId: startId.current });
  }

  function end(operation: 'stop' | 'reset') {
    if (attempt && window.confirm(operation === 'reset' ? copy.confirmReset : copy.confirmStop)) {
      void submit({ operation, id: attempt.id });
    }
  }

  const canStop = active && attempt?.state !== 'STOPPING' && attempt?.state !== 'CLEANUP_FAILED';
  const showWorkspace = attempt && (canOpenWorkspace(attempt.state) || attempt.state === 'VALIDATING');
  return <div className="real-lab builder-fields">
    <section className="notice builder-fields">
      <h2>{copy.status}</h2>
      <p role="status">{attempt ? copy.states[attempt.state] : copy.noAttempt}</p>
      {active && attempt && <p>{copy.expires} <time dateTime={attempt.expiresAt}><bdi>
        {new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: 'numeric', timeZone: 'UTC', timeZoneName: 'short' })
          .format(new Date(attempt.expiresAt))}
      </bdi></time></p>}
      {attempt?.endReason && <p>{copy.reasons[attempt.endReason]}</p>}
      <div className="builder-controls">
        {!active && <button type="button" className="identity-button" disabled={pending}
          onClick={start}>{pending ? copy.starting : copy.start}</button>}
        {canStop && <>
          <button type="button" className="identity-button" disabled={pending} onClick={() => end('stop')}>{copy.stop}</button>
          <button type="button" className="identity-button" disabled={pending} onClick={() => end('reset')}>{copy.reset}</button>
        </>}
      </div>
      {notice && <p role="alert">{notice}</p>}
    </section>
    {showWorkspace && <Workspace key={attempt.id} attempt={attempt} copy={copy} busy={pending}
      validate={() => void submit({ operation: 'validate', id: attempt.id })} />}
    {attempt?.state === 'DESTROYED' && <Result attempt={attempt} copy={copy} />}
  </div>;
}
