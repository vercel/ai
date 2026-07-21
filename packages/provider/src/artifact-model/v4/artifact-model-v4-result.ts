import type { SharedV4ProviderMetadata } from '../../shared/v4/shared-v4-provider-metadata';
import type { SharedV4Warning } from '../../shared/v4/shared-v4-warning';

/**
 * Generated artifact data.
 */
export type ArtifactModelV4ArtifactData =
  | {
      type: 'url';
      url: string;
      mediaType: string;
      filename?: string;
      role?: string;
    }
  | {
      type: 'base64';
      data: string;
      mediaType: string;
      filename?: string;
      role?: string;
    }
  | {
      type: 'binary';
      data: Uint8Array;
      mediaType: string;
      filename?: string;
      role?: string;
    };

/**
 * The result of an artifact model `doGenerate` call.
 */
export type ArtifactModelV4Result = {
  /**
   * Generated artifact files.
   */
  artifacts: Array<ArtifactModelV4ArtifactData>;

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
    headers: Record<string, string> | undefined;
  };
};
