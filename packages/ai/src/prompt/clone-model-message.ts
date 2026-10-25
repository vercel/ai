import type { ModelMessage } from '@ai-sdk/provider-utils';

/**
 * Clone model messages while preserving URL instances. Node's structuredClone
 * currently rejects URL objects, which are valid file/image prompt payloads.
 */
export function cloneModelMessages<T extends ModelMessage>(
  messages: Array<T>,
): Array<T> {
  const seen = new Map<unknown, unknown>();
  return messages.map(message => cloneValue(message, seen)) as Array<T>;
}

function cloneValue<T>(value: T, seen: Map<unknown, unknown>): T {
  if (value == null || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return seen.get(value) as T;
  }

  if (value instanceof URL) {
    const copy = new URL(value.href);
    seen.set(value, copy);
    return copy as T;
  }

  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    seen.set(value, copy);
    for (const item of value) {
      copy.push(cloneValue(item, seen));
    }
    return copy as T;
  }

  if (ArrayBuffer.isView(value)) {
    const copy = new Uint8Array(
      value.buffer.slice(
        value.byteOffset,
        value.byteOffset + value.byteLength,
      ),
    );
    seen.set(value, copy);
    return copy as T;
  }

  if (
    value instanceof ArrayBuffer ||
    Object.prototype.toString.call(value) === '[object ArrayBuffer]'
  ) {
    const copy = (value as ArrayBuffer).slice(0);
    seen.set(value, copy);
    return copy as T;
  }

  if (
    value instanceof Date ||
    Object.prototype.toString.call(value) === '[object Date]'
  ) {
    const copy = new Date((value as Date).getTime());
    seen.set(value, copy);
    return copy as T;
  }

  const copy: Record<string, unknown> = {};
  seen.set(value, copy);
  for (const [key, val] of Object.entries(value)) {
    copy[key] = cloneValue(val, seen);
  }
  return copy as T;
}
