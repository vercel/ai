import {
  combineHeaders,
  getRuntimeEnvironmentUserAgent,
  normalizeHeaders,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { AwsV4Signer } from 'aws4fetch';
import { VERSION } from '../version';

export interface AnthropicAwsCredentials {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

/**
 * Creates a fetch function that applies AWS Signature Version 4 signing for
 * Claude Platform on AWS. The SigV4 service name is `aws-external-anthropic`.
 */
export function createSigV4FetchFunction(
  getCredentials: () =>
    | AnthropicAwsCredentials
    | PromiseLike<AnthropicAwsCredentials>,
  fetch?: FetchFunction,
): FetchFunction {
  return async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const effectiveFetch = fetch ?? globalThis.fetch;
    const request = input instanceof Request ? input : undefined;
    const originalHeaders = combineHeaders(
      normalizeHeaders(request?.headers),
      normalizeHeaders(init?.headers),
    );
    const headersWithUserAgent = withUserAgentSuffix(
      originalHeaders,
      `ai-sdk/anthropic-aws/${VERSION}`,
      getRuntimeEnvironmentUserAgent(),
    );

    let effectiveBody: BodyInit | undefined = init?.body ?? undefined;
    if (effectiveBody === undefined && request && request.body !== null) {
      try {
        effectiveBody = await request.clone().text();
      } catch {}
    }

    const effectiveMethod = init?.method ?? request?.method;

    if (effectiveMethod?.toUpperCase() !== 'POST' || !effectiveBody) {
      return effectiveFetch(input, {
        ...init,
        headers: headersWithUserAgent as HeadersInit,
      });
    }

    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

    const body = prepareBodyString(effectiveBody);
    const credentials = await getCredentials();
    const signer = new AwsV4Signer({
      url,
      method: 'POST',
      headers: Object.entries(headersWithUserAgent),
      body,
      region: credentials.region,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
      service: 'aws-external-anthropic',
    });

    const signingResult = await signer.sign();
    const signedHeaders = normalizeHeaders(signingResult.headers);
    const combinedHeaders = combineHeaders(headersWithUserAgent, signedHeaders);

    return effectiveFetch(input, {
      ...init,
      body,
      headers: combinedHeaders as HeadersInit,
    });
  };
}

/**
 * Creates a fetch function that authenticates with an AWS-provisioned API key
 * via the `x-api-key` header. Used for the simpler integration path that
 * doesn't require AWS credentials.
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
      `ai-sdk/anthropic-aws/${VERSION}`,
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

function prepareBodyString(body: BodyInit | undefined): string {
  if (typeof body === 'string') {
    return body;
  } else if (body instanceof Uint8Array) {
    return new TextDecoder().decode(body);
  } else if (body instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(body));
  } else {
    return JSON.stringify(body);
  }
}
