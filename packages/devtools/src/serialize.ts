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

  return value;
}

/**
 * Serializes captured DevTools values while preserving inline binary media as
 * base64. JSON.stringify otherwise turns Uint8Array values into numeric-keyed
 * objects and ArrayBuffer values into empty objects, which makes previews
 * impossible after the capture is persisted.
 */
export function serializeForDevTools(value: unknown): string {
  return JSON.stringify(value, function (key, serializedValue) {
    // JSON.stringify invokes toJSON before the replacer. Read the original
    // property from the holder so binary values can still be normalized while
    // preserving custom toJSON behavior for every other object.
    const originalValue = (this as Record<string, unknown>)[key];
    return normalizeBinaryData(originalValue) === originalValue
      ? serializedValue
      : normalizeBinaryData(originalValue);
  });
}
