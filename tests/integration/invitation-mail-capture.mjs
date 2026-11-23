import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const messages = new Map();
const key = 'isolated-playwright-mail';
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (request.method === 'GET' && url.pathname === '/health') return response.writeHead(204).end();
  if (request.headers.authorization !== `Bearer ${key}`) return response.writeHead(401).end();
  if (request.method === 'GET' && url.pathname === '/messages') {
    const message = messages.get(url.searchParams.get('recipient'));
    return response.writeHead(message ? 200 : 404, { 'Content-Type': 'application/json' }).end(JSON.stringify(message));
  }
  if (request.method !== 'POST' || url.pathname !== '/emails') return response.writeHead(404).end();
  try {
    const parts = [];
    for await (const part of request) parts.push(part);
    const packet = JSON.parse(Buffer.concat(parts));
    const recipient = packet.to?.[0];
    if (typeof recipient !== 'string' || !recipient.endsWith('@example.test')) return response.writeHead(400).end();
    if (recipient.startsWith('undeliverable-')) return response.writeHead(503).end();
    messages.set(recipient, packet);
    return response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ id: randomUUID() }));
  } catch {
    return response.writeHead(400).end();
  }
});
server.listen(3101, '127.0.0.1');
