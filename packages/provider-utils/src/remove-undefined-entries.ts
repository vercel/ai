export function removeUndefinedEntries<T>(
  record: Record<string, T | undefined>,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).filter(([_key, value]) => value != null),
  ) as Record<string, T>;
}
