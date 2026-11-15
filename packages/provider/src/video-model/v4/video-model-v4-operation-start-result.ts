import type { JSONValue } from '../../json-value/json-value';
import type { SharedV4ProviderMetadata } from '../../shared/v4/shared-v4-provider-metadata';
import type { SharedV4Warning } from '../../shared/v4/shared-v4-warning';

/**
 * Result returned by `doStart` when initiating an asynchronous video generation.
 */
export type VideoModelV4OperationStartResult = {
  /**
   * JSON-serializable opaque reference passed to `doStatus` to check the
   * status of the generation (e.g., a task ID or prediction URL).
   */
  operation: JSONValue;

  /**
   * Warnings for the call, e.g. unsupported features.
   */
  warnings: Array<SharedV4Warning>;

  /**
   * Additional provider-specific metadata.
   */
  providerMetadata?: SharedV4ProviderMetadata;

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
