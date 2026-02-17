import type { VideoModelV3CallOptions } from './video-model-v3-call-options';
import type { SharedV3ProviderMetadata } from '../../shared/v3/shared-v3-provider-metadata';
import type { SharedV3Warning } from '../../shared/v3/shared-v3-warning';
import type { VideoModelV3StartResult } from './video-model-v3-start-result';
import type { VideoModelV3StatusResult } from './video-model-v3-status-result';
import type { VideoModelV3Webhook } from './video-model-v3-webhook';

type GetMaxVideosPerCallFunction = (options: {
  modelId: string;
}) => PromiseLike<number | undefined> | number | undefined;

/**
 * Generated video data. Can be a URL, base64-encoded string, or binary data.
 */
export type VideoModelV3VideoData =
  | {
      /**
       * Video available as a URL (most common for video providers).
       */
      type: 'url';
      url: string;
      mediaType: string;
    }
  | {
      /**
       * Video as base64-encoded string.
       */
      type: 'base64';
      data: string;
      mediaType: string;
    }
  | {
      /**
       * Video as binary data.
       */
      type: 'binary';
      data: Uint8Array;
      mediaType: string;
    };

/**
 * Video generation model specification version 3.
 */
export type VideoModelV3 = {
  /**
   * The video model must specify which video model interface
   * version it implements. This will allow us to evolve the video
   * model interface and retain backwards compatibility. The different
   * implementation versions can be handled as a discriminated union
   * on our side.
   */
  readonly specificationVersion: 'v3';

  /**
   * Name of the provider for logging purposes.
   */
  readonly provider: string;

  /**
   * Provider-specific model ID for logging purposes.
   */
  readonly modelId: string;

  /**
   * Limit of how many videos can be generated in a single API call.
   * Can be set to a number for a fixed limit, to undefined to use
   * the global limit, or a function that returns a number or undefined,
   * optionally as a promise.
   *
   * Most video models only support generating 1 video at a time due to
   * computational cost. Default is typically 1.
   */
  readonly maxVideosPerCall: number | undefined | GetMaxVideosPerCallFunction;

  /**
   * Generates an array of videos.
   *
   * Optional when `doStart` and `doStatus` are provided to support
   * the asynchronous start/status flow.
   */
  doGenerate?(options: VideoModelV3CallOptions): PromiseLike<{
    /**
     * Generated videos as URLs, base64 strings, or binary data.
     *
     * Most providers return URLs to video files (MP4, WebM) due to large file sizes.
     * Use the discriminated union to indicate the type of video data being returned.
     */
    videos: Array<VideoModelV3VideoData>;

    /**
     * Warnings for the call, e.g. unsupported features.
     */
    warnings: Array<SharedV3Warning>;

    /**
     * Additional provider-specific metadata. They are passed through
     * from the provider to the AI SDK and enable provider-specific
     * results that can be fully encapsulated in the provider.
     *
     * The outer record is keyed by the provider name, and the inner
     * record is provider-specific metadata.
     *
     * ```ts
     * {
     *   "fal": {
     *     "videos": [{
     *       "duration": 5.0,
     *       "fps": 24,
     *       "width": 1280,
     *       "height": 720
     *     }]
     *   }
     * }
     * ```
     */
    providerMetadata?: SharedV3ProviderMetadata;

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
  }>;

  /**
   * Optional method that handles the user's `webhook` option for the
   * asynchronous start/status flow.
   *
   * Its presence on the model signals that the provider's API natively
   * supports webhooks. The SDK checks for this method before invoking the
   * user-provided `webhook` factory:
   *
   * - **Present**: The SDK calls this method with the user's webhook factory.
   *   The implementation should invoke the factory to obtain a webhook URL
   *   and a `received` promise. The URL is then forwarded to `doStart` via
   *   `webhookUrl`, and the SDK awaits `received` instead of polling.
   *
   * - **Absent**: The SDK never calls the user's `webhook` factory and falls
   *   back to polling via `doStatus`. This avoids unnecessary webhook
   *   endpoint creation for providers whose APIs have no native webhook
   *   mechanism.
   *
   * This method exists because the SDK must decide whether to invoke the
   * user's webhook factory — which may create real HTTP endpoints or
   * external resources — *before* calling `doStart`. Without an explicit
   * capability signal on the model, the SDK would eagerly create a webhook
   * endpoint for every provider, even those that silently ignore the URL.
   */
  handleWebhookOption?: (options: {
    webhook: () => PromiseLike<{
      url: string;
      received: Promise<VideoModelV3Webhook>;
    }>;
  }) => PromiseLike<{
    webhookUrl: string;
    received: Promise<VideoModelV3Webhook>;
  }>;

  /**
   * Starts an asynchronous video generation and returns an opaque operation
   * reference that can be passed to `doStatus` to poll for completion.
   *
   * When both `doStart` and `doStatus` are implemented, the SDK core can
   * orchestrate polling or webhook-based completion instead of requiring
   * the provider to implement its own polling loop in `doGenerate`.
   */
  doStart?(
    options: VideoModelV3CallOptions & {
      /**
       * When provided, the provider should register this URL to receive
       * a webhook notification when the video generation completes.
       */
      webhookUrl?: string;
    },
  ): PromiseLike<VideoModelV3StartResult>;

  /**
   * Checks the status of an asynchronous video generation that was
   * started with `doStart`.
   *
   * Returns either a `pending` status or a `completed` status with the
   * generated videos.
   */
  doStatus?(options: {
    /**
     * The opaque operation reference returned by `doStart`.
     */
    operation: unknown;

    /**
     * Abort signal for cancelling the operation.
     */
    abortSignal?: AbortSignal;

    /**
     * Additional HTTP headers.
     */
    headers?: Record<string, string | undefined>;
  }): PromiseLike<VideoModelV3StatusResult>;
};
