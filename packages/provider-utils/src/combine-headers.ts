const FORBIDDEN_HEADER_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function combineHeaders(
  ...headers: Array<Record<string, string | undefined> | undefined>
): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = Object.create(null);

  for (const headerSet of headers) {
    if (headerSet == null) continue;
    for (const key of Object.keys(headerSet)) {
      if (FORBIDDEN_HEADER_KEYS.has(key)) continue;
      result[key] = headerSet[key] ?? result[key];
    }
  }

  return result;
}
