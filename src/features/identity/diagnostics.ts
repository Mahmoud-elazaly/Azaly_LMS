const knownCodes = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT',
  'ERR_INVALID_URL', 'ERR_MODULE_NOT_FOUND', 'ERR_CRYPTO_INVALID_SCRYPT_PARAMS',
]);

export function reportAuthFailure(stage: string, error: unknown) {
  const causes: string[] = [];
  let current = error;

  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    const code = 'code' in current ? current.code : undefined;
    const { name, constructor } = current;
    const type = ['BetterAuthError', 'DrizzleQueryError', 'DatabaseError', 'TypeError', 'APIError']
      .find((kind) => kind === name || kind === constructor.name) ?? 'Error';
    if (typeof code === 'string' && (knownCodes.has(code) || /^(?:[0-9][0-9A-Z]{4}|XX[0-9A-Z]{3})$/.test(code))) {
      causes.push(`${type}:${code}`);
    } else {
      causes.push(type);
    }
    // Drizzle error messages include SQL parameters. Never log messages, stack or query data.
    current = current.cause;
  }

  console.error(`[identity] ${stage}: ${causes.join(' -> ') || 'unknown error'}`);
}
