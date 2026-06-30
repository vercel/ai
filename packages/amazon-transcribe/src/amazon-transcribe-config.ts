import type { FetchFunction } from '@ai-sdk/provider-utils';

export type AmazonTranscribeConfig = {
  provider: string;

  /**
   * Resolves the AWS region the provider is configured for.
   */
  region: () => string;

  /**
   * Base URL for the Amazon Transcribe API
   * (e.g. `https://transcribe.us-east-1.amazonaws.com`).
   */
  transcribeBaseUrl: () => string;

  /**
   * Builds the path-style S3 object URL for the given bucket and key
   * (e.g. `https://s3.us-east-1.amazonaws.com/bucket/key`).
   */
  s3ObjectUrl: (options: { bucket: string; key: string }) => string;

  /**
   * Static headers to include in every request.
   */
  headers: () => Record<string, string | undefined>;

  /**
   * SigV4-signing fetch scoped to the `transcribe` service.
   */
  transcribeFetch: FetchFunction;

  /**
   * SigV4-signing fetch scoped to the `s3` service.
   */
  s3Fetch: FetchFunction;

  /**
   * Unsigned fetch used for downloading service-managed pre-signed transcript URLs.
   */
  fetch?: FetchFunction;

  generateId: () => string;

  _internal?: {
    currentDate?: () => Date;
  };
};
