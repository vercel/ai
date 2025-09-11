import type { FetchFunction } from './fetch-function';
import { VERSION as PROVIDER_UTILS_VERSION } from './version';

export function getRuntimeEnvironmentUserAgent(
  globalThisAny: any = globalThis as any,
): string {
  // Browsers
  if (globalThisAny.window) {
    return `runtime/browser`;
  }

  // Cloudflare Workers / Deno / Bun / Node.js >= 21.1
  if (globalThisAny.navigator?.userAgent) {
    return `runtime/${globalThisAny.navigator.userAgent.toLowerCase()}.`;
  }

  // Nodes.js < 21.1
  if (globalThisAny.process?.versions?.node) {
    return `runtime/node.js/${globalThisAny.process.version.substring(0)}`;
  }

  if (globalThisAny.EdgeRuntime) {
    return `runtime/vercel-edge`;
  }

  return 'runtime/unknown';
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
