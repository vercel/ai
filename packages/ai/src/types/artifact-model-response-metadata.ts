import type { SharedV4ProviderMetadata } from '@ai-sdk/provider';

/**
 * Response metadata for an artifact model call.
 */
export type ArtifactModelResponseMetadata = {
  /**
   * Timestamp for the start of the generated response.
   */
  timestamp: Date;

  /**
   * The ID of the response model that was used to generate the response.
   */
  modelId: string;

  /**
   * Response headers.
   */
  headers?: Record<string, string>;

  /**
   * Provider-specific metadata for this call.
   */
  providerMetadata?: SharedV4ProviderMetadata;
};
