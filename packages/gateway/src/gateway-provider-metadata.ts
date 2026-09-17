import type { JSONValue } from '@ai-sdk/provider';

/**
 * Metadata for an asynchronous AI Gateway job.
 */
export type GatewayAsyncJobMetadata = {
  readonly jobId: string;
  readonly status: string;

  /**
   * Secret for verifying customer webhook deliveries. This is sensitive,
   * start-response-only metadata and must not be logged or forwarded.
   */
  readonly webhookSigningSecret?: string;
  readonly [key: string]: JSONValue | undefined;
};

/**
 * Shape of the inner `providerMetadata.gateway` object returned by AI Gateway
 * operations.
 *
 * Additional fields may be added without a package update.
 */
export type GatewayProviderMetadata = {
  readonly asyncJob?: GatewayAsyncJobMetadata;
  readonly [key: string]: JSONValue | undefined;
};
