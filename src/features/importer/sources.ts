import { createReadStream } from 'node:fs';
import { extname } from 'node:path';
import { fromBufferPromise } from 'yauzl';

const ignoredNames = new Set(['.git', 'node_modules', '__MACOSX', '.DS_Store']);
const binaryExtension = /\.(?:7z|bin|class|dll|exe|gif|gz|ico|jar|jpeg|jpg|mp[34]|pdf|png|so|tar|wasm|webp|woff2?|zip)$/i;
const maxInputBytes = 2 * 1024 * 1024;
const maxEntryBytes = 120_000;
const maxEntries = 300;

export type ImportWarning = { code: 'ignored_path' | 'ignored_binary' | 'unmapped_file' | 'unmatched_quiz_pair'; path: string };
export class ImportError extends Error {
  readonly code: string;
  readonly path?: string;

  constructor(code: string, path?: string) {
    super(code);
    this.code = code;
    this.path = path;
  }
}

export function safePath(path: string) {
  return path.length <= 240 && !/[\\:\p{Cc}]/u.test(path) &&
    path.split('/').every((part) => part !== '' && part !== '..' && part !== '.');
}

async function readBytes(source: AsyncIterable<Buffer | Uint8Array | string>, limit: number, path: string) {
  const parts: Buffer[] = [];
  let total = 0;
  for await (const chunk of source) {
    const bytes = Buffer.from(chunk);
    total += bytes.length;
    if (total > limit) throw new ImportError('size_limit', path);
    parts.push(bytes);
  }
  return Buffer.concat(parts, total);
}

function textFile(bytes: Uint8Array) {
  if (bytes.includes(0)) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/\r\n?/g, '\n');
  } catch {
    return null;
  }
}

export async function readImportSources(path: string) {
  const extension = extname(path).toLowerCase();
  if (extension !== '.md' && extension !== '.zip') throw new ImportError('unsupported_input');
  const bytes = await readBytes(createReadStream(path, { end: maxInputBytes }), maxInputBytes, path);
  if (extension === '.md') {
    const markdown = textFile(bytes);
    if (markdown === null) throw new ImportError('invalid_markdown');
    return { markdown, files: new Map<string, string>(), warnings: [] as ImportWarning[] };
  }

  const files = new Map<string, string>();
  const warnings: ImportWarning[] = [];
  const names = new Set<string>();
  const archive = await fromBufferPromise(bytes, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true })
    .catch(() => { throw new ImportError('invalid_zip'); });
  let expanded = 0;
  try {
    if (archive.entryCount > maxEntries) throw new ImportError('entry_limit');
    for await (const entry of archive.eachEntry()) {
      const path = entry.fileName.replace(/\/$/, '');
      if (!safePath(path)) throw new ImportError('unsafe_archive_path');
      if (names.has(path)) throw new ImportError('duplicate_archive_path', path);
      names.add(path);
      if (path.split('/').some((part) => ignoredNames.has(part))) {
        if (!entry.fileName.endsWith('/')) warnings.push({ code: 'ignored_path', path });
        continue;
      }
      if (entry.fileName.endsWith('/')) continue;
      const fileType = (entry.externalFileAttributes >>> 16) & 0o170000;
      if ((fileType && fileType !== 0o100000) || binaryExtension.test(path)) {
        warnings.push({ code: 'ignored_binary', path });
      } else if (!/\.(md|json)$/.test(path)) {
        warnings.push({ code: 'unmapped_file', path });
      } else {
        expanded += entry.uncompressedSize;
        if (entry.uncompressedSize > maxEntryBytes || expanded > maxInputBytes) throw new ImportError('size_limit', path);
        const stream = await archive.openReadStreamPromise(entry);
        const text = textFile(await readBytes(stream, maxEntryBytes, path));
        if (text === null) warnings.push({ code: 'ignored_binary', path });
        else files.set(path, text);
      }
    }
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError('invalid_zip');
  } finally {
    archive.close();
  }
  return { markdown: undefined, files, warnings };
}
