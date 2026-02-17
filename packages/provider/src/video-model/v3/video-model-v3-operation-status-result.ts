import type { SharedV3ProviderMetadata } from '../../shared/v3/shared-v3-provider-metadata';
import type { SharedV3Warning } from '../../shared/v3/shared-v3-warning';
import type { VideoModelV3VideoData } from './video-model-v3';

/**
 * Result returned by `doStatus` when checking the status of an
 * asynchronous video generation.
 */
export type VideoModelV3OperationStatusResult =
  | {
      /**
       * The video generation is still in progress.
       */
      status: 'pending';

      /**
       * Warnings for the call.
       */
      warnings?: Array<SharedV3Warning>;

      /**
       * Additional provider-specific metadata.
       */
      providerMetadata?: SharedV3ProviderMetadata;

      /**
       * Response information for telemetry and debugging purposes.
       */
      response: {
        timestamp: Date;
        modelId: string;
        headers: Record<string, string> | undefined;
      };
    }
  | {
      /**
       * The video generation is complete.
       */
      status: 'completed';

      /**
       * Generated videos.
       */
      videos: Array<VideoModelV3VideoData>;

      /**
       * Warnings for the call.
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
        timestamp: Date;
        modelId: string;
        headers: Record<string, string> | undefined;
      };
    }
  | {
      /**
       * The video generation failed.
       */
      status: 'error';

      /**
       * A human-readable error message describing why the generation failed.
       */
      error: string;

      /**
       * Additional provider-specific metadata.
       */
      providerMetadata?: SharedV3ProviderMetadata;

      /**
       * Response information for telemetry and debugging purposes.
       */
      response: {
        timestamp: Date;
        modelId: string;
        headers: Record<string, string> | undefined;
      };
    };
