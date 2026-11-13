import {
  isArrayBuffer,
  isUint8Array,
  type ModelMessage,
} from '@ai-sdk/provider-utils';

/**
 * Clone model messages while preserving URL instances. Node's structuredClone
 * currently rejects URL objects, which are valid file/image prompt payloads.
 */
export function cloneModelMessages<T extends ModelMessage>(
  messages: Array<T>,
): Array<T> {
  return cloneValue(messages, new Map()) as Array<T>;
}

function cloneValue(value: unknown, seen: Map<object, unknown>): unknown {
  if (value == null || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return seen.get(value);
  }

  if (value instanceof URL) {
    const copy = new URL(value.href);
    seen.set(value, copy);
    return copy;
  }

  if (Array.isArray(value)) {
    const copy: unknown[] = new Array(value.length);
    seen.set(value, copy);
    value.forEach((item, index) => {
      copy[index] = cloneValue(item, seen);
    });
    return copy;
  }

  if (isUint8Array(value)) {
    const copy = new Uint8Array(value);
    seen.set(value, copy);
    return copy;
  }

  if (isArrayBuffer(value)) {
    const copy = new Uint8Array(value).slice().buffer;
    seen.set(value, copy);
    return copy;
  }

  if (
    value instanceof Date ||
    Object.prototype.toString.call(value) === '[object Date]'
  ) {
    try {
      const copy = new Date(Date.prototype.getTime.call(value));
      seen.set(value, copy);
      return copy;
    } catch {
      // A string tag alone does not make a plain object a Date.
    }
  }

  const copy: Record<string, unknown> = {};
  seen.set(value, copy);
  for (const [key, val] of Object.entries(value)) {
    Object.defineProperty(copy, key, {
      value: cloneValue(val, seen),
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
  return copy;
}
