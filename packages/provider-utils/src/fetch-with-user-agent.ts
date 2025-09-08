import { canSetUserAgent, getUserAgent } from './user-agent';
import type { FetchFunction } from './fetch-function';

/**
 * Creates a fetch function that ensures a normalized `user-agent` header is set (Node-only).
 * - If a `user-agent` is already provided, it is left unchanged.
 * - No-ops in browser/edge runtimes where setting `user-agent` is disallowed.
 */
export function createUserAgentFetch(baseFetch?: FetchFunction): FetchFunction {
  const effectiveFetch: FetchFunction = baseFetch ?? (globalThis.fetch as any);

  return async (input: any, init?: RequestInit) => {
    if (!canSetUserAgent()) {
      return effectiveFetch(input as any, init as any);
    }

    try {
      const requestHeaders = init?.headers
        ? new Headers(init.headers)
        : input instanceof Request
          ? new Headers(input.headers)
          : new Headers();

      if (!requestHeaders.has('user-agent')) {
        const userAgent = getUserAgent();
        requestHeaders.set('user-agent', userAgent);
      }

      const nextInit: RequestInit = {
        ...(init ?? {}),
        headers: Object.fromEntries(requestHeaders.entries()),
      };
      return effectiveFetch(input as any, nextInit as any);
    } catch {
      // Fall back to the original fetch in case of any unexpected error during header normalization.
      return effectiveFetch(input as any, init as any);
    }
  };
}
