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

/**
 * Appends suffix parts to the `user-agent` header.
 * If a `user-agent` header already exists, the suffix parts are appended to it.
 * If no `user-agent` header exists, a new one is created with the suffix parts.
 *
 * @param headers - The original headers.
 * @param userAgentSuffixParts - The parts to append to the `user-agent` header.
 * @returns The new headers with the `user-agent` header set or updated.
 */
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
 * Creates a fetch function that adds a `user-agent` header to each request.
 */
export function createUserAgentFetch(baseFetch?: FetchFunction): FetchFunction {
  const effectiveFetch: FetchFunction = baseFetch ?? (globalThis.fetch as any);

  return async (input: string | URL | Request, init?: RequestInit) => {
    // normalize arguments
    if (input instanceof Request) {
      init = input;
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
