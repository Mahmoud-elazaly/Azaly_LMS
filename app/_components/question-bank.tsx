'use client';

import { useState, type FormEvent } from 'react';
import { assessmentCopy } from '@/features/assessment/copy';
import { bankContent, type BankQuestion } from '@/features/assessment/policy';
import { direction, locales, type Locale } from '@/i18n/locales';
import { postContent } from './content-request';

type Labels = ReturnType<typeof assessmentCopy>;
type QuestionMutation = { operation: 'create'; question: unknown }
  | { operation: 'save'; id: string; version: number; question: unknown }
  | { operation: 'archive'; id: string; version: number };

function readQuestion(form: FormData, count: number) {
  function translation(language: Locale) {
    return {
      prompt: form.get(`${language}-prompt`),
      explanation: form.get(`${language}-explanation`),
      choices: Array.from({ length: count }, (_, index) => form.get(`${language}-choice-${index}`)),
    };
  }
  return bankContent.safeParse({
    translations: { ar: translation('ar'), en: translation('en') },
    correct: Number(form.get('correct')),
    tags: String(form.get('tags') ?? '').split(/[,،]/).map((tag) => tag.trim()).filter(Boolean),
  });
}

function QuestionForm({ question, text, pending, save, invalid }: {
  question?: BankQuestion; text: Labels; pending: boolean;
  save: (input: QuestionMutation) => void; invalid: () => void;
}) {
  const [count, setCount] = useState(question?.translations.en.choices.length ?? 2);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const content = readQuestion(new FormData(event.currentTarget), count);
    if (!content.success) { invalid(); return; }
    save(question
      ? { operation: 'save', id: question.id, version: question.version, question: content.data }
      : { operation: 'create', question: content.data });
  }

  return <form className="builder-fields" method="post" action="/api/question-bank" onSubmit={submit}>
    <fieldset className="builder-fields" disabled={pending || question?.archived}>
      <label>{text.choiceCount}<select value={count} onChange={(event) => setCount(Number(event.target.value))}>
        {[2, 3, 4].map((option) => <option key={option}>{option}</option>)}
      </select></label>
      {locales.map((language) => {
        const content = question?.translations[language];
        return <fieldset className="notice builder-fields" key={language} lang={language} dir={direction(language)}>
          <legend>{language === 'ar' ? 'العربية' : 'English'}</legend>
          <label>{assessmentCopy(language).prompt}<input name={`${language}-prompt`} defaultValue={content?.prompt}
            required maxLength={160} /></label>
          {Array.from({ length: count }, (_, index) => <label key={index}>{assessmentCopy(language).choice} {index + 1}
            <input name={`${language}-choice-${index}`} defaultValue={content?.choices[index]} required maxLength={300} />
          </label>)}
          <label>{assessmentCopy(language).explanation}<textarea name={`${language}-explanation`} defaultValue={content?.explanation}
            rows={3} required maxLength={2000} /></label>
        </fieldset>;
      })}
      <label>{text.correct}<select name="correct" defaultValue={question?.correct ?? 0}>
        {Array.from({ length: count }, (_, index) => <option key={index} value={index}>{index + 1}</option>)}
      </select></label>
      <label>{text.tags}<input name="tags" dir="auto" defaultValue={question?.tags.join(', ')} maxLength={492} /></label>
      {!question?.archived && <div className="builder-controls">
        <button className="identity-button" type="submit">{text.save}</button>
        {question && <button className="identity-button" type="button" onClick={() => {
          if (window.confirm(text.confirmArchive)) save({ operation: 'archive', id: question.id, version: question.version });
        }}>{text.archive}</button>}
      </div>}
    </fieldset>
  </form>;
}

export function QuestionBank({ locale, initial }: { locale: Locale; initial: BankQuestion[] }) {
  const text = assessmentCopy(locale);
  const [questions, setQuestions] = useState(initial);
  const [selected, setSelected] = useState<string>();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; message: string }>();
  const question = questions.find(({ id }) => id === selected);

  async function save(input: QuestionMutation) {
    setPending(true);
    setNotice(undefined);
    try {
      const saved = await postContent<BankQuestion>('/api/question-bank', input);
      setQuestions((entries) => [saved, ...entries.filter(({ id }) => id !== saved.id)]);
      setSelected(saved.id);
      setNotice({ error: false, message: saved.archived ? text.archivedNotice : text.saved });
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      const message = code === '409' ? text.conflict : code === '400' ? text.invalid
        : code === '403' ? text.denied : text.unavailable;
      setNotice({ error: true, message });
    } finally {
      setPending(false);
    }
  }

  return <div className="builder-fields" aria-busy={pending}>
    <div className="builder-controls">
      <button className="identity-button" type="button" disabled={pending} aria-pressed={!selected}
        onClick={() => { setSelected(undefined); setNotice(undefined); }}>{text.create}</button>
      {questions.map((item) => <button className="identity-button" type="button" key={item.id} disabled={pending}
        aria-pressed={selected === item.id} onClick={() => { setSelected(item.id); setNotice(undefined); }}>
        <bdi>{item.translations[locale].prompt}</bdi>{item.archived && <span> ({text.archived})</span>}
      </button>)}
    </div>
    {questions.length === 0 && <p>{text.empty}</p>}
    {notice && <p role={notice.error ? 'alert' : 'status'}>{notice.message}</p>}
    <QuestionForm key={question ? `${question.id}-${question.version}` : 'new'} question={question} text={text}
      pending={pending} save={(input) => void save(input)} invalid={() => setNotice({ error: true, message: text.invalid })} />
  </div>;
}
