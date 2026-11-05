import {
  AISDKError,
  type Experimental_VideoModelV4 as VideoModelV4,
  type Experimental_VideoModelV4OperationStartResult as VideoModelV4OperationStartResult,
  type Experimental_VideoModelV4OperationStatusResult as VideoModelV4OperationStatusResult,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  lazySchema,
  zodSchema,
  combineHeaders,
  convertImageModelFileToDataUri,
  createJsonResponseHandler,
  type FetchFunction,
  getFromApi,
  type InferSchema,
  parseProviderOptions,
  postJsonToApi,
  type Resolvable,
  resolve,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { cancelReplicatePrediction } from './cancel-prediction';
import { replicateFailedResponseHandler } from './replicate-error';
import {
  replicateVideoModelOptionsSchema,
  type ReplicateVideoModelOptions,
} from './replicate-video-model-options';
import type { ReplicateVideoModelId } from './replicate-video-settings';

interface ReplicateVideoModelConfig {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
}

export class ReplicateVideoModel implements VideoModelV4 {
  readonly specificationVersion = 'v4';
  readonly maxVideosPerCall = 1; // Replicate video models support 1 video at a time

  // Cancellations registered for running predictions, keyed by the
  // prediction's cancel URL so concurrent calls stay independent.
  private readonly pendingCancellations = new Map<
    string,
    PendingCancellation
  >();

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: ReplicateVideoModelId,
    private readonly config: ReplicateVideoModelConfig,
  ) {}

  private async buildInput(options: {
    prompt?: string;
    image?:
      | { type: 'url'; url: string }
      | { type: 'file'; data: string | Uint8Array; mediaType: string };
    aspectRatio?: string;
    resolution?: string;
    duration?: number;
    fps?: number;
    seed?: number;
    providerOptions?: Record<string, Record<string, unknown>>;
  }): Promise<{
    input: Record<string, unknown>;
    warnings: SharedV4Warning[];
    replicateOptions: ReplicateVideoModelOptions | undefined;
  }> {
    const warnings: SharedV4Warning[] = [];

    const replicateOptions = (await parseProviderOptions({
      provider: 'replicate',
      providerOptions: options.providerOptions,
      schema: replicateVideoModelOptionsSchema,
    })) as ReplicateVideoModelOptions | undefined;

    const input: Record<string, unknown> = {};

    if (options.prompt != null) {
      input.prompt = options.prompt;
    }

    if (options.image != null) {
      if (options.image.type === 'url') {
        input.image = options.image.url;
      } else {
        input.image = convertImageModelFileToDataUri(options.image);
      }
    }

    if (options.aspectRatio) {
      input.aspect_ratio = options.aspectRatio;
    }

    if (options.resolution) {
      input.size = options.resolution;
    }

    if (options.duration) {
      input.duration = options.duration;
    }

    if (options.fps) {
      input.fps = options.fps;
    }

    if (options.seed != null) {
      input.seed = options.seed;
    }

    if (replicateOptions != null) {
      const opts = replicateOptions;
      if (opts.guidance_scale !== undefined && opts.guidance_scale !== null) {
        input.guidance_scale = opts.guidance_scale;
      }
      if (
        opts.num_inference_steps !== undefined &&
        opts.num_inference_steps !== null
      ) {
        input.num_inference_steps = opts.num_inference_steps;
      }
      if (
        opts.motion_bucket_id !== undefined &&
        opts.motion_bucket_id !== null
      ) {
        input.motion_bucket_id = opts.motion_bucket_id;
      }
      if (opts.cond_aug !== undefined && opts.cond_aug !== null) {
        input.cond_aug = opts.cond_aug;
      }
      if (opts.decoding_t !== undefined && opts.decoding_t !== null) {
        input.decoding_t = opts.decoding_t;
      }
      if (opts.video_length !== undefined && opts.video_length !== null) {
        input.video_length = opts.video_length;
      }
      if (opts.sizing_strategy !== undefined && opts.sizing_strategy !== null) {
        input.sizing_strategy = opts.sizing_strategy;
      }
      if (
        opts.frames_per_second !== undefined &&
        opts.frames_per_second !== null
      ) {
        input.frames_per_second = opts.frames_per_second;
      }
      if (
        opts.prompt_optimizer !== undefined &&
        opts.prompt_optimizer !== null
      ) {
        input.prompt_optimizer = opts.prompt_optimizer;
      }

      for (const [key, value] of Object.entries(opts)) {
        if (
          ![
            'pollIntervalMs',
            'pollTimeoutMs',
            'maxWaitTimeInSeconds',
            'guidance_scale',
            'num_inference_steps',
            'motion_bucket_id',
            'cond_aug',
            'decoding_t',
            'video_length',
            'sizing_strategy',
            'frames_per_second',
            'prompt_optimizer',
          ].includes(key)
        ) {
          input[key] = value;
        }
      }
    }

    return { input, warnings, replicateOptions };
  }

  async handleWebhookOption(
    options: Parameters<NonNullable<VideoModelV4['handleWebhookOption']>>[0],
  ) {
    const { url, received } = await options.webhook();
    return { webhookUrl: url, received };
  }

  async doStart(
    options: Parameters<NonNullable<VideoModelV4['doStart']>>[0],
  ): Promise<VideoModelV4OperationStartResult> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { input, warnings } = await this.buildInput(options);

    const [modelId, version] = this.modelId.split(':');

    const predictionUrl =
      version != null
        ? `${this.config.baseURL}/predictions`
        : `${this.config.baseURL}/models/${modelId}/predictions`;

    const headers = combineHeaders(
      await resolve(this.config.headers),
      options.headers,
    );

    const { value: prediction, responseHeaders } = await postJsonToApi({
      url: predictionUrl,
      headers,
      body: {
        input,
        ...(version != null ? { version } : {}),
        ...(options.webhookUrl != null
          ? {
              webhook: options.webhookUrl,
              webhook_events_filter: ['completed'],
            }
          : {}),
      },
      successfulResponseHandler: createJsonResponseHandler(
        replicatePredictionSchema,
      ),
      failedResponseHandler: replicateFailedResponseHandler,
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const cancelUrl = prediction.urls.cancel;

    // The SDK orchestrates polling for this model, so an abort can arrive while
    // it waits between status checks. Register the cancellation up front to
    // still stop the prediction on Replicate when that happens.
    this.registerCancellation({
      cancelUrl,
      abortSignal: options.abortSignal,
      headers,
    });

    return {
      operation: {
        getUrl: prediction.urls.get,
        ...(cancelUrl != null ? { cancelUrl } : {}),
      },
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
    };
  }

  async doStatus(
    options: Parameters<NonNullable<VideoModelV4['doStatus']>>[0],
  ): Promise<VideoModelV4OperationStatusResult> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { getUrl, cancelUrl } = options.operation as {
      getUrl: string;
      cancelUrl?: string;
    };

    const headers = combineHeaders(
      await resolve(this.config.headers),
      options.headers,
    );

    const pendingCancellation =
      cancelUrl != null ? this.pendingCancellations.get(cancelUrl) : undefined;

    let prediction: ReplicateVideoPrediction;
    let responseHeaders: Record<string, string> | undefined;

    try {
      const result = await getFromApi({
        url: getUrl,
        // getUrl comes from the provider response body.
        validateUrl: true,
        credentialedOrigin: this.config.baseURL,
        trustedOrigin: this.config.baseURL,
        headers,
        successfulResponseHandler: createJsonResponseHandler(
          replicatePredictionSchema,
        ),
        failedResponseHandler: replicateFailedResponseHandler,
        abortSignal: options.abortSignal,
        fetch: this.config.fetch,
      });
      prediction = result.value;
      responseHeaders = result.responseHeaders;
    } catch (error) {
      // The status request was aborted (caller abort or poll timeout): cancel
      // the prediction so it does not keep running (and billing) on Replicate.
      if (options.abortSignal?.aborted && pendingCancellation?.fired !== true) {
        this.cancelPrediction({ cancelUrl, headers });
      }

      this.clearCancellation(cancelUrl);

      throw error;
    }

    if (
      prediction.status === 'failed' ||
      prediction.status === 'canceled' ||
      prediction.status === 'succeeded'
    ) {
      // The prediction reached a terminal state: nothing left to cancel.
      this.clearCancellation(cancelUrl);
    }

    if (prediction.status === 'failed') {
      return {
        status: 'error' as const,
        error: `Video generation failed: ${prediction.error ?? 'Unknown error'}`,
        response: {
          timestamp: currentDate,
          modelId: this.modelId,
          headers: responseHeaders,
        },
      };
    }

    if (prediction.status === 'canceled') {
      return {
        status: 'error' as const,
        error: 'Video generation was canceled',
        response: {
          timestamp: currentDate,
          modelId: this.modelId,
          headers: responseHeaders,
        },
      };
    }

    if (prediction.status === 'succeeded') {
      if (!prediction.output) {
        throw new AISDKError({
          name: 'REPLICATE_VIDEO_GENERATION_ERROR',
          message: 'No video URL in response',
        });
      }

      return {
        status: 'completed',
        videos: [
          { type: 'url', url: prediction.output, mediaType: 'video/mp4' },
        ],
        warnings: [],
        response: {
          timestamp: currentDate,
          modelId: this.modelId,
          headers: responseHeaders,
        },
        providerMetadata: {
          replicate: {
            videos: [{ url: prediction.output }],
            predictionId: prediction.id,
            metrics: prediction.metrics,
          },
        },
      };
    }

    // starting or processing
    return {
      status: 'pending',
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
    };
  }

  private registerCancellation({
    cancelUrl,
    abortSignal,
    headers,
  }: {
    cancelUrl: string | null | undefined;
    abortSignal: AbortSignal | undefined;
    headers: Record<string, string | undefined>;
  }): void {
    if (cancelUrl == null || abortSignal == null) {
      return;
    }

    const pending: PendingCancellation = {
      abortSignal,
      fired: false,
      listener: () => {
        pending.fired = true;
        this.pendingCancellations.delete(cancelUrl);
        this.cancelPrediction({ cancelUrl, headers });
      },
    };

    abortSignal.addEventListener('abort', pending.listener, { once: true });
    this.pendingCancellations.set(cancelUrl, pending);
  }

  private clearCancellation(cancelUrl?: string): void {
    if (cancelUrl == null) {
      return;
    }

    const pending = this.pendingCancellations.get(cancelUrl);
    if (pending == null) {
      return;
    }

    pending.abortSignal.removeEventListener('abort', pending.listener);
    this.pendingCancellations.delete(cancelUrl);
  }

  private cancelPrediction({
    cancelUrl,
    headers,
  }: {
    cancelUrl: string | undefined;
    headers: Record<string, string | undefined>;
  }): void {
    void cancelReplicatePrediction({
      cancelUrl,
      headers,
      baseURL: this.config.baseURL,
      fetch: this.config.fetch,
    });
  }
}

const replicatePredictionSchema = lazySchema(() =>
  zodSchema(
    z.object({
      id: z.string(),
      status: z.enum([
        'starting',
        'processing',
        'succeeded',
        'failed',
        'canceled',
      ]),
      output: z.string().nullish(),
      error: z.string().nullish(),
      urls: z.object({
        get: z.string(),
        cancel: z.string().nullish(),
      }),
      metrics: z
        .object({
          predict_time: z.number().nullish(),
        })
        .nullish(),
    }),
  ),
);

type ReplicateVideoPrediction = InferSchema<typeof replicatePredictionSchema>;

type PendingCancellation = {
  abortSignal: AbortSignal;
  listener: () => void;
  fired: boolean;
};
