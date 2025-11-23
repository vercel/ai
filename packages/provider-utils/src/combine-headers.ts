export function combineHeaders(
  ...headers: Array<Record<string, string | undefined> | undefined>
): Record<string, string | undefined> {
  return headers.reduce(
    (combinedHeaders, currentHeaders) => ({
      ...combinedHeaders,
      ...(currentHeaders ?? {}),
    }),
    {},
  ) as Record<string, string | undefined>;
}

export function combineAndMergeMergeableHeaders({
  headers,
  mergeableKeys = [],
}: {
  headers: Array<Record<string, string | undefined> | undefined>,
  mergeableKeys?: string[],
}): Record<string, string | undefined> {
  const mergeableLowerCaseKeys = mergeableKeys.map(key => key.toLowerCase());

  return headers.reduce(
    (combinedHeaders, currentHeaders) => {
      if (!currentHeaders) return combinedHeaders;

      const result = { ...combinedHeaders };

      for (const [key, value] of Object.entries(currentHeaders)) {
        if (value === undefined) continue;

        // Check if the key is mergeable (case-insensitive) and already exists
        if (mergeableLowerCaseKeys.includes(key.toLowerCase()) && result[key]) {
          const existingValues = result[key].split(',').map(val => val.trim());
          const newValues = value.split(',').map(val => val.trim());
          // Combine and deduplicate values
          const allValues = Array.from(new Set([...existingValues, ...newValues]));
          result[key] = allValues.join(',');
        } else {
          result[key] = value;
        }
      }

      return result;
    },
    {},
  ) as Record<string, string | undefined>;
}
