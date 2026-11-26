import { z } from 'zod';
import { readLimitedJson } from '../../lib/limited-json';
import { questionSchema, scorecardSchema } from './model';

const model = 'models/gemini-3.8-flash';
const productionRoot = 'https://generativelanguage.googleapis.com/v1beta';

export class InterviewError extends Error {
  constructor(readonly status: 400 | 404 | 409 | 422 | 429 | 502 | 503) {
    super('Interview request failed');
  }
}

const tokenCount = z.object({ totalTokens: z.number().int().positive() });
const generatedContent = z.object({
  candidates: z.array(z.object({
    finishReason: z.literal('STOP'),
    content: z.object({ parts: z.array(z.object({ text: z.string(), thought: z.literal(false).optional() })).length(1) }),
  })).length(1),
  usageMetadata: z.object({
    totalTokenCount: z.number().int().positive(),
    promptTokenCount: z.number().int().positive(),
  }),
});

export function geminiTransport() {
  const testTransport = process.env.AZALY_INTERVIEW_TEST_TRANSPORT === '1' &&
    process.env.BETTER_AUTH_URL === 'http://127.0.0.1:3100';
  const configuredKey = testTransport ? 'interview-test' : process.env.GEMINI_API_KEY?.trim();
  if (!configuredKey) throw new InterviewError(503);
  const headers = { 'content-type': 'application/json', 'x-goog-api-key': configuredKey };
  const root = testTransport ? 'http://127.0.0.1:3102/v1beta' : productionRoot;

  return async function generate({ instructions, context, evaluation, inputCap, outputCap }: {
    instructions: string; context: object; evaluation: boolean; inputCap: number; outputCap: number;
  }): Promise<unknown> {
    const contract = evaluation ? scorecardSchema : questionSchema;
    const responseJsonSchema = z.toJSONSchema(contract);
    delete responseJsonSchema.$schema;
    const generationRequest = {
      systemInstruction: { parts: [{ text: instructions }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify(context) }] }],
      generationConfig: {
        candidateCount: 1,
        maxOutputTokens: outputCap,
        thinkingConfig: { thinkingLevel: 'LOW' },
        responseMimeType: 'application/json',
        responseJsonSchema,
      },
    };
    const signal = AbortSignal.timeout(25_000);
    async function post(operation: string, body: object) {
      const response = await fetch(`${root}/${model}:${operation}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        cache: 'no-store',
        redirect: 'error',
        signal,
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new InterviewError(502);
      }
      return readLimitedJson(response, 32768);
    }

    try {
      const count = tokenCount.parse(await post('countTokens', { generateContentRequest: { model, ...generationRequest } }));
      if (count.totalTokens > inputCap) throw new InterviewError(422);
      const response = generatedContent.parse(await post('generateContent', generationRequest));
      const usage = response.usageMetadata;
      if (usage.promptTokenCount > inputCap || usage.totalTokenCount < usage.promptTokenCount
          || usage.totalTokenCount > usage.promptTokenCount + outputCap) {
        throw new InterviewError(502);
      }
      return JSON.parse(response.candidates[0].content.parts[0].text);
    } catch (error) {
      if (error instanceof InterviewError) throw error;
      throw new InterviewError(502);
    }
  };
}
