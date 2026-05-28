import { CodeModeError } from './errors.js';

export function assertJsonSerializable(
  value: unknown,
  maxBytes: number,
  label: string,
): void {
  if (value === undefined) {
    return;
  }

  const seen = new WeakSet<object>();

  function visit(current: unknown, path: string): void {
    if (current === null) {
      return;
    }

    const type = typeof current;
    if (type === 'string' || type === 'number' || type === 'boolean') {
      if (type === 'number' && !Number.isFinite(current as number)) {
        throw new CodeModeError(
          `${label} contains a non-finite number at ${path}.`,
          'CODE_MODE_SERIALIZATION_ERROR',
        );
      }
      return;
    }

    if (
      type === 'undefined' ||
      type === 'function' ||
      type === 'symbol' ||
      type === 'bigint'
    ) {
      throw new CodeModeError(
        `${label} is not JSON-serializable at ${path}.`,
        'CODE_MODE_SERIALIZATION_ERROR',
      );
    }

    if (typeof current !== 'object') {
      return;
    }

    if (seen.has(current)) {
      throw new CodeModeError(
        `${label} contains a circular reference at ${path}.`,
        'CODE_MODE_SERIALIZATION_ERROR',
      );
    }
    seen.add(current);

    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }

    const prototype = Object.getPrototypeOf(current);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new CodeModeError(
        `${label} contains a non-plain object at ${path}.`,
        'CODE_MODE_SERIALIZATION_ERROR',
      );
    }

    for (const [key, item] of Object.entries(
      current as Record<string, unknown>,
    )) {
      visit(item, `${path}.${key}`);
    }
  }

  visit(value, '$');

  const encoded = JSON.stringify(value);
  if (encoded === undefined) {
    throw new CodeModeError(
      `${label} is not JSON-serializable.`,
      'CODE_MODE_SERIALIZATION_ERROR',
    );
  }

  const bytes = new TextEncoder().encode(encoded).byteLength;
  if (bytes > maxBytes) {
    throw new CodeModeError(
      `${label} exceeds the ${maxBytes} byte size limit.`,
      'CODE_MODE_SERIALIZATION_ERROR',
      { bytes, maxBytes },
    );
  }
}

export function toJsonPayload(
  value: unknown,
  maxBytes: number,
  label: string,
): string {
  assertJsonSerializable(value, maxBytes, label);
  return value === undefined ? '' : JSON.stringify(value);
}
