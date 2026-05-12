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
import { VERSION } from './version';

export type AmazonBedrockCredentials = AwsSigV4Credentials;

const USER_AGENT_SUFFIX = `ai-sdk/amazon-bedrock/${VERSION}`;

/**
 * Creates a fetch function that applies AWS Signature Version 4 signing for
 * Amazon Bedrock. Thin wrapper around the shared SigV4 helper in
 * `@ai-sdk/provider-utils/aws` with the bedrock service name and user-agent
 * baked in.
 */
export function createSigV4FetchFunction(
  getCredentials: () =>
    | AmazonBedrockCredentials
    | PromiseLike<AmazonBedrockCredentials>,
  fetch?: FetchFunction,
): FetchFunction {
  return createSharedSigV4FetchFunction(getCredentials, {
    service: 'bedrock',
    userAgentSuffix: USER_AGENT_SUFFIX,
    fetch,
  });
}

/**
 * Creates a fetch function that applies Bearer token authentication for
 * Amazon Bedrock API key auth.
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
      Authorization: `Bearer ${apiKey}`,
    });

    return effectiveFetch(input, {
      ...init,
      headers: finalHeaders as HeadersInit,
    });
  };
}
