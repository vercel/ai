import {
  combineHeaders,
  getRuntimeEnvironmentUserAgent,
  normalizeHeaders,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import type { AwsSigV4Credentials } from '@ai-sdk/provider-utils/aws';
import { VERSION } from './version';

export type AmazonBedrockCredentials = AwsSigV4Credentials;

export const BEDROCK_USER_AGENT_SUFFIX = `ai-sdk/amazon-bedrock/${VERSION}`;

/**
 * Creates a fetch function that authenticates with Amazon Bedrock using a
 * Bearer token.
 */
export function createApiKeyFetchFunction(
  apiKey: string,
  fetch?: FetchFunction,
): FetchFunction {
  return async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const effectiveFetch = fetch ?? globalThis.fetch;
    const originalHeaders = normalizeHeaders(init?.headers);
    const headersWithUserAgent = withUserAgentSuffix(
      originalHeaders,
      BEDROCK_USER_AGENT_SUFFIX,
      getRuntimeEnvironmentUserAgent(),
    );

    const finalHeaders = combineHeaders(headersWithUserAgent, {
      Authorization: `Bearer ${apiKey}`,
    });

    return effectiveFetch(input, {
      ...init,
      headers: finalHeaders as HeadersInit,
    });
  };
}
