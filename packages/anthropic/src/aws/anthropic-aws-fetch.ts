import {
  combineHeaders,
  getRuntimeEnvironmentUserAgent,
  normalizeHeaders,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import type { AwsSigV4Credentials } from '@ai-sdk/provider-utils/aws';
import { VERSION } from '../version';

export type AnthropicAwsCredentials = AwsSigV4Credentials;

export const ANTHROPIC_AWS_USER_AGENT_SUFFIX = `ai-sdk/anthropic-aws/${VERSION}`;

/**
 * Creates a fetch function that authenticates Claude Platform on AWS requests
 * with an AWS-provisioned API key via the `x-api-key` header.
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
      ANTHROPIC_AWS_USER_AGENT_SUFFIX,
      getRuntimeEnvironmentUserAgent(),
    );
    const finalHeaders = combineHeaders(headersWithUserAgent, {
      'x-api-key': apiKey,
    });

    return effectiveFetch(input, {
      ...init,
      headers: finalHeaders as HeadersInit,
    });
  };
}
