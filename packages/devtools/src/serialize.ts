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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function collectMediaBinaryValues(value: unknown): WeakSet<object> {
  const mediaBinaryValues = new WeakSet<object>();
  const visited = new WeakSet<object>();

  const markBinary = (candidate: unknown) => {
    if (candidate instanceof ArrayBuffer || ArrayBuffer.isView(candidate)) {
      mediaBinaryValues.add(candidate);
    }
  };

  const markGeneratedFile = (candidate: unknown) => {
    if (!isRecord(candidate)) return;

    if (Object.hasOwn(candidate, 'uint8Array')) {
      markBinary(candidate.uint8Array);
    }
    markBinary(candidate.uint8ArrayData);
  };

  const markDataContent = (candidate: unknown) => {
    markBinary(candidate);

    if (!isRecord(candidate)) return;

    if (candidate.type === 'data') {
      markBinary(candidate.data);
    }
  };

  const visit = (candidate: unknown) => {
    if (
      candidate == null ||
      typeof candidate !== 'object' ||
      candidate instanceof ArrayBuffer ||
      ArrayBuffer.isView(candidate) ||
      visited.has(candidate)
    ) {
      return;
    }
    visited.add(candidate);

    if (isRecord(candidate) && typeof candidate.type === 'string') {
      switch (candidate.type) {
        case 'file':
        case 'reasoning-file':
          markDataContent(candidate.data);
          markGeneratedFile(candidate);
          markGeneratedFile(candidate.file);
          break;
        case 'image':
          markDataContent(candidate.image);
          break;
        case 'media':
        case 'file-data':
        case 'image-data':
          markBinary(candidate.data);
          break;
      }
    }

    for (const child of Array.isArray(candidate)
      ? candidate
      : Object.values(candidate)) {
      visit(child);
    }
  };

  visit(value);
  return mediaBinaryValues;
}

/**
 * Serializes captured DevTools values while preserving binary values in
 * recognized media-bearing fields as base64. Unrelated binary values retain
 * their normal JSON.stringify representation.
 */
export function serializeForDevTools(value: unknown): string {
  const mediaBinaryValues = collectMediaBinaryValues(value);

  return JSON.stringify(value, function (key, serializedValue) {
    // JSON.stringify invokes toJSON before the replacer. Read the original
    // property from the holder so binary values can still be normalized while
    // preserving custom toJSON behavior for every other object.
    const originalValue = (this as Record<string, unknown>)[key];
    return originalValue != null &&
      typeof originalValue === 'object' &&
      mediaBinaryValues.has(originalValue)
      ? normalizeBinaryData(originalValue)
      : serializedValue;
  });
}
