import { isIP } from 'node:net';
import { z } from 'zod';

const credentials = z.object({ email: z.email().max(254), password: z.string().min(1).max(128) });
const registration = credentials.extend({ name: z.string().trim().min(1).max(120), password: z.string().min(12).max(128) });

export async function prepareAuthRequest(request: Request, path: string): Promise<Request | null> {
  const headers = new Headers(request.headers);
  const ip = headers.get('x-academy-client-ip');
  // Direct loopback traffic shares a bucket. The HTTPS proxy overwrites this header.
  headers.set('x-academy-client-ip', ip && isIP(ip) ? ip : '127.0.0.1');
  headers.delete('Content-Length');

  let body: string | undefined;
  if (path === '/api/auth/sign-in/email' || path === '/api/auth/sign-up/email') {
    const schema = path === '/api/auth/sign-up/email' ? registration : credentials;
    const input = schema.safeParse(await request.json().catch(() => null));
    if (!input.success) return null;
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(input.data);
  }

  // Next.js can proxy the incoming request. Node 24's Request constructor
  // accesses private slots when given a Request object, which a Proxy lacks.
  return new Request(request.url, { method: request.method, headers, body, signal: request.signal });
}
