import {
  combineHeaders,
  getRuntimeEnvironmentUserAgent,
  normalizeHeaders,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import {
  createSigV4FetchFunction as createSharedSigV4FetchFunction,
  type AwsSigV4Credentials,
} from '@ai-sdk/provider-utils/aws';
import { VERSION } from '../version';

export type AnthropicAwsCredentials = AwsSigV4Credentials;

const USER_AGENT_SUFFIX = `ai-sdk/anthropic-aws/${VERSION}`;

/**
 * Creates a fetch function that signs Claude Platform on AWS requests with
 * AWS Signature Version 4 (service: `aws-external-anthropic`).
 */
export function createSigV4FetchFunction(
  getCredentials: () =>
    | AnthropicAwsCredentials
    | PromiseLike<AnthropicAwsCredentials>,
  fetch?: FetchFunction,
): FetchFunction {
  return createSharedSigV4FetchFunction(getCredentials, {
    service: 'aws-external-anthropic',
    userAgentSuffix: USER_AGENT_SUFFIX,
    fetch,
  });
}

/**
 * Creates a fetch function that authenticates with an AWS-provisioned API key
 * via the `x-api-key` header.
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
      USER_AGENT_SUFFIX,
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
