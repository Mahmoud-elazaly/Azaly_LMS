import { expect, it, vi } from 'vitest';
import { reportAuthFailure } from '../../src/features/identity/diagnostics';
import { signInRateBucket } from '../../src/features/identity/request';
import { readRequestJson } from '../../src/lib/limited-json';

function requestFromChunks(chunks: Uint8Array[]) {
  return new Request('http://localhost', {
    method: 'POST',
    body: new ReadableStream({ start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    } }),
    duplex: 'half',
  } as RequestInit);
}

it('counts UTF-8 bytes across chunks and rejects the first byte beyond the limit', async () => {
  const bytes = new TextEncoder().encode('{"locale":"ع"}');
  const chunks = [bytes.slice(0, 12), bytes.slice(12)];
  expect(await readRequestJson(requestFromChunks(chunks), bytes.length)).toEqual({ locale: 'ع' });
  expect(await readRequestJson(requestFromChunks(chunks), bytes.length - 1)).toBeNull();
  expect(await readRequestJson(requestFromChunks([Uint8Array.of(0xff)]), bytes.length)).toBeNull();
});

it('keys the shared sign-in budget by a canonical identifier and deployment secret', () => {
  const key = signInRateBucket('test-deployment-a', 'Student@example.test');
  expect(key).toMatch(/^[a-f0-9]{64}$/);
  expect(signInRateBucket('test-deployment-a', 'student@example.test')).toBe(key);
  expect(signInRateBucket('test-deployment-a', 'another@example.test')).not.toBe(key);
  expect(signInRateBucket('test-deployment-b', 'student@example.test')).not.toBe(key);
});

it('omits messages and SQL parameters from identity diagnostics', () => {
  const error = Object.assign(new Error('password-canary', { cause: new Error('learner@example.test') }), { code: 'ECONNRESET' });
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    reportAuthFailure('Sign-in rate limit', error);
    expect(log).toHaveBeenCalledWith('[identity] Sign-in rate limit: Error:ECONNRESET -> Error');
  } finally {
    log.mockRestore();
  }
});
