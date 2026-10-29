import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';

const encoder = new TextEncoder();

/**
 * Deterministic JSON serialization: object keys are sorted so that two
 * structurally-equal values always produce the same string regardless of key
 * insertion order. Used as the input to content hashing.
 */
export function canonicalJSON(value: unknown): string | undefined {
  return canonicalize(value, new Set());
}

function canonicalize(
  value: unknown,
  stack: Set<unknown>,
): string | undefined {
  if (value === null || value === undefined) {
    return JSON.stringify(value);
  }
  // `stack` mirrors JSON.stringify's circular-structure detection: a
  // self-referencing object/graph throws instead of recursing until the
  // call stack overflows.
  if (stack.has(value)) {
    throw new TypeError('Converting circular structure to JSON');
  }
  if (typeof (value as { toJSON?: unknown }).toJSON === 'function') {
    const unwrapped = (value as { toJSON: () => unknown }).toJSON();
    if (unwrapped !== value) {
      stack.add(value);
      try {
        return canonicalize(unwrapped, stack);
      } finally {
        stack.delete(value);
      }
    }
    // toJSON() returned its receiver: fall through and serialize the
    // object's own properties instead of re-invoking toJSON() until the
    // call stack overflows.
  }
  if (typeof value !== 'object') {
    return JSON.stringify(value);
  }
  stack.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value
        .map(element => {
          if (element === undefined) return 'null';
          const serialized = canonicalize(element, stack);
          return serialized === undefined ? 'null' : serialized;
        })
        .join(',')}]`;
    }
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const entries: string[] = [];
    for (const k of keys) {
      const val = (value as Record<string, unknown>)[k];
      if (val === undefined) continue;
      const serialized = canonicalize(val, stack);
      if (serialized !== undefined) {
        entries.push(`${JSON.stringify(k)}:${serialized}`);
      }
    }
    return `{${entries.join(',')}}`;
  } finally {
    stack.delete(value);
  }
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
