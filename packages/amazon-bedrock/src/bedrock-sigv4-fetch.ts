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
  originalFetch?: FetchFunction,
): FetchFunction {
  const fetchImpl = originalFetch || globalThis.fetch;
  return async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    // We only need to sign POST requests that have a body.
    if (init?.method?.toUpperCase() !== 'POST' || !init?.body) {
      return fetchImpl(input, init);
    }

    // Determine the URL from the fetch input.
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
        ? input.href
        : input.url;

    const originalHeaders = extractHeaders(init.headers);
    const bodyString = prepareBodyString(init.body);
    const credentials = getCredentials();
    const signer = new AwsV4Signer({
      url,
      method: 'POST',
      headers: Object.entries(removeUndefinedEntries(originalHeaders)),
      body: bodyString,
      region: credentials.region,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      ...(credentials.sessionToken && {
        sessionToken: credentials.sessionToken,
      }),
      service: 'bedrock',
    });

    const result = await signer.sign();
    const signedHeaders = convertHeadersToRecord(result.headers);
    const mergedHeaders = removeUndefinedEntries(
      combineHeaders(originalHeaders, signedHeaders),
    );

    // Create a new RequestInit with the merged headers including the signed headers.
    const newInit: RequestInit = {
      ...init,
      body: bodyString,
      headers: mergedHeaders,
    };

    // Invoke the underlying fetch implementation with the new headers.
    return fetchImpl(input, newInit);
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
    // Fallback: assume it's a plain object.
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
        originalHeaders[k] = v;
      }
    } else {
      originalHeaders = { ...headers } as Record<string, string>;
    }
  }
  return originalHeaders;
}

function convertHeadersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}
