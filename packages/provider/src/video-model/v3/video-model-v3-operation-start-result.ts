import type { SharedV3ProviderMetadata } from '../../shared/v3/shared-v3-provider-metadata';
import type { SharedV3Warning } from '../../shared/v3/shared-v3-warning';

/**
 * Result returned by `doStart` when initiating an asynchronous video generation.
 */
export type VideoModelV3OperationStartResult = {
  /**
   * Opaque reference passed to `doStatus` to check the status of the
   * generation (e.g., a task ID or prediction URL).
   */
  operation: unknown;

  /**
   * Warnings for the call, e.g. unsupported features.
   */
  warnings: Array<SharedV3Warning>;

  /**
   * Additional provider-specific metadata.
   */
  providerMetadata?: SharedV3ProviderMetadata;

  /**
   * Response information for telemetry and debugging purposes.
   */
  response: {
    /**
     * Timestamp for the start of the response.
     */
    timestamp: Date;

    /**
     * The ID of the response model that was used.
     */
    modelId: string;

    /**
     * Response headers.
     */
    headers: Record<string, string> | undefined;
  };
};
