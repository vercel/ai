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
@param originalFetch - Optional original fetch implementation to wrap. Defaults to global fetch.
@returns A FetchFunction that signs requests before passing them to the underlying fetch.
 */
export function createSigV4FetchFunction(
  getCredentials: () => BedrockCredentials,
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
    const credentials = getCredentials();
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

function extractHeaders(
  headers: HeadersInit | undefined,
): Record<string, string | undefined> {
  let originalHeaders: Record<string, string | undefined> = {};
  if (headers) {
    if (headers instanceof Headers) {
      originalHeaders = convertHeadersToRecord(headers);
    } else if (Array.isArray(headers)) {
      for (const [k, v] of headers) {
        originalHeaders[k.toLowerCase()] = v;
      }
    } else {
      originalHeaders = Object.fromEntries(
        Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
      ) as Record<string, string>;
    }
  }
  return originalHeaders;
}

function convertHeadersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key.toLowerCase()] = value;
  });
  return record;
}
