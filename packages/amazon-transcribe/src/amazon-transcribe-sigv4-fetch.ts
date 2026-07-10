import {
  combineHeaders,
  getRuntimeEnvironmentUserAgent,
  normalizeHeaders,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { AwsV4Signer } from 'aws4fetch';
import { VERSION } from './version';

export interface AmazonTranscribeCredentials {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

/**
 * Creates a fetch function that applies AWS Signature Version 4 signing for a
 * specific AWS service (e.g. `transcribe` or `s3`).
 *
 * Unlike a POST-only signer, this signs all HTTP methods (GET/PUT/POST/...) so
 * it can be used both for the Amazon Transcribe JSON API and for uploading the
 * audio to / downloading the transcript from Amazon S3.
 *
 * @param getCredentials - Function that returns the AWS credentials to use when signing.
 * @param service - The AWS service name to use for the SigV4 signing scope.
 * @param fetch - Optional original fetch implementation to wrap. Defaults to global fetch.
 * @returns A FetchFunction that signs requests before passing them to the underlying fetch.
 */
export function createAmazonTranscribeSigV4FetchFunction(
  getCredentials: () =>
    | AmazonTranscribeCredentials
    | PromiseLike<AmazonTranscribeCredentials>,
  service: string,
  fetch?: FetchFunction,
): FetchFunction {
  return async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    // avoid caching globalThis.fetch in case it is patched by other libraries
    const effectiveFetch = fetch ?? globalThis.fetch;

    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

    const method = (init?.method ?? 'GET').toUpperCase();

    const headersWithUserAgent = withUserAgentSuffix(
      normalizeHeaders(init?.headers),
      `ai-sdk/amazon-transcribe/${VERSION}`,
      getRuntimeEnvironmentUserAgent(),
    );

    // aws4fetch derives x-amz-content-sha256 from the body (string or binary).
    const body = init?.body ?? undefined;

    const credentials = await getCredentials();
    const signer = new AwsV4Signer({
      url,
      method,
      headers: Object.entries(headersWithUserAgent),
      body,
      region: credentials.region,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
      service,
    });

    const signingResult = await signer.sign();
    const signedHeaders = normalizeHeaders(signingResult.headers);

    return effectiveFetch(url, {
      ...init,
      method,
      body,
      headers: combineHeaders(
        headersWithUserAgent,
        signedHeaders,
      ) as HeadersInit,
    });
  };
}
