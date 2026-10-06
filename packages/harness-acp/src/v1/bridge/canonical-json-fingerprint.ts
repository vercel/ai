export function canonicalFingerprint({ value }: { value: unknown }): string {
  return JSON.stringify(canonicalizeJSON({ value }));
}

function canonicalizeJSON({ value }: { value: unknown }): unknown {
  if (Array.isArray(value)) {
    return value.map(item => canonicalizeJSON({ value: item }));
  }
  if (value == null || typeof value !== 'object') return value;
  const record = value as Readonly<Record<string, unknown>>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .filter(key => record[key] !== undefined)
      .map(key => [key, canonicalizeJSON({ value: record[key] })]),
  );
}
