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
  readonly routing?: GatewayRoutingMetadata;
  readonly [key: string]: JSONValue | undefined;
};

/**
 * Routing details in `providerMetadata.gateway.routing`.
 */
export type GatewayRoutingMetadata = {
  readonly modelAttempts?: readonly GatewayModelAttemptMetadata[];
  readonly [key: string]: JSONValue | undefined;
};

/**
 * One model attempt in `providerMetadata.gateway.routing.modelAttempts`.
 *
 * On a conditional evaluation fallback response, the successful attempt of
 * each stage carries that stage's `generationId`, `usage`, and cost fields,
 * and the first fallback attempt carries `triggeredBy`.
 */
export type GatewayModelAttemptMetadata = {
  readonly canonicalSlug: string;
  readonly success: boolean;
  readonly providerAttemptCount: number;
  readonly generationId?: string;
  readonly usage?: {
    readonly inputTokens: number;
    readonly outputTokens: number;
  };
  readonly triggeredBy?: readonly GatewayEvaluationFallbackTrigger[];
  readonly cost?: string;
  readonly marketCost?: string;
  readonly surchargeCost?: string;
  readonly gatewayCost?: string;
  readonly inferenceCost?: string;
  readonly inputInferenceCost?: string;
  readonly outputInferenceCost?: string;
  readonly zeroDataRetentionCost?: string;
  readonly regionPinningCost?: string;
  readonly reportingTagWriteCost?: string;
  readonly quotaWriteCost?: string;
  readonly providerAllowlistCost?: string;
  readonly modelAllowlistCost?: string;
  readonly [key: string]: JSONValue | undefined;
};

/**
 * A condition question that triggered a conditional evaluation fallback.
 */
export type GatewayEvaluationFallbackTrigger = {
  readonly question: string;
  readonly reason:
    | 'confidence_below'
    | 'confidence_unavailable'
    | 'probability_between'
    | (string & {});
};
