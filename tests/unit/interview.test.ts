import { afterEach, describe, expect, it, vi } from 'vitest';
import { geminiTransport } from '../../src/features/interview/gemini';
import { buildGrounding, type CurriculumSource } from '../../src/features/interview/grounding';
import { messageSchema, parseScorecard, scorecardSchema, sessionVersion, type InterviewSetup } from '../../src/features/interview/model';
import { calculateMastery } from '../../src/features/mastery/calculate';
import type { ConceptEvidence } from '../../src/features/mastery/model';

const scope: InterviewSetup = { role: 'devops', seniority: 'mid', tracks: ['observability', 'iac'], locale: 'en' };
const scorecard = {
  overall_score: 42, technical_accuracy: 58, production_and_security_awareness: 31,
  missing_edge_cases: ['Confirm recovery'], model_answer: 'Check the scrape target.', weak_concept_slugs: ['prometheus'],
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('interview scorecards', () => {
  it('requires exactly the supported fields, numeric integer scores and named concepts in scope', () => {
    const eligible = new Set(['prometheus']);
    expect(parseScorecard(scorecard, eligible)).toEqual(scorecard);
    for (const invalid of [
      { ...scorecard, overall_score: '42' }, { ...scorecard, technical_accuracy: 105 },
      { ...scorecard, production_and_security_awareness: 0.5 }, { ...scorecard, missing_edge_cases: undefined },
      { ...scorecard, extra: 'ignored?' }, { ...scorecard, model_answer: ' ' },
      { ...scorecard, weak_concept_slugs: ['git'] }, { ...scorecard, weak_concept_slugs: ['prometheus', 'prometheus'] },
    ]) expect(() => parseScorecard(invalid, eligible)).toThrow();
  });

  it('uses the overall interview score for weak concepts and keeps unflagged mastery intact', () => {
    const concepts: ConceptEvidence[] = ['prometheus', 'promql'].map((slug) => ({
      slug, track: 'observability', titles: { en: slug, ar: slug }, summaries: { en: slug, ar: slug }, items: [],
    }));
    const graded = parseScorecard(scorecard, new Set(concepts.map(({ slug }) => slug)));
    const interviews = Object.fromEntries(graded.weak_concept_slugs.map((slug) => [slug, graded.overall_score]));
    const mastery = calculateMastery({ edges: [], concepts, interviews }, false);
    expect(mastery.concepts.map(({ score, status }) => [score, status])).toEqual([[42, 'needsRemediation'], [null, 'notStarted']]);
    expect(mastery.weakest).toMatchObject([{ slug: 'prometheus', score: 42, action: { kind: 'concept' } }]);
  });
});

it('limits grounding to selected concepts, reduces large extracts, and labels supplemental material', () => {
  const sources: CurriculumSource[] = [
    { track: 'observability', slug: 'prometheus', title: 'Prometheus', summary: 'Collect metrics', extract: 'A'.repeat(900) },
    { track: 'linux', slug: 'linux-networking', title: 'Linux', summary: 'Trace DNS', extract: 'Excluded text' },
  ];
  const context = buildGrounding(scope, sources);
  expect(context.curriculum).toMatchObject([{ slug: 'prometheus', publishedLesson: 'A'.repeat(520) }]);
  expect(context.rubric).toContain('independently');
  expect(context.supplemental).toEqual([expect.stringMatching(/^\[Supplemental\].+Terraform/)]);
  expect(buildGrounding({ ...scope, tracks: ['linux'], locale: 'ar' }, sources).supplemental).toEqual([]);
});

it('bounds the expected turn and applies an answer limit in UTF-8 bytes', () => {
  const id = 'aaa10000-0000-4000-8000-000000000001';
  expect(sessionVersion.safeParse({ id, turn: 5 }).success).toBe(false);
  expect(messageSchema.safeParse({ id, turn: 3, answer: 'س'.repeat(1200) }).success).toBe(true);
  expect(messageSchema.safeParse({ id, turn: 3, answer: 'س'.repeat(1201) }).success).toBe(false);
});

describe('Gemini budget and failure handling', () => {
  const generation = { instructions: 'Ask a question', context: {}, evaluation: false, inputCap: 8192, outputCap: 768 };

  it('rejects a missing server key without dispatching a request', () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(() => geminiTransport()).toThrow(expect.objectContaining({ status: 503 }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('counts the full request and refuses generation when it exceeds the prompt reservation', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'unit-only');
    const fetch = vi.fn().mockResolvedValue(Response.json({ totalTokens: generation.inputCap + 1 }));
    vi.stubGlobal('fetch', fetch);
    await expect(geminiTransport()(generation)).rejects.toMatchObject({ status: 422 });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, request] = fetch.mock.calls[0];
    expect(url).toMatch(/:countTokens$/);
    expect(JSON.parse(request.body).generateContentRequest.generationConfig.maxOutputTokens).toBe(generation.outputCap);
  });

  it('rejects over-budget or incomplete output instead of exposing provider content', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'unit-only');
    const candidate = { finishReason: 'STOP', content: { parts: [{ text: '{"question":"What would you check?"}' }] } };
    for (const [finishReason, totalTokenCount] of [['STOP', 900], ['MAX_TOKENS', 200]] as const) {
      const fetch = vi.fn().mockResolvedValueOnce(Response.json({ totalTokens: 100 })).mockResolvedValueOnce(Response.json({
        candidates: [{ ...candidate, finishReason }], usageMetadata: { totalTokenCount, promptTokenCount: 100 },
      }));
      vi.stubGlobal('fetch', fetch);
      await expect(geminiTransport()(generation)).rejects.toMatchObject({ status: 502, message: 'Interview request failed' });
    }
    expect(scorecardSchema.safeParse({ question: 'Unrelated shape' }).success).toBe(false);
  });
});
