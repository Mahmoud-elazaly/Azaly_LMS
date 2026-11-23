'use client';

import { useRouter } from 'next/navigation';
import { useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { builderCopy } from '@/features/authoring/copy';
import type { CourseDocument, CourseDraft, Mutation } from '@/features/authoring/policy';
import { direction, type Locale } from '@/i18n/locales';

type Labels = ReturnType<typeof builderCopy>;
type Module = CourseDocument['modules'][number];
type Lesson = Module['lessons'][number];
type Block = Lesson['blocks'][number];

async function send(input: Mutation) {
  const response = await fetch('/api/authoring', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(String(response.status));
  return response.json() as Promise<{ id: string; version: number }>;
}

function failure(error: unknown, text: Labels) {
  return error instanceof Error && error.message === '400' ? text.validation
    : error instanceof Error && error.message === '409' ? text.conflict
    : error instanceof Error && error.message === '403' ? text.denied : text.unavailable;
}

export function CourseCreator({ locale }: { locale: Locale }) {
  const router = useRouter();
  const text = builderCopy(locale);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const value = String(new FormData(form).get('slug') ?? '');
    setPending(true);
    setError('');
    try {
      const result = await send({ operation: 'create', slug: value });
      form.reset();
      router.push(`/${locale}/builder?id=${result.id}`);
      router.refresh();
    } catch (error) {
      setError(failure(error, text));
    } finally {
      setPending(false);
    }
  }

  return <form className="identity-form" onSubmit={create}>
    <label>{text.slug}<input name="slug" dir="ltr" required maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" /></label>
    <button className="identity-button" disabled={pending}>{pending ? text.pending : text.create}</button>
    {error && <p role="alert">{error}</p>}
  </form>;
}

function replace<T>(items: T[], index: number, value: T) {
  return items.map((item, at) => at === index ? value : item);
}

function OrderedControls<T>({ items, index, onChange, text }: {
  items: T[]; index: number; onChange: (value: T[]) => void; text: Labels;
}) {
  function move(offset: number) {
    const next = [...items];
    const destination = index + offset;
    if (destination < 0 || destination >= next.length) return;
    [next[index], next[destination]] = [next[destination], next[index]];
    onChange(next);
  }

  return <div className="builder-controls">
    <button type="button" className="identity-button" disabled={index === 0} onClick={() => move(-1)}>{text.moveUp}</button>
    <button type="button" className="identity-button" disabled={index === items.length - 1} onClick={() => move(1)}>{text.moveDown}</button>
    <button type="button" className="identity-button" onClick={() => onChange(items.filter((_, at) => at !== index))}>{text.remove}</button>
  </div>;
}

function LessonEditor({ lesson, language, text, onChange }: {
  lesson: Lesson; language: Locale; text: Labels; onChange: (value: Lesson) => void;
}) {
  function setBlocks(blocks: Block[]) { onChange({ ...lesson, blocks }); }
  return <div className="notice builder-fields">
    <label>{text.lessonTitle}<input dir={direction(language)} value={lesson.titles[language] ?? ''}
      onChange={(event) => onChange({ ...lesson, titles: { ...lesson.titles, [language]: event.target.value } })} /></label>
    {lesson.blocks.map((block, index) => <div key={block.id} className="builder-fields">
      <label>{text.blockType}<select value={block.type} onChange={(event) => {
        const type = event.target.value;
        if (type === 'paragraph' || type === 'heading' || type === 'code' || type === 'callout') {
          setBlocks(replace(lesson.blocks, index, { ...block, type }));
        }
      }}>
        {(['paragraph', 'heading', 'code', 'callout'] as const).map((type) => <option key={type} value={type}>{text[type]}</option>)}
      </select></label>
      <label>{text.blockText}<textarea rows={3} dir={block.type === 'code' ? 'ltr' : direction(language)}
        value={block.translations[language] ?? ''} onChange={(event) => setBlocks(replace(lesson.blocks, index, {
          ...block, translations: { ...block.translations, [language]: event.target.value },
        }))} /></label>
      <OrderedControls items={lesson.blocks} index={index} onChange={setBlocks} text={text} />
    </div>)}
    <button type="button" className="identity-button" onClick={() => setBlocks([
      ...lesson.blocks, { id: crypto.randomUUID(), type: 'paragraph', translations: {} },
    ])}>{text.addBlock}</button>
  </div>;
}

function ModuleEditor({ module, language, text, onChange }: {
  module: Module; language: Locale; text: Labels; onChange: (value: Module) => void;
}) {
  function setLessons(lessons: Lesson[]) { onChange({ ...module, lessons }); }
  return <div className="builder-fields">
    <label>{text.moduleTitle}<input dir={direction(language)} value={module.titles[language] ?? ''}
      onChange={(event) => onChange({ ...module, titles: { ...module.titles, [language]: event.target.value } })} /></label>
    {module.lessons.map((lesson, index) => <div key={lesson.id} className="builder-fields">
      <LessonEditor lesson={lesson} language={language} text={text}
        onChange={(value) => setLessons(replace(module.lessons, index, value))} />
      <OrderedControls items={module.lessons} index={index} onChange={setLessons} text={text} />
    </div>)}
    <button type="button" className="identity-button" onClick={() => setLessons([
      ...module.lessons, { id: crypto.randomUUID(), titles: {}, blocks: [] },
    ])}>{text.addLesson}</button>
  </div>;
}

function DocumentFields({ document, setDocument, language, text }: {
  document: CourseDocument; setDocument: Dispatch<SetStateAction<CourseDocument>>; language: Locale; text: Labels;
}) {
  const translation = document.translations[language] ?? { title: '', summary: '' };
  function setTranslation(key: keyof typeof translation, value: string) {
    setDocument({ ...document, translations: { ...document.translations, [language]: { ...translation, [key]: value } } });
  }
  function setModules(modules: Module[]) { setDocument({ ...document, modules }); }

  return <>
    <label>{text.courseTitle}<input dir={direction(language)} value={translation.title}
      onChange={(event) => setTranslation('title', event.target.value)} /></label>
    <label>{text.summary}<textarea rows={3} dir={direction(language)} value={translation.summary}
      onChange={(event) => setTranslation('summary', event.target.value)} /></label>
    {document.modules.map((module, index) => <div key={module.id} className="notice builder-fields">
      <ModuleEditor module={module} language={language} text={text}
        onChange={(value) => setModules(replace(document.modules, index, value))} />
      <OrderedControls items={document.modules} index={index} onChange={setModules} text={text} />
    </div>)}
    <button type="button" className="identity-button" onClick={() => setModules([
      ...document.modules, { id: crypto.randomUUID(), titles: {}, lessons: [] },
    ])}>{text.addModule}</button>
  </>;
}

type Quiz = NonNullable<CourseDocument['quizzes']>[number];

function QuizEditor({ quiz, language, text, onChange }: {
  quiz: Quiz; language: Locale; text: Labels; onChange: (quiz: Quiz) => void;
}) {
  function setQuestions(questions: Quiz['questions']) { onChange({ ...quiz, questions }); }

  return <div className="notice builder-fields">
    <label>{text.quizTitle}<input dir={direction(language)} value={quiz.titles[language] ?? ''}
      onChange={(event) => onChange({ ...quiz, titles: { ...quiz.titles, [language]: event.target.value } })} /></label>
    {quiz.questions.map((question, index) => {
      const current = question.translations[language] ?? { prompt: '', choices: ['', ''] };
      function setTranslation(translation: typeof current) {
        setQuestions(replace(quiz.questions, index, { ...question, translations: { ...question.translations, [language]: translation } }));
      }
      return <div key={question.id} className="builder-fields">
        <label>{text.questionPrompt}<input dir={direction(language)} value={current.prompt}
          onChange={(event) => setTranslation({ ...current, prompt: event.target.value })} /></label>
        {current.choices.map((choice, at) => <label key={at}>{text.choice} {at + 1}
          <input dir={direction(language)} value={choice}
            onChange={(event) => setTranslation({ ...current, choices: replace(current.choices, at, event.target.value) })} />
        </label>)}
        <label>{text.correctChoice}<select value={question.correct} onChange={(event) => setQuestions(
          replace(quiz.questions, index, { ...question, correct: Number(event.target.value) }),
        )}>
          {current.choices.map((_, at) => <option key={at} value={at}>{at + 1}</option>)}
        </select></label>
        <OrderedControls items={quiz.questions} index={index} onChange={setQuestions} text={text} />
      </div>;
    })}
    <button type="button" className="identity-button" onClick={() => setQuestions([
      ...quiz.questions, { id: crypto.randomUUID(), correct: 0, translations: {} },
    ])}>{text.addQuestion}</button>
  </div>;
}

function QuizFields({ document, setDocument, language, text }: {
  document: CourseDocument; setDocument: Dispatch<SetStateAction<CourseDocument>>; language: Locale; text: Labels;
}) {
  const quizzes = document.quizzes ?? [];
  function setQuizzes(next: Quiz[]) { setDocument({ ...document, quizzes: next }); }
  return <>
    {quizzes.map((quiz, index) => <div className="builder-fields" key={quiz.id}>
      <QuizEditor quiz={quiz} language={language} text={text}
        onChange={(value) => setQuizzes(replace(quizzes, index, value))} />
      <OrderedControls items={quizzes} index={index} onChange={setQuizzes} text={text} />
    </div>)}
    <button type="button" className="identity-button" onClick={() => setQuizzes([
      ...quizzes, { id: crypto.randomUUID(), titles: {}, questions: [] },
    ])}>{text.addQuiz}</button>
  </>;
}

function DraftPreview({ document, locale, heading }: { document: CourseDocument; locale: Locale; heading: string }) {
  const translation = document.translations[locale];
  return <details className="notice">
    <summary>{heading}</summary>
    <article lang={locale} dir={direction(locale)}>
      <h2>{translation?.title}</h2>
      <p>{translation?.summary}</p>
      {document.modules.map((module) => <section key={module.id}>
        <h3>{module.titles[locale]}</h3>
        {module.lessons.map((lesson) => <section key={lesson.id}>
          <h4>{lesson.titles[locale]}</h4>
          {lesson.blocks.map((block) => {
            const value = block.translations[locale];
            if (block.type === 'code') return <pre key={block.id} dir="ltr"><code>{value}</code></pre>;
            if (block.type === 'heading') return <h5 key={block.id}>{value}</h5>;
            if (block.type === 'callout') return <aside className="notice" key={block.id}>{value}</aside>;
            return <p key={block.id}>{value}</p>;
          })}
        </section>)}
      </section>)}
    </article>
  </details>;
}

export function CourseEditor({ locale, draft }: { locale: Locale; draft: CourseDraft }) {
  const router = useRouter();
  const text = builderCopy(locale);
  const [language, setLanguage] = useState(locale);
  const [document, setDocument] = useState(draft.document);
  const [saved, setSaved] = useState(draft.document);
  const [version, setVersion] = useState(draft.version);
  const [visibility, setVisibility] = useState(draft.visibility);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; message: string }>();
  const dirty = saved !== document;

  async function submit(operation: Exclude<Mutation['operation'], 'create'>) {
    if (operation === 'archive' && !window.confirm(text.confirmArchive)) return;
    setPending(true);
    setFeedback(undefined);
    const base = { id: draft.id, version };
    try {
      const result = await send(operation === 'save' ? { ...base, operation, document } : { ...base, operation });
      setVersion(result.version);
      if (operation === 'archive') {
        router.push(`/${locale}/builder`);
        router.refresh();
      }
      if (operation === 'save') setSaved(document);
      if (operation === 'publish') setVisibility('published');
      if (operation === 'unpublish') setVisibility('withdrawn');
      if (operation !== 'archive') setFeedback({ error: false, message:
        operation === 'save' ? text.saved : operation === 'publish' ? text.coursePublished : text.unpublished });
    } catch (error) {
      setFeedback({ error: true, message: failure(error, text) });
    } finally {
      setPending(false);
    }
  }

  return <form className="builder-fields" onSubmit={(event) => { event.preventDefault(); void submit('save'); }}>
    <p>{text[visibility]}</p>
    <fieldset className="builder-fields" disabled={pending}>
      <label>{text.slug}<input dir="ltr" required maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={document.slug}
        readOnly={visibility !== 'draft'} onChange={(event) => setDocument({ ...document, slug: event.target.value })} /></label>
      <label>{text.position}<input type="number" min="0" max="100000" value={document.position}
        onChange={(event) => setDocument({ ...document, position: Number(event.target.value) })} /></label>
      <label>{text.language}<select value={language} onChange={(event) => setLanguage(event.target.value === 'ar' ? 'ar' : 'en')}>
        <option value="ar" lang="ar">العربية</option><option value="en" lang="en">English</option>
      </select></label>
      <DocumentFields document={document} setDocument={setDocument} language={language} text={text} />
      <QuizFields document={document} setDocument={setDocument} language={language} text={text} />
      <DraftPreview document={document} locale={language} heading={text.preview} />
      <div className="builder-controls">
        <button className="identity-button">{text.save}</button>
        <button type="button" className="identity-button" disabled={dirty} onClick={() => void submit('publish')}>
          {visibility === 'published' ? text.republish : text.publish}
        </button>
        {visibility === 'published' && <button type="button" className="identity-button" onClick={() => void submit('unpublish')}>{text.unpublish}</button>}
        <button type="button" className="identity-button" onClick={() => void submit('archive')}>{text.archive}</button>
      </div>
    </fieldset>
    {feedback && <p role={feedback.error ? 'alert' : 'status'}>{feedback.message}</p>}
  </form>;
}
