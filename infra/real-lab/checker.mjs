import { checkerVersion } from './protocol.mjs';

export const blueDirective = 'proxy_pass http://127.0.0.1:8081;';
export const greenDirective = 'proxy_pass http://127.0.0.1:8082;';

export async function checkRouting(readConfig, readProxy) {
  const configuration = await readConfig();
  const body = await readProxy();
  return {
    checkerVersion,
    configurationOk: configuration === blueDirective,
    responseOk: body === 'upstream-blue',
  };
}
