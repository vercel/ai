export function toCamelCase(str: string): string {
  return str.replace(/[_-]([a-z])/g, g => g[1].toUpperCase());
}

/**
Resolves which key to use for providerMetadata based on what the caller
passed in providerOptions. Returns the camelCase variant when the caller
supplied it, otherwise falls back to the raw name.
*/
export function resolveProviderOptionsKey(
  rawName: string,
  providerOptions: Record<string, unknown> | undefined,
): string {
  const camelName = toCamelCase(rawName);
  if (camelName !== rawName && providerOptions?.[camelName] != null) {
    return camelName;
  }
  return rawName;
}
