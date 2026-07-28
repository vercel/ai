import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { CodeModeSourceTooLargeError } from './errors.js';

const MAX_CACHE_ENTRIES = 256;
const MAX_CACHE_BYTES = 4 * 1024 * 1024;
const MAX_CACHE_ENTRY_BYTES = 64 * 1024;
const transformedSourceCache = new Map<
  string,
  {
    source: string;
    bytes: number;
  }
>();
let transformedSourceCacheBytes = 0;

export function assertSourceSize(source: string, maxSourceBytes: number): void {
  const bytes = byteLength(source);
  if (bytes > maxSourceBytes) {
    throw new CodeModeSourceTooLargeError(bytes, maxSourceBytes);
  }
}

export function transformSource(source: string): string {
  const hash = createHash('sha256')
    .update('strip:')
    .update(source)
    .digest('hex');
  const cached = transformedSourceCache.get(hash);
  if (cached !== undefined) {
    transformedSourceCache.delete(hash);
    transformedSourceCache.set(hash, cached);
    return cached.source;
  }

  const transformed = stripSnippetTypes(source);
  const transformedBytes = byteLength(transformed);
  if (transformedBytes <= MAX_CACHE_ENTRY_BYTES) {
    transformedSourceCache.set(hash, {
      source: transformed,
      bytes: transformedBytes,
    });
    transformedSourceCacheBytes += transformedBytes;
    evictTransformedSourceCache();
  }
  return transformed;
}

export function getTransformedSourceCacheStats() {
  return {
    entries: transformedSourceCache.size,
    bytes: transformedSourceCacheBytes,
    maxEntries: MAX_CACHE_ENTRIES,
    maxBytes: MAX_CACHE_BYTES,
    maxEntryBytes: MAX_CACHE_ENTRY_BYTES,
  };
}

export function clearTransformedSourceCache(): void {
  transformedSourceCache.clear();
  transformedSourceCacheBytes = 0;
}

function stripSnippetTypes(source: string): string {
  const prefix = 'async function __codeModeUser__(){\n';
  const suffix = '\n}';
  const stripped = stripTypeScriptTypes(`${prefix}${source}${suffix}`);
  if (!stripped.startsWith(prefix) || !stripped.endsWith(suffix)) {
    return source;
  }
  return stripped.slice(prefix.length, -suffix.length);
}

function evictTransformedSourceCache(): void {
  while (
    transformedSourceCache.size > MAX_CACHE_ENTRIES ||
    transformedSourceCacheBytes > MAX_CACHE_BYTES
  ) {
    const oldest = transformedSourceCache.keys().next().value;
    if (oldest === undefined) {
      return;
    }
    const entry = transformedSourceCache.get(oldest);
    transformedSourceCache.delete(oldest);
    transformedSourceCacheBytes -= entry?.bytes ?? 0;
  }
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
