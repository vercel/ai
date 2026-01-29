import { AISDKError, VideoModelV3, SharedV3Warning } from '@ai-sdk/provider';
import {
  combineHeaders,
  convertImageModelFileToDataUri,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  delay,
  FetchFunction,
  getFromApi,
  lazySchema,
  parseProviderOptions,
  postJsonToApi,
  Resolvable,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { FalConfig } from './fal-config';
import { falErrorDataSchema, falFailedResponseHandler } from './fal-error';
import { FalVideoModelId } from './fal-video-settings';

/**
 * Options for FAL video generation models.
 *
 * Different models support different options. Common options like `pollIntervalMs`
 * work across all models, while others are model-specific.
 *
 * @see https://fal.ai/models - Browse all FAL video models
 */
export type FalVideoCallOptions = {
  // ============================================
  // General options (work across most models)
  // ============================================

  /**
   * Enable video looping.
   * Supported by: Luma models
   */
  loop?: boolean | null;

  /**
   * Motion strength for video generation (0-1).
   */
  motionStrength?: number | null;

  /**
   * Polling interval in milliseconds when waiting for video generation.
   * @default 2000
   */
  pollIntervalMs?: number | null;

  /**
   * Maximum time to wait for video generation in milliseconds.
   * @default 300000 (5 minutes)
   */
  pollTimeoutMs?: number | null;

  /**
   * Output video resolution.
   * Supported by: Luma Ray 2 models
   */
  resolution?: '540p' | '720p' | '1080p' | null;

  /**
   * Negative prompt - what to avoid in the video.
   */
  negativePrompt?: string | null;

  /**
   * Enable prompt optimization.
   */
  promptOptimizer?: boolean | null;

  // Kling Motion Control options (kling-video/v2.6/pro/motion-control)

  /** Character image URL. Required for Kling motion control. */
  image_url?: string | null;

  /** Reference video URL for motion transfer. Required for Kling motion control. */
  video_url?: string | null;

  /** Output orientation: 'image' or 'video'. @default 'image' */
  character_orientation?: 'image' | 'video' | null;

  /** Keep audio from reference video. @default true */
  keep_original_sound?: boolean | null;

  // Allow additional model-specific options
  [key: string]: any;
};

// Provider options schema for FAL video generation
export const falVideoProviderOptionsSchema = lazySchema(() =>
  zodSchema(
    z
      .object({
        // Video loop - only for Luma models
        loop: z.boolean().nullish(),

        // Motion strength (provider-specific)
        motionStrength: z.number().min(0).max(1).nullish(),

        // Polling configuration
        pollIntervalMs: z.number().positive().nullish(),
        pollTimeoutMs: z.number().positive().nullish(),

        // Ray 2 specific options
        resolution: z.enum(['540p', '720p', '1080p']).nullish(),

        // Model-specific parameters
        negativePrompt: z.string().nullish(),
        promptOptimizer: z.boolean().nullish(),
      })
      .passthrough(),
  ),
);

interface FalVideoModelConfig extends FalConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

export class FalVideoModel implements VideoModelV3 {
  readonly specificationVersion = 'v3';
  readonly maxVideosPerCall = 1; // FAL video models support 1 video at a time

  get provider(): string {
    return this.config.provider;
  }

  // Normalize model ID by stripping fal-ai/ or fal/ prefix if present
  // This is needed because the queue URL already includes the fal-ai/ prefix
  private get normalizedModelId(): string {
    return this.modelId.replace(/^fal-ai\//, '').replace(/^fal\//, '');
  }

  constructor(
    readonly modelId: FalVideoModelId,
    private readonly config: FalVideoModelConfig,
  ) {}

  async doGenerate(
    options: Parameters<VideoModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<VideoModelV3['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const warnings: SharedV3Warning[] = [];

    // Parse provider options
    const falOptions = (await parseProviderOptions({
      provider: 'fal',
      providerOptions: options.providerOptions,
      schema: falVideoProviderOptionsSchema,
    })) as FalVideoCallOptions | undefined;

    // Build request body
    const body: Record<string, unknown> = {};

    // Add prompt
    if (options.prompt != null) {
      body.prompt = options.prompt;
    }

    // Handle image-to-video: convert first file to image_url
    if (options.files != null && options.files.length > 0) {
      const firstFile = options.files[0];

      if (firstFile.type === 'url') {
        body.image_url = firstFile.url;
      } else {
        body.image_url = convertImageModelFileToDataUri(firstFile);
      }

      if (options.files.length > 1) {
        warnings.push({
          type: 'other',
          message:
            'FAL video models only support a single input image. Additional files are ignored.',
        });
      }
    }

    // Map SDK options to FAL API
    if (options.aspectRatio) {
      body.aspect_ratio = options.aspectRatio;
    }

    if (options.duration) {
      body.duration = `${options.duration}s`;
    }

    if (options.seed) {
      body.seed = options.seed;
    }

    // Add provider-specific options
    if (falOptions != null) {
      const opts = falOptions as FalVideoCallOptions;
      if (opts.loop !== undefined && opts.loop !== null) {
        body.loop = opts.loop;
      }
      if (opts.motionStrength !== undefined && opts.motionStrength !== null) {
        body.motion_strength = opts.motionStrength;
      }
      if (opts.resolution !== undefined && opts.resolution !== null) {
        body.resolution = opts.resolution;
      }
      if (opts.negativePrompt !== undefined && opts.negativePrompt !== null) {
        body.negative_prompt = opts.negativePrompt;
      }
      if (opts.promptOptimizer !== undefined && opts.promptOptimizer !== null) {
        body.prompt_optimizer = opts.promptOptimizer;
      }

      // Pass through any additional options
      for (const [key, value] of Object.entries(opts as any)) {
        if (
          ![
            'loop',
            'motionStrength',
            'pollIntervalMs',
            'pollTimeoutMs',
            'resolution',
            'negativePrompt',
            'promptOptimizer',
          ].includes(key)
        ) {
          body[key] = value;
        }
      }
    }

    // Submit to queue endpoint
    const queueUrl = this.config.url({
      path: `https://queue.fal.run/fal-ai/${this.normalizedModelId}`,
      modelId: this.modelId,
    });

    const { value: queueResponse } = await postJsonToApi({
      url: queueUrl,
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: falFailedResponseHandler,
      successfulResponseHandler:
        createJsonResponseHandler(falJobResponseSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    // Poll for completion
    const responseUrl = queueResponse.response_url;

    if (!responseUrl) {
      throw new AISDKError({
        name: 'FAL_VIDEO_GENERATION_ERROR',
        message: 'No response URL returned from queue endpoint',
      });
    }

    const pollIntervalMs =
      (falOptions as FalVideoCallOptions | undefined)?.pollIntervalMs ?? 2000; // 2 seconds
    const pollTimeoutMs =
      (falOptions as FalVideoCallOptions | undefined)?.pollTimeoutMs ?? 300000; // 5 minutes

    const startTime = Date.now();
    let response;
    let responseHeaders;

    while (true) {
      try {
        // Use the response_url from queue response instead of constructing it
        // This is important for model variants (e.g., luma-dream-machine/ray-2)
        // where FAL returns a different base path for polling
        const statusUrl = this.config.url({
          path: responseUrl,
          modelId: this.modelId,
        });

        const { value: statusResponse, responseHeaders: statusHeaders } =
          await getFromApi({
            url: statusUrl,
            headers: combineHeaders(this.config.headers(), options.headers),
            failedResponseHandler: async ({
              response,
              url,
              requestBodyValues,
            }) => {
              const body = await response.clone().json();

              // Check if it's still in progress
              if (body.detail === 'Request is still in progress') {
                return {
                  value: new Error('Request is still in progress'),
                  rawValue: body,
                  responseHeaders: {},
                };
              }

              // Otherwise, use standard error handler
              return createJsonErrorResponseHandler({
                errorSchema: falErrorDataSchema,
                errorToMessage: data => data.error.message,
              })({ response, url, requestBodyValues });
            },
            successfulResponseHandler: createJsonResponseHandler(
              falVideoResponseSchema,
            ),
            abortSignal: options.abortSignal,
            fetch: this.config.fetch,
          });

        response = statusResponse;
        responseHeaders = statusHeaders;
        break;
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === 'Request is still in progress'
        ) {
          // Continue polling
        } else {
          throw error;
        }
      }

      // Check timeout
      if (Date.now() - startTime > pollTimeoutMs) {
        throw new AISDKError({
          name: 'FAL_VIDEO_GENERATION_TIMEOUT',
          message: `Video generation request timed out after ${pollTimeoutMs}ms`,
        });
      }

      // Wait before next poll
      await delay(pollIntervalMs);

      // Check abort signal
      if (options.abortSignal?.aborted) {
        throw new AISDKError({
          name: 'FAL_VIDEO_GENERATION_ABORTED',
          message: 'Video generation request was aborted',
        });
      }
    }

    // Extract video URL
    const videoUrl = response.video?.url;

    if (!videoUrl || !response.video) {
      throw new AISDKError({
        name: 'FAL_VIDEO_GENERATION_ERROR',
        message: `No video URL in response. Keys: ${Object.keys(response).join(', ')}`,
      });
    }

    // Build provider metadata
    const providerMetadata: any = {
      fal: {
        videos: [
          {
            url: videoUrl,
            width: response.video.width,
            height: response.video.height,
            duration: response.video.duration,
            fps: response.video.fps,
            contentType: response.video.content_type,
          },
        ],
      },
    };

    if (response.seed !== undefined) {
      providerMetadata.fal.seed = response.seed;
    }

    if (response.timings) {
      providerMetadata.fal.timings = response.timings;
    }

    if (response.has_nsfw_concepts !== undefined) {
      providerMetadata.fal.has_nsfw_concepts = response.has_nsfw_concepts;
    }

    if (response.prompt) {
      providerMetadata.fal.prompt = response.prompt;
    }

    return {
      videos: [
        {
          type: 'url',
          url: videoUrl,
          mediaType: response.video.content_type || 'video/mp4',
        },
      ],
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
      providerMetadata,
    };
  }
}

const falJobResponseSchema = z.object({
  request_id: z.string().nullish(),
  response_url: z.string().nullish(),
});

const falVideoResponseSchema = z
  .object({
    video: z
      .object({
        url: z.string(),
        width: z.number().nullish(),
        height: z.number().nullish(),
        duration: z.number().nullish(),
        fps: z.number().nullish(),
        content_type: z.string().nullish(),
      })
      .nullish(),
    seed: z.number().nullish(),
    timings: z
      .object({
        inference: z.number().nullish(),
      })
      .nullish(),
    has_nsfw_concepts: z.array(z.boolean()).nullish(),
    prompt: z.string().nullish(),
  })
  .passthrough();
