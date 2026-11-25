'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { assessmentCopy } from '@/features/assessment/copy';
import type { LearnerAnswer, LearnerQuestion } from '@/features/assessment/policy';
import { learningCopy } from '@/features/learning/copy';
import { progressPercent, type LearnerInput } from '@/features/learning/policy';
import type { Grade, PlayerBlock, PlayerData, Quiz } from '@/features/learning/service';
import type { Locale } from '@/i18n/locales';
import { GuidedLabs } from './guided-labs';
import { LessonMarkdown } from './lesson-markdown';
import { SnippetLines } from './snippet-lines';

async function send(input: LearnerInput): Promise<Response> {
  const response = await fetch('/api/learning', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(String(response.status));
  return response;
}

export function EnrollButton({ slug, locale }: { slug: string; locale: Locale }) {
  const router = useRouter();
  const text = learningCopy(locale);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function enroll() {
    setPending(true);
    setFailed(false);
    try {
      const { id }: { id: string } = await (await send({ operation: 'enroll', slug, locale })).json();
      router.push(`/${locale}/learning?id=${encodeURIComponent(id)}`);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return <div>
    <button type="button" className="identity-button" onClick={() => void enroll()} disabled={pending}>{pending ? text.pending : text.enroll}</button>
    {failed && <p role="alert">{text.unavailable}</p>}
  </div>;
}

function ContentBlock({ block, codeLabel, locale }: { block: PlayerBlock; codeLabel: string; locale: Locale }) {
  if (block.type === 'code') {
    return <pre dir="ltr" translate="no" tabIndex={0} role="group" aria-label={codeLabel}><code>{block.text}</code></pre>;
  }
  if (block.type === 'heading') return <h3>{block.text}</h3>;
  if (block.type === 'callout') return <aside className="notice">{block.text}</aside>;
  if (block.type === 'markdown') return <LessonMarkdown source={block.text} locale={locale} codeLabel={codeLabel} />;
  return <p>{block.text}</p>;
}

function readAnswer(form: FormData, question: LearnerQuestion): LearnerAnswer {
  if (question.type === 'find_bug') return form.getAll(question.id).map(Number);
  if (question.type === 'cli_recall') return String(form.get(question.id) ?? '');
  return Number(form.get(question.id) ?? -1);
}

function QuestionFields({ question, locale }: { question: LearnerQuestion; locale: Locale }) {
  const labels = assessmentCopy(locale);
  if (question.type === 'find_bug') return <>
    <p>{labels.selectLines}</p>
    <SnippetLines source={question.snippet} label={labels.snippet} selection={{ name: question.id, lineLabel: labels.line }} />
  </>;
  if (question.type === 'cli_recall') return <label>{labels.command}
    <input name={question.id} className="cli-field" dir="ltr" translate="no" type="text" required maxLength={512}
      autoComplete="off" autoCapitalize="none" spellCheck={false} />
  </label>;
  return question.choices.map((choice, index) => <label className="learning-choice" key={index}>
    <input type="radio" name={question.id} value={index} required /> <span>{choice}</span>
  </label>);
}

function QuizForm({ quiz, enrollment, locale, onGrade }: {
  quiz: Quiz; enrollment: string; locale: Locale; onGrade: (grade: Grade) => void;
}) {
  const text = learningCopy(locale);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const retry = useRef<{ answers: string; id: string } | undefined>(undefined);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const answers = Object.fromEntries(quiz.questions.map((question) => [question.id, readAnswer(form, question)]));
    if (Object.values(answers).some((answer) => Array.isArray(answer) && answer.length === 0)) {
      setFailed(true);
      return;
    }
    const serialized = JSON.stringify(answers);
    const attempt = retry.current?.answers === serialized ? retry.current : { answers: serialized, id: crypto.randomUUID() };
    retry.current = attempt;
    setPending(true);
    setFailed(false);
    try {
      const result: Grade = await (await send({
        operation: 'submit', locale, id: enrollment, quizId: quiz.id, attemptId: attempt.id, answers,
      })).json();
      retry.current = undefined;
      onGrade({ ...result, quizId: quiz.id });
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return <form id={`quiz-${quiz.id}`} className="notice builder-fields" tabIndex={-1} onSubmit={submit}>
    <h3>{quiz.title}</h3>
    {quiz.questions.map((question) => <fieldset key={question.id} disabled={pending}>
      <legend>{question.prompt}</legend>
      <QuestionFields question={question} locale={locale} />
    </fieldset>)}
    <button className="identity-button" disabled={pending}>{pending ? text.pending : text.submit}</button>
    {failed && <p role="alert">{text.error}</p>}
  </form>;
}

export function CoursePlayer({ locale, data, lessonId }: { locale: Locale; data: PlayerData; lessonId?: string }) {
  const text = learningCopy(locale);
  const lessons = data.content?.modules.flatMap((courseModule) => courseModule.lessons) ?? [];
  const [active, setActive] = useState(lessons.find((item) => item.id === lessonId)?.id ?? data.resumeLessonId ?? lessons[0]?.id);
  const [progress, setProgress] = useState(data.progress);
  const [grades, setGrades] = useState(data.grades);
  const [last, setLast] = useState<Grade>();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const lesson = lessons.find((candidate) => candidate.id === active);
  const current = progress.find((entry) => entry.lessonId === active);
  const completed = progress.filter((item) => item.completed).length;
  const bookmarked = lessons.filter((item) => progress.some((entry) => entry.lessonId === item.id && entry.bookmarked));

  async function update(operation: 'resume' | 'complete' | 'bookmark', lessonId: string, nextBookmark = false) {
    setPending(true);
    setFailed(false);
    try {
      const context = { id: data.id, locale, lessonId };
      await send(operation === 'bookmark' ? { ...context, operation, bookmarked: nextBookmark } : { ...context, operation });
      if (operation !== 'bookmark') setActive(lessonId);
      if (operation !== 'resume') setProgress((entries) => {
        const prior = entries.find((item) => item.lessonId === lessonId);
        return [...entries.filter((item) => item.lessonId !== lessonId), {
          lessonId,
          completed: operation === 'complete' || Boolean(prior?.completed),
          bookmarked: operation === 'bookmark' ? nextBookmark : Boolean(prior?.bookmarked),
        }];
      });
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return <div className="builder-fields course-player">
    {data.content ? <>
      <h1>{data.content.title}</h1>
      <label>{text.progress}<progress max={100} value={progressPercent(completed, lessons.length)} /></label>
      <p>{text.completed} <bdi>{completed}/{lessons.length}</bdi></p>
      <div className="course-lesson-layout">
        <nav className="builder-fields" aria-label={text.outline}>
          {lesson && <a href="#current-lesson">{text.jumpToLesson}</a>}
          {data.content.modules.map((courseModule) => <section key={courseModule.id}>
            <h2>{courseModule.title}</h2>
            <div className="builder-controls">{courseModule.lessons.map((item) => <button type="button" key={item.id}
              className="identity-button" aria-pressed={item.id === active} disabled={pending}
              onClick={() => void update('resume', item.id)}>{item.title}</button>)}</div>
          </section>)}
          {bookmarked.length > 0 && <section>
            <h2>{text.bookmarks}</h2>
            <div className="builder-controls">{bookmarked.map((item) => <button type="button" key={item.id}
              className="identity-button" disabled={pending} onClick={() => void update('resume', item.id)}>{item.title}</button>)}</div>
          </section>}
        </nav>
        {lesson && <article id="current-lesson" tabIndex={-1} className="notice builder-fields">
          <h2>{lesson.title}</h2>
          {lesson.blocks.map((block) => <ContentBlock key={block.id} block={block} locale={locale} codeLabel={text.codeExample} />)}
          <div className="builder-controls">
            <button type="button" className="identity-button" disabled={pending || current?.completed}
              onClick={() => void update('complete', lesson.id)}>{current?.completed ? text.done : text.complete}</button>
            <button type="button" className="identity-button" disabled={pending}
              onClick={() => void update('bookmark', lesson.id, !current?.bookmarked)}>
              {current?.bookmarked ? text.removeBookmark : text.addBookmark}
            </button>
          </div>
        </article>}
      </div>
      {failed && <p role="alert">{text.error}</p>}
      <GuidedLabs labs={data.guidedLabs} locale={locale} enrollmentId={data.id} />
      {data.quizzes.length > 0 && <section className="builder-fields">
        <h2>{text.quizzes}</h2>
        {data.quizzes.map((quiz) => <QuizForm key={quiz.id} quiz={quiz} enrollment={data.id} locale={locale}
          onGrade={(grade) => { setLast(grade); setGrades((history) => [grade, ...history]); }} />)}
        {last && <p role="status">{text.score} <bdi>{last.score}/{last.total}</bdi></p>}
      </section>}
    </> : <><h1>{text.enrollment}</h1><p>{text.unavailable}</p></>}
    <section>
      <h2>{text.grades}</h2>
      {grades.length === 0 ? <p>{text.noGrades}</p> : <ul>
        {grades.map((grade) => <li key={grade.id}>
          {data.quizzes.find((quiz) => quiz.id === grade.quizId)?.title ?? text.score} <bdi>{grade.score}/{grade.total}</bdi>
          {' · '}<time dateTime={grade.gradedAt}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(grade.gradedAt))}</time>
        </li>)}
      </ul>}
    </section>
  </div>;
}
