import { describe, expect, it } from 'vitest';
import { labRequest, parseProxyDirective } from '../../src/features/real-lab/policy';

describe('NGINX pilot input boundaries', () => {
  it.each([
    ['proxy_pass http://127.0.0.1:8081;', 'blue'],
    ['  proxy_pass\thttp://127.0.0.1:8082 ;\n', 'green'],
    ['proxy_pass http://postgres:5432;', null],
    ['proxy_pass http://127.0.0.1:8081/admin;', null],
    ['proxy_pass http://127.0.0.1:8081;\ninclude /etc/nginx/nginx.conf;', null],
    ['proxy_pass http://127.0.0.1:8081;'.padStart(100), null],
  ])('maps only the approved single directive for %j', (configuration, expected) => {
    expect(parseProxyDirective(configuration)).toBe(expected);
  });

  it('rejects client criteria, verdicts and alternate template properties', () => {
    const id = '8f972555-219d-4b0e-a8c3-137c978a8604';
    expect(labRequest.safeParse({ operation: 'validate', id }).success).toBe(true);
    expect(labRequest.safeParse({ operation: 'validate', id, completionProvenance: 'SYSTEM_VERIFIED' }).success).toBe(false);
    expect(labRequest.safeParse({ operation: 'start', requestId: id, template: 'other' }).success).toBe(false);
    expect(labRequest.safeParse({ operation: 'preview', id, url: 'http://postgres:5432' }).success).toBe(false);
  });
});
