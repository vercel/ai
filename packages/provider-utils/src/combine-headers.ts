export function combineHeaders(
  ...headers: Array<Record<string, string | undefined> | undefined>
): Record<string, string | undefined> {
  const combinedHeaders = new Map<string, [string, string | undefined]>();

  for (const currentHeaders of headers) {
    for (const [key, value] of Object.entries(currentHeaders ?? {})) {
      combinedHeaders.set(key.toLowerCase(), [key, value]);
    }
  }

  return Object.fromEntries(combinedHeaders.values());
}
