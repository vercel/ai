import { FetchFunction, combineHeaders } from '@ai-sdk/provider-utils';
import { AwsV4Signer } from 'aws4fetch';

export interface BedrockCredentials {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

/**
 * Creates a fetch function that applies AWS Signature Version 4 signing.
 *
 * This wrapper inspects the RequestInit and, if it is a POST with a body, it uses
 * AwsV4Signer to add the required signing headers. It ensures that if the request body
 * is already stringified it will be reused directly—saving us from having to call JSON.stringify
 * again on a large payload.
 *
 * @param settings - Settings to use when signing (region, access key, secret, etc.).
 * @param originalFetch - Optional original fetch implementation to wrap. Defaults to global fetch.
 * @returns A FetchFunction that signs requests before passing them to the underlying fetch.
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
    if (!init || init.method?.toUpperCase() !== 'POST' || !init.body) {
      return fetchImpl(input, init);
    }

    // Determine the URL from the fetch input.
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
        ? input.href
        : input.url;

    // Extract headers from the RequestInit.
    let originalHeaders: Record<string, string | undefined> = {};
    if (init.headers) {
      if (init.headers instanceof Headers) {
        originalHeaders = convertHeadersToRecord(init.headers);
      } else if (Array.isArray(init.headers)) {
        for (const [k, v] of init.headers) {
          originalHeaders[k] = v;
        }
      } else {
        originalHeaders = { ...init.headers } as Record<string, string>;
      }
    }

    // Prepare the body as a string.
    // If the body is already a string, do not re-stringify.
    let bodyString: string;
    if (typeof init.body === 'string') {
      bodyString = init.body;
    } else if (init.body instanceof Uint8Array) {
      bodyString = new TextDecoder().decode(init.body);
    } else if (init.body instanceof ArrayBuffer) {
      bodyString = new TextDecoder().decode(new Uint8Array(init.body));
    } else {
      // Fallback: assume it's a plain object.
      bodyString = JSON.stringify(init.body);
    }

    // Create the signer, passing the already stringified body.
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

    // Create a new RequestInit with the clean headers.
    const newInit: RequestInit = {
      ...init,
      body: bodyString,
      headers: mergedHeaders,
    };

    // Invoke the underlying fetch implementation with the new headers.
    return fetchImpl(input, newInit);
  };
}

function convertHeadersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

// TODO: export from provider-utils.
function removeUndefinedEntries<T>(
  record: Record<string, T | undefined>,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).filter(([_key, value]) => value != null),
  ) as Record<string, T>;
}
