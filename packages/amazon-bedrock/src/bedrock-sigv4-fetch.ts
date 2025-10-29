import {
  FetchFunction,
  combineHeaders,
  normalizeHeaders,
  withUserAgentSuffix,
  getRuntimeEnvironmentUserAgent,
} from '@ai-sdk/provider-utils';
import { AwsV4Signer } from 'aws4fetch';
import { VERSION } from './version';

export interface BedrockCredentials {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

/**
Creates a fetch function that applies AWS Signature Version 4 signing.

@param getCredentials - Function that returns the AWS credentials to use when signing.
@param fetch - Optional original fetch implementation to wrap. Defaults to global fetch.
@returns A FetchFunction that signs requests before passing them to the underlying fetch.
 */
export function createSigV4FetchFunction(
  getCredentials: () => BedrockCredentials | PromiseLike<BedrockCredentials>,
  fetch: FetchFunction = globalThis.fetch,
): FetchFunction {
  return async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const request = input instanceof Request ? input : undefined;
    const originalHeaders = combineHeaders(
      normalizeHeaders(request?.headers),
      normalizeHeaders(init?.headers),
    );
    const headersWithUserAgent = withUserAgentSuffix(
      originalHeaders,
      `ai-sdk/amazon-bedrock/${VERSION}`,
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
      return fetch(input, {
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
      service: 'bedrock',
    });

    const signingResult = await signer.sign();
    const signedHeaders = normalizeHeaders(signingResult.headers);

    // Use the combined headers directly as HeadersInit
    const combinedHeaders = combineHeaders(headersWithUserAgent, signedHeaders);

    return fetch(input, {
      ...init,
      body,
      headers: combinedHeaders as HeadersInit,
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

/**
Creates a fetch function that applies Bearer token authentication.

@param apiKey - The API key to use for Bearer token authentication.
@param fetch - Optional original fetch implementation to wrap. Defaults to global fetch.
@returns A FetchFunction that adds Authorization header with Bearer token to requests.
 */
export function createApiKeyFetchFunction(
  apiKey: string,
  fetch: FetchFunction = globalThis.fetch,
): FetchFunction {
  return async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const originalHeaders = normalizeHeaders(init?.headers);
    const headersWithUserAgent = withUserAgentSuffix(
      originalHeaders,
      `ai-sdk/amazon-bedrock/${VERSION}`,
      getRuntimeEnvironmentUserAgent(),
    );

    const finalHeaders = combineHeaders(headersWithUserAgent, {
      Authorization: `Bearer ${apiKey}`,
    });

    return fetch(input, {
      ...init,
      headers: finalHeaders as HeadersInit,
    });
  };
}
