'use client';

import { useRouter } from 'next/navigation';
import { useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { assessmentCopy } from '@/features/assessment/copy';
import { importBankQuestion, type BankQuestion } from '@/features/assessment/policy';
import { GuidedLabFields } from './guided-lab-authoring';
import { OrderedControls, replace } from './ordered-fields';
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

function ModuleEditor({ courseModule, language, text, onChange }: {
  courseModule: Module; language: Locale; text: Labels; onChange: (value: Module) => void;
}) {
  function setLessons(lessons: Lesson[]) { onChange({ ...courseModule, lessons }); }
  return <div className="builder-fields">
    <label>{text.moduleTitle}<input dir={direction(language)} value={courseModule.titles[language] ?? ''}
      onChange={(event) => onChange({ ...courseModule, titles: { ...courseModule.titles, [language]: event.target.value } })} /></label>
    {courseModule.lessons.map((lesson, index) => <div key={lesson.id} className="builder-fields">
      <LessonEditor lesson={lesson} language={language} text={text}
        onChange={(value) => setLessons(replace(courseModule.lessons, index, value))} />
      <OrderedControls items={courseModule.lessons} index={index} onChange={setLessons} text={text} />
    </div>)}
    <button type="button" className="identity-button" onClick={() => setLessons([
      ...courseModule.lessons, { id: crypto.randomUUID(), titles: {}, blocks: [] },
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
    {document.modules.map((courseModule, index) => <div key={courseModule.id} className="notice builder-fields">
      <ModuleEditor courseModule={courseModule} language={language} text={text}
        onChange={(value) => setModules(replace(document.modules, index, value))} />
      <OrderedControls items={document.modules} index={index} onChange={setModules} text={text} />
    </div>)}
    <button type="button" className="identity-button" onClick={() => setModules([
      ...document.modules, { id: crypto.randomUUID(), titles: {}, lessons: [] },
    ])}>{text.addModule}</button>
  </>;
}

type Quiz = NonNullable<CourseDocument['quizzes']>[number];

function QuizEditor({ quiz, language, text, locale, bank, onChange }: {
  quiz: Quiz; language: Locale; text: Labels; locale: Locale; bank: BankQuestion[]; onChange: (quiz: Quiz) => void;
}) {
  const bankText = assessmentCopy(locale);
  const [selectedBankId, setSelectedBankId] = useState('');
  const selectedBankQuestion = bank.find(({ id }) => id === selectedBankId);
  function setQuestions(questions: Quiz['questions']) { onChange({ ...quiz, questions }); }

  return <div className="notice builder-fields">
    <label>{text.quizTitle}<input dir={direction(language)} value={quiz.titles[language] ?? ''}
      onChange={(event) => onChange({ ...quiz, titles: { ...quiz.titles, [language]: event.target.value } })} /></label>
    {quiz.questions.map((question, index) => {
      const current = question.translations[language] ?? { prompt: '', choices: ['', ''], explanation: '' };
      function setTranslation(translation: typeof current) {
        setQuestions(replace(quiz.questions, index, { ...question, translations: { ...question.translations, [language]: translation } }));
      }
      return <div key={question.id} className="builder-fields">
        <label>{text.questionPrompt}<input dir={direction(language)} value={current.prompt} readOnly={Boolean(question.bankSource)}
          onChange={(event) => setTranslation({ ...current, prompt: event.target.value })} /></label>
        {current.choices.map((choice, at) => <label key={at}>{text.choice} {at + 1}
          <input dir={direction(language)} value={choice} readOnly={Boolean(question.bankSource)}
            onChange={(event) => setTranslation({ ...current, choices: replace(current.choices, at, event.target.value) })} />
        </label>)}
        <label>{text.correctChoice}<select value={question.correct} disabled={Boolean(question.bankSource)} onChange={(event) => setQuestions(
          replace(quiz.questions, index, { ...question, correct: Number(event.target.value) }),
        )}>
          {current.choices.map((_, at) => <option key={at} value={at}>{at + 1}</option>)}
        </select></label>
        {question.bankSource && <p>{bankText.imported}</p>}
        {current.explanation && <p dir={direction(language)}>{current.explanation}</p>}
        <OrderedControls items={quiz.questions} index={index} onChange={setQuestions} text={text} />
      </div>;
    })}
    {bank.length === 0 ? <p>{bankText.noImport}</p> : <div className="builder-fields">
      <label>{bankText.choose}<select value={selectedBankId} onChange={(event) => setSelectedBankId(event.target.value)}>
        <option value="">—</option>
        {bank.map((item) => <option value={item.id} key={item.id}>{item.translations[language].prompt}</option>)}
      </select></label>
      <button className="identity-button" type="button" disabled={!selectedBankQuestion || quiz.questions.length >= 20}
        onClick={() => {
          if (selectedBankQuestion) {
            setQuestions([...quiz.questions, importBankQuestion(selectedBankQuestion, crypto.randomUUID())]);
            setSelectedBankId('');
          }
        }}>{bankText.import}</button>
    </div>}
    <button type="button" className="identity-button" disabled={quiz.questions.length >= 20} onClick={() => setQuestions([
      ...quiz.questions, { id: crypto.randomUUID(), correct: 0, translations: {} },
    ])}>{text.addQuestion}</button>
  </div>;
}

function QuizFields({ document, setDocument, language, text, locale, bank }: {
  document: CourseDocument; setDocument: Dispatch<SetStateAction<CourseDocument>>; language: Locale; text: Labels;
  locale: Locale; bank: BankQuestion[];
}) {
  const quizzes = document.quizzes ?? [];
  function setQuizzes(next: Quiz[]) { setDocument({ ...document, quizzes: next }); }
  return <>
    {quizzes.map((quiz, index) => <div className="builder-fields" key={quiz.id}>
      <QuizEditor quiz={quiz} language={language} text={text} locale={locale} bank={bank}
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
      {document.modules.map((courseModule) => <section key={courseModule.id}>
        <h3>{courseModule.titles[locale]}</h3>
        {courseModule.lessons.map((lesson) => <section key={lesson.id}>
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

export function CourseEditor({ locale, draft, bank }: { locale: Locale; draft: CourseDraft; bank: BankQuestion[] }) {
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
      <QuizFields document={document} setDocument={setDocument} language={language} text={text} locale={locale} bank={bank} />
      <GuidedLabFields labs={document.guidedLabs ?? []} locale={locale} language={language}
        onChange={(guidedLabs) => setDocument({ ...document, guidedLabs })} />
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
