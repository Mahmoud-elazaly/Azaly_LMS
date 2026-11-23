import { describe, expect, it } from 'vitest';
import { prepareAuthRequest } from '../../src/features/identity/request';

const origin = 'http://127.0.0.1:3000';
const path = '/api/auth/sign-in/email';

function proxiedSignIn(payload: string) {
  const init: RequestInit & { duplex: 'half' } = {
    method: 'POST',
    headers: { Origin: origin, 'Content-Length': String(payload.length) },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(payload));
        controller.close();
      },
    }),
    duplex: 'half',
  };
  return new Proxy(new Request(origin + path, init), {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

describe('authentication request preparation', () => {
  it('preserves the sign-in Proxy regression while stripping untrusted fields', async () => {
    const fields = { email: 'learner@example.test', password: 'example-passphrase', rememberMe: false };
    const incoming = proxiedSignIn(JSON.stringify({
      ...fields, role: 'OWNER', callbackURL: 'https://untrusted.example.test',
    }));

    const upstream = await prepareAuthRequest(incoming, path);
    expect(upstream?.url).toBe(origin + path);
    expect(upstream?.method).toBe('POST');
    expect(upstream?.headers.get('origin')).toBe(origin);
    expect(upstream?.headers.get('content-type')).toBe('application/json');
    expect(upstream?.headers.has('content-length')).toBe(false);
    expect(upstream?.headers.get('x-academy-client-ip')).toBe('127.0.0.1');
    expect(await upstream?.json()).toEqual(fields);
  });

  it('forwards the session cookie for sign-out without forwarding a body', async () => {
    const signOut = '/api/auth/sign-out';
    const request = new Request(origin + signOut, {
      method: 'POST',
      headers: { Origin: origin, Cookie: 'session_token=test-cookie' },
      body: '{}',
    });
    const upstream = await prepareAuthRequest(request, signOut);
    expect(upstream?.headers.get('cookie')).toBe('session_token=test-cookie');
    expect(upstream?.headers.get('origin')).toBe(origin);
    expect(upstream?.body).toBeNull();
  });

  it('rejects malformed JSON and invalid credentials', async () => {
    for (const payload of ['{', '{"email":"invalid","password":"short"}']) {
      expect(await prepareAuthRequest(proxiedSignIn(payload), path)).toBeNull();
    }
  });
});
