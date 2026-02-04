import {
  AISDKError,
  type Experimental_VideoModelV3,
  type SharedV3Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertImageModelFileToDataUri,
  createJsonResponseHandler,
  delay,
  type FetchFunction,
  getFromApi,
  lazySchema,
  parseProviderOptions,
  postJsonToApi,
  type Resolvable,
  resolve,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { replicateFailedResponseHandler } from './replicate-error';
import type { ReplicateVideoModelId } from './replicate-video-settings';

export type ReplicateVideoProviderOptions = {
  // Polling configuration
  pollIntervalMs?: number | null;
  pollTimeoutMs?: number | null;
  maxWaitTimeInSeconds?: number | null;

  // Common video generation options
  guidance_scale?: number | null;
  num_inference_steps?: number | null;

  // Stable Video Diffusion specific
  motion_bucket_id?: number | null;
  cond_aug?: number | null;
  decoding_t?: number | null;
  video_length?: string | null;
  sizing_strategy?: string | null;
  frames_per_second?: number | null;

  // MiniMax specific
  prompt_optimizer?: boolean | null;

  [key: string]: unknown; // For passthrough
};

interface ReplicateVideoModelConfig {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
}

export class ReplicateVideoModel implements Experimental_VideoModelV3 {
  readonly specificationVersion = 'v3';
  readonly maxVideosPerCall = 1; // Replicate video models support 1 video at a time

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: ReplicateVideoModelId,
    private readonly config: ReplicateVideoModelConfig,
  ) {}

  async doGenerate(
    options: Parameters<Experimental_VideoModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<Experimental_VideoModelV3['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const warnings: SharedV3Warning[] = [];

    const replicateOptions = (await parseProviderOptions({
      provider: 'replicate',
      providerOptions: options.providerOptions,
      schema: replicateVideoProviderOptionsSchema,
    })) as ReplicateVideoProviderOptions | undefined;

    const [modelId, version] = this.modelId.split(':');
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

    if (options.seed) {
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

    const maxWaitTimeInSeconds = replicateOptions?.maxWaitTimeInSeconds;
    const preferHeader: Record<string, string> =
      maxWaitTimeInSeconds != null
        ? { prefer: `wait=${maxWaitTimeInSeconds}` }
        : { prefer: 'wait' };

    const predictionUrl =
      version != null
        ? `${this.config.baseURL}/predictions`
        : `${this.config.baseURL}/models/${modelId}/predictions`;

    const { value: prediction, responseHeaders } = await postJsonToApi({
      url: predictionUrl,
      headers: combineHeaders(
        await resolve(this.config.headers),
        options.headers,
        preferHeader,
      ),
      body: {
        input,
        ...(version != null ? { version } : {}),
      },
      successfulResponseHandler: createJsonResponseHandler(
        replicatePredictionSchema,
      ),
      failedResponseHandler: replicateFailedResponseHandler,
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    let finalPrediction = prediction;
    if (
      prediction.status === 'starting' ||
      prediction.status === 'processing'
    ) {
      const pollIntervalMs = replicateOptions?.pollIntervalMs ?? 2000; // 2 seconds
      const pollTimeoutMs = replicateOptions?.pollTimeoutMs ?? 300000; // 5 minutes

      const startTime = Date.now();

      while (
        finalPrediction.status === 'starting' ||
        finalPrediction.status === 'processing'
      ) {
        if (Date.now() - startTime > pollTimeoutMs) {
          throw new AISDKError({
            name: 'REPLICATE_VIDEO_GENERATION_TIMEOUT',
            message: `Video generation timed out after ${pollTimeoutMs}ms`,
          });
        }

        await delay(pollIntervalMs);

        if (options.abortSignal?.aborted) {
          throw new AISDKError({
            name: 'REPLICATE_VIDEO_GENERATION_ABORTED',
            message: 'Video generation request was aborted',
          });
        }

        const { value: statusPrediction } = await getFromApi({
          url: finalPrediction.urls.get,
          headers: await resolve(this.config.headers),
          successfulResponseHandler: createJsonResponseHandler(
            replicatePredictionSchema,
          ),
          failedResponseHandler: replicateFailedResponseHandler,
          abortSignal: options.abortSignal,
          fetch: this.config.fetch,
        });

        finalPrediction = statusPrediction;
      }
    }

    if (finalPrediction.status === 'failed') {
      throw new AISDKError({
        name: 'REPLICATE_VIDEO_GENERATION_FAILED',
        message: `Video generation failed: ${finalPrediction.error ?? 'Unknown error'}`,
      });
    }

    if (finalPrediction.status === 'canceled') {
      throw new AISDKError({
        name: 'REPLICATE_VIDEO_GENERATION_CANCELED',
        message: 'Video generation was canceled',
      });
    }

    const videoUrl = finalPrediction.output;
    if (!videoUrl) {
      throw new AISDKError({
        name: 'REPLICATE_VIDEO_GENERATION_ERROR',
        message: 'No video URL in response',
      });
    }

    return {
      videos: [
        {
          type: 'url',
          url: videoUrl,
          mediaType: 'video/mp4',
        },
      ],
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
      providerMetadata: {
        replicate: {
          videos: [
            {
              url: videoUrl,
            },
          ],
          predictionId: finalPrediction.id,
          metrics: finalPrediction.metrics,
        },
      },
    };
  }
}

const replicatePredictionSchema = z.object({
  id: z.string(),
  status: z.enum(['starting', 'processing', 'succeeded', 'failed', 'canceled']),
  output: z.string().nullish(),
  error: z.string().nullish(),
  urls: z.object({
    get: z.string(),
  }),
  metrics: z
    .object({
      predict_time: z.number().nullish(),
    })
    .nullish(),
});

const replicateVideoProviderOptionsSchema = lazySchema(() =>
  zodSchema(
    z
      .object({
        pollIntervalMs: z.number().positive().nullish(),
        pollTimeoutMs: z.number().positive().nullish(),
        maxWaitTimeInSeconds: z.number().positive().nullish(),
        guidance_scale: z.number().nullish(),
        num_inference_steps: z.number().nullish(),
        motion_bucket_id: z.number().nullish(),
        cond_aug: z.number().nullish(),
        decoding_t: z.number().nullish(),
        video_length: z.string().nullish(),
        sizing_strategy: z.string().nullish(),
        frames_per_second: z.number().nullish(),
        prompt_optimizer: z.boolean().nullish(),
      })
      .loose(),
  ),
);
