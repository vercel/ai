import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';

const encoder = new TextEncoder();

/**
 * Deterministic JSON serialization: object keys are sorted so that two
 * structurally-equal values always produce the same string regardless of key
 * insertion order. Used as the input to content hashing.
 */
export function canonicalJSON(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return JSON.stringify(value);
  }
  if (typeof (value as { toJSON?: unknown }).toJSON === 'function') {
    return canonicalJSON((value as { toJSON: () => unknown }).toJSON());
  }
  if (typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value
      .map(element => {
        if (element === undefined) return 'null';
        const serialized = canonicalJSON(element);
        return serialized === undefined ? 'null' : serialized;
      })
      .join(',')}]`;
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const entries: string[] = [];
  for (const k of keys) {
    const val = (value as Record<string, unknown>)[k];
    if (val === undefined) continue;
    const serialized = canonicalJSON(val);
    if (serialized !== undefined) {
      entries.push(`${JSON.stringify(k)}:${serialized}`);
    }
  }
  return `{${entries.join(',')}}`;
}

export function toBase64url(bytes: Uint8Array): string {
  return convertUint8ArrayToBase64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

/**
 * Canonical SHA-256 digest (base64url) of an arbitrary JSON-serializable value.
 */
export async function hashCanonical(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(canonicalJSON(value) ?? ''),
  );
  return toBase64url(new Uint8Array(digest));
}
