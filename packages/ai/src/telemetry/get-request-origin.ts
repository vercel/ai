import type { LanguageModelV4GenerateResult } from '@ai-sdk/provider';

/** Remove credentials, paths, queries, and fragments before emitting telemetry. */
export function getRequestOrigin(url: string | undefined): string | undefined {
  if (url == null) return undefined;

  try {
    const endpoint = new URL(url);
    return endpoint.protocol === 'http:' || endpoint.protocol === 'https:'
      ? endpoint.origin
      : undefined;
  } catch {
    return undefined;
  }
}

/** Preserve request metadata while keeping unknown or sensitive URL fields out of results. */
export function sanitizeRequestMetadata(
  request: LanguageModelV4GenerateResult['request'],
): LanguageModelV4GenerateResult['request'] {
  if (request == null || !('url' in request)) return request;
  const { url, ...rest } = request;
  const origin = getRequestOrigin(url);
  return { ...rest, ...(origin != null ? { url: origin } : {}) };
}
