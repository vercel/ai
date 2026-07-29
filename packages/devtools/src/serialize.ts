function normalizeBinaryData(value: unknown): unknown {
  if (value instanceof ArrayBuffer) {
    return Buffer.from(value).toString('base64');
  }

  if (ArrayBuffer.isView(value)) {
    return Buffer.from(
      value.buffer,
      value.byteOffset,
      value.byteLength,
    ).toString('base64');
  }

  if (Array.isArray(value)) {
    return value.map(normalizeBinaryData);
  }

  if (value != null && typeof value === 'object') {
    if (value instanceof Date || value instanceof URL) {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        normalizeBinaryData(item),
      ]),
    );
  }

  return value;
}

/**
 * Serializes captured DevTools values while preserving inline binary media as
 * base64. JSON.stringify otherwise turns Uint8Array values into numeric-keyed
 * objects and ArrayBuffer values into empty objects, which makes previews
 * impossible after the capture is persisted.
 */
export function serializeForDevTools(value: unknown): string {
  return JSON.stringify(normalizeBinaryData(value));
}
