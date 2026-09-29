import type { SharedV4ProviderMetadata } from '../../shared/v4/shared-v4-provider-metadata';
import type { SharedV4Warning } from '../../shared/v4/shared-v4-warning';
import type { VideoModelV4VideoData } from './video-model-v4-result';

/**
 * Result returned by `doStatus` when checking the status of an
 * asynchronous video generation.
 */
export type VideoModelV4OperationStatusResult =
  | {
      /**
       * The video generation is still in progress.
       */
      status: 'pending';

      /**
       * Warnings for the call.
       */
      warnings?: Array<SharedV4Warning>;

      /**
       * Additional provider-specific metadata.
       */
      providerMetadata?: SharedV4ProviderMetadata;

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
      videos: Array<VideoModelV4VideoData>;

      /**
       * Warnings for the call.
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
      providerMetadata?: SharedV4ProviderMetadata;

      /**
       * Response information for telemetry and debugging purposes.
       */
      response: {
        timestamp: Date;
        modelId: string;
        headers: Record<string, string> | undefined;
      };
    };
