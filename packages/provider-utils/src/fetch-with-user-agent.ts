import type { FetchFunction } from './fetch-function';
import { VERSION as PROVIDER_UTILS_VERSION } from './version';

export function getRuntimeEnvironmentUserAgent(): string {
  // Browsers / Deno / Bun / Node.js >= 21.1
  if (globalThis.navigator?.userAgent) {
    return navigator.userAgent;
  }

  // Nodes.js < 21.1
  if (globalThis.process?.versions?.node) {
    return `Node.js/${process.version.substring(1)}`;
  }

  return '<unknown runtime>';
}

export function withUserAgentSuffix(
  headers: HeadersInit | undefined,
  ...userAgentSuffixParts: string[]
): Record<string, string> {
  const normalizedHeaders = new Headers(headers);
  const currentUserAgentHeader = normalizedHeaders.get('user-agent') || '';

  normalizedHeaders.set(
    'user-agent',
    [currentUserAgentHeader, ...userAgentSuffixParts].filter(Boolean).join(' '),
  );

  return Object.fromEntries(normalizedHeaders);
}

/**
 * Creates a fetch function that ensures a normalized `user-agent` header is set (Node-only).
 * - If a `user-agent` is already provided, it is left unchanged.
 * - No-ops in browser/edge runtimes where setting `user-agent` is disallowed.
 */
export function createUserAgentFetch(baseFetch?: FetchFunction): FetchFunction {
  const effectiveFetch: FetchFunction = baseFetch ?? (globalThis.fetch as any);

  return async (input: string | URL | Request, init?: RequestInit) => {
    // normalize arguments
    if (input instanceof Request) {
      init = {
        ...init,
        headers: input.headers,
      };
      input = input.url;
    }

    const url = String(input);
    const headers = withUserAgentSuffix(
      init?.headers,
      `ai-sdk/provider-utils/${PROVIDER_UTILS_VERSION}`,
      getRuntimeEnvironmentUserAgent(),
    );

    return effectiveFetch(url, {
      ...init,
      headers,
    });
  };
}
