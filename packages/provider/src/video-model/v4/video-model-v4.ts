import type { VideoModelV4CallOptions } from './video-model-v4-call-options';
import type { VideoModelV4Result } from './video-model-v4-result';
import type { VideoModelV4OperationStartResult } from './video-model-v4-operation-start-result';
import type { VideoModelV4OperationStatusResult } from './video-model-v4-operation-status-result';
import type { VideoModelV4OperationWebhook } from './video-model-v4-operation-webhook';

type GetMaxVideosPerCallFunction = (options: {
  modelId: string;
}) => PromiseLike<number | undefined> | number | undefined;

/**
 * Video generation model specification version 4.
 */
export type VideoModelV4 = {
  /**
   * The video model must specify which video model interface
   * version it implements. This will allow us to evolve the video
   * model interface and retain backwards compatibility. The different
   * implementation versions can be handled as a discriminated union
   * on our side.
   */
  readonly specificationVersion: 'v4';

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
  doGenerate?(options: VideoModelV4CallOptions): PromiseLike<VideoModelV4Result>;

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
      received: Promise<VideoModelV4OperationWebhook>;
    }>;
  }) => PromiseLike<{
    webhookUrl: string;
    received: Promise<VideoModelV4OperationWebhook>;
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
    options: VideoModelV4CallOptions & {
      /**
       * When provided, the provider should register this URL to receive
       * a webhook notification when the video generation completes.
       */
      webhookUrl?: string;
    },
  ): PromiseLike<VideoModelV4OperationStartResult>;

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
  }): PromiseLike<VideoModelV4OperationStatusResult>;
};
