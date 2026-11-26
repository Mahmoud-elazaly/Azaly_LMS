export async function readLimitedJson(message: Request | Response, maxBytes: number): Promise<unknown> {
  const reader = message.body?.getReader();
  if (!reader) throw new SyntaxError('Missing JSON body');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let body = '';
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new RangeError('JSON body exceeds byte limit');
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(body + decoder.decode());
  } finally {
    reader.releaseLock();
  }
}

export function readRequestJson(request: Request, maxBytes: number): Promise<unknown> {
  return readLimitedJson(request, maxBytes).catch(() => null);
}
