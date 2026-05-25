export type GradiumConfig = {
  provider: string;
  url: (path: { path: string; modelId: string }) => string;
  headers: () => Record<string, string>;
  fetch?: typeof globalThis.fetch;
  generateId?: () => string;
};

/**
 * Drop `undefined` values from a header bag so the result is acceptable
 * to DOM `fetch`'s `HeadersInit` (which rejects `string | undefined`).
 * `combineHeaders` from `@ai-sdk/provider-utils` produces the loose form
 * intentionally so providers can compose headers; we tighten at the call
 * site.
 */
export function cleanHeaders(
  headers: Record<string, string | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}
