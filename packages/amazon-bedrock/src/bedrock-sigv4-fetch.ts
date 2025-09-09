import { convertHeadersToRecord, extractHeaders } from './headers-utils';
import {
  FetchFunction,
  combineHeaders,
  removeUndefinedEntries,
} from '@ai-sdk/provider-utils';
import { AwsV4Signer } from 'aws4fetch';

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
    if (init?.method?.toUpperCase() !== 'POST' || !init?.body) {
      return fetch(input, init);
    }

    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

    const originalHeaders = extractHeaders(init.headers);
    const body = prepareBodyString(init.body);
    const credentials = await getCredentials();
    const signer = new AwsV4Signer({
      url,
      method: 'POST',
      headers: Object.entries(removeUndefinedEntries(originalHeaders)),
      body,
      region: credentials.region,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
      service: 'bedrock',
    });

    const signingResult = await signer.sign();
    const signedHeaders = convertHeadersToRecord(signingResult.headers);
    return fetch(input, {
      ...init,
      body,
      headers: removeUndefinedEntries(
        combineHeaders(originalHeaders, signedHeaders),
      ),
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
    const originalHeaders = extractHeaders(init?.headers);

    return fetch(input, {
      ...init,
      headers: removeUndefinedEntries(
        combineHeaders(originalHeaders, {
          Authorization: `Bearer ${apiKey}`,
        }),
      ),
    });
  };
}
