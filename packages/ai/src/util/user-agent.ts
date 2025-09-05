/**
 * Builds a default User-Agent and merges it with user-provided headers (Node-only).
 */
import {
  buildUserAgent,
  mergeUserAgentHeader,
  canSetUserAgent,
} from '@ai-sdk/provider-utils';
import { VERSION as AI_VERSION } from '../version';
import { VERSION as PROVIDER_UTILS_VERSION } from '@ai-sdk/provider-utils';

/**
 * Returns headers with a normalized User-Agent that includes ai and provider-utils versions.
 * - Appends a user-provided suffix from an existing `User-Agent` header, if present.
 * - No-ops in non-Node runtimes (browser/edge).
 */
export function withAISDKUserAgent(
  headers?: Record<string, string | undefined>,
): Record<string, string | undefined> {
  if (!canSetUserAgent()) return headers ?? {};

  const runtime = 'node';
  const runtimeVersion =
    typeof process !== 'undefined'
      ? process.version.replace(/^v/, '')
      : undefined;
  const platform =
    typeof process !== 'undefined' ? process.platform : undefined;
  const arch = typeof process !== 'undefined' ? process.arch : undefined;

  const baseUA = buildUserAgent({
    aiVersion: AI_VERSION,
    providerUtilsVersion: PROVIDER_UTILS_VERSION,
    runtime,
    runtimeVersion,
    platform,
    arch,
    // Gateway version is added within the gateway package when used.
  });

  const normalizedInput: Record<string, string> | undefined = headers
    ? Object.fromEntries(
        Object.entries(headers).filter(([, v]) => v !== undefined) as Array<
          [string, string]
        >,
      )
    : undefined;
  const merged = mergeUserAgentHeader(normalizedInput, baseUA);
  return merged;
}
