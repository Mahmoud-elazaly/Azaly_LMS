import { readRequestJson } from '@/lib/limited-json';
import { z } from 'zod';
import { bankMutation } from '@/features/assessment/policy';
import { changeBankQuestion, listBankQuestions, readBankQuestion } from '@/features/assessment/service';
import { authorRoles } from '@/features/authoring/policy';
import { AuthoringError } from '@/features/authoring/service';
import { contentResponse } from '../content-response';

export function GET(request: Request) {
  return contentResponse(request, authorRoles, async () => {
    const id = new URL(request.url).searchParams.get('id');
    if (id === null) return listBankQuestions(request.headers);
    if (!z.uuid().safeParse(id).success) throw new AuthoringError(400);
    return readBankQuestion(id, request.headers);
  });
}

export function POST(request: Request) {
  return contentResponse(request, authorRoles, async () => {
    const input = bankMutation.safeParse(await readRequestJson(request, 128 * 1024));
    if (!input.success) throw new AuthoringError(400);
    return changeBankQuestion(input.data, request.headers);
  });
}
