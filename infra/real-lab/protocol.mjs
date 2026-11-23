import { createHash, timingSafeEqual } from 'node:crypto';

export const templateVersion = 'nginx-reverse-proxy@1';
export const checkerVersion = 'nginx-route@1';
export const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export const tokenPattern = /^[a-f0-9]{64}$/;

export class HttpError extends Error {
  constructor(status) {
    super('Lab request rejected');
    this.status = status;
  }
}

export function sameSecret(actual, expected) {
  const digest = (value) => createHash('sha256').update(value ?? '').digest();
  return timingSafeEqual(digest(actual), digest(expected));
}

export async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > 2048) {
      request.resume();
      throw new HttpError(413);
    }
    chunks.push(chunk);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  throw new HttpError(400);
}

export function respond(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(payload));
}

export function serve(handler) {
  return (request, response) => {
    void handler(request, response).catch((error) => {
      if (!(error instanceof HttpError)) console.error('Lab service request failed.');
      respond(response, error instanceof HttpError ? error.status : 503, { error: 'unavailable' });
    });
  };
}

export const isUpstream = (name) => name === 'blue' || name === 'green';
