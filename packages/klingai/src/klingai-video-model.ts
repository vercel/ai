import {
  AISDKError,
  type Experimental_VideoModelV3,
  NoSuchModelError,
  type SharedV3Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertUint8ArrayToBase64,
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
import { klingaiFailedResponseHandler } from './klingai-error';
import type { KlingAIVideoModelId } from './klingai-video-settings';

/**
 * Maps known model IDs to their API endpoint paths.
 */
const modelEndpointMap: Record<string, string> = {
  'kling-v2.6-motion-control': '/v1/videos/motion-control',
};

function getEndpointPath(modelId: string): string {
  const endpoint = modelEndpointMap[modelId];
  if (!endpoint) {
    throw new NoSuchModelError({
      modelId,
      modelType: 'videoModel',
    });
  }
  return endpoint;
}

export type KlingAIVideoProviderOptions = {
  /**
   * URL of the reference video. The character actions in the generated video
   * are consistent with the reference video.
   *
   * Supports .mp4/.mov, max 100MB, side lengths 340px–3850px,
   * duration 3–30 seconds (depends on `characterOrientation`).
   */
  videoUrl: string;

  /**
   * Orientation of the characters in the generated video.
   *
   * - `'image'`: Same orientation as the person in the image.
   *   Reference video duration max 10 seconds.
   * - `'video'`: Same orientation as the person in the video.
   *   Reference video duration max 30 seconds.
   */
  characterOrientation: 'image' | 'video';

  /**
   * Video generation mode.
   *
   * - `'std'`: Standard mode — cost-effective.
   * - `'pro'`: Professional mode — higher quality but longer generation time.
   */
  mode: 'std' | 'pro';

  /**
   * Whether to keep the original sound of the reference video.
   * Default: `'yes'`.
   */
  keepOriginalSound?: 'yes' | 'no' | null;

  /**
   * Whether to generate watermarked results simultaneously.
   */
  watermarkEnabled?: boolean | null;

  /**
   * Polling interval in milliseconds for checking task status.
   * Default: 5000 (5 seconds).
   */
  pollIntervalMs?: number | null;

  /**
   * Maximum time in milliseconds to wait for video generation.
   * Default: 600000 (10 minutes).
   */
  pollTimeoutMs?: number | null;

  [key: string]: unknown; // For passthrough
};

const klingaiVideoProviderOptionsSchema = lazySchema(() =>
  zodSchema(
    z
      .object({
        videoUrl: z.string(),
        characterOrientation: z.enum(['image', 'video']),
        mode: z.enum(['std', 'pro']),
        keepOriginalSound: z.enum(['yes', 'no']).nullish(),
        watermarkEnabled: z.boolean().nullish(),
        pollIntervalMs: z.number().positive().nullish(),
        pollTimeoutMs: z.number().positive().nullish(),
      })
      .passthrough(),
  ),
);

interface KlingAIVideoModelConfig {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
}

export class KlingAIVideoModel implements Experimental_VideoModelV3 {
  readonly specificationVersion = 'v3';
  readonly maxVideosPerCall = 1;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: KlingAIVideoModelId,
    private readonly config: KlingAIVideoModelConfig,
  ) {}

  async doGenerate(
    options: Parameters<Experimental_VideoModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<Experimental_VideoModelV3['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const warnings: SharedV3Warning[] = [];

    const klingaiOptions = (await parseProviderOptions({
      provider: 'klingai',
      providerOptions: options.providerOptions,
      schema: klingaiVideoProviderOptionsSchema,
    })) as KlingAIVideoProviderOptions | undefined;

    if (!klingaiOptions) {
      throw new AISDKError({
        name: 'KLINGAI_VIDEO_MISSING_OPTIONS',
        message:
          'KlingAI requires providerOptions.klingai with videoUrl, characterOrientation, and mode.',
      });
    }

    // Build the request body for the KlingAI Motion Control endpoint
    const body: Record<string, unknown> = {
      video_url: klingaiOptions.videoUrl,
      character_orientation: klingaiOptions.characterOrientation,
      mode: klingaiOptions.mode,
    };

    // Map standard SDK prompt option
    if (options.prompt != null) {
      body.prompt = options.prompt;
    }

    // Map standard SDK image option to KlingAI's image_url
    if (options.image != null) {
      if (options.image.type === 'url') {
        body.image_url = options.image.url;
      } else {
        // KlingAI accepts raw base64 without the data: prefix
        const base64Data =
          typeof options.image.data === 'string'
            ? options.image.data
            : convertUint8ArrayToBase64(options.image.data);
        body.image_url = base64Data;
      }
    }

    // Map KlingAI-specific options
    if (
      klingaiOptions.keepOriginalSound !== undefined &&
      klingaiOptions.keepOriginalSound !== null
    ) {
      body.keep_original_sound = klingaiOptions.keepOriginalSound;
    }

    if (
      klingaiOptions.watermarkEnabled !== undefined &&
      klingaiOptions.watermarkEnabled !== null
    ) {
      body.watermark_info = { enabled: klingaiOptions.watermarkEnabled };
    }

    // Pass through any additional provider-specific options
    for (const [key, value] of Object.entries(klingaiOptions)) {
      if (
        ![
          'videoUrl',
          'characterOrientation',
          'mode',
          'keepOriginalSound',
          'watermarkEnabled',
          'pollIntervalMs',
          'pollTimeoutMs',
        ].includes(key)
      ) {
        body[key] = value;
      }
    }

    // Warn about unsupported standard options
    if (options.aspectRatio) {
      warnings.push({
        type: 'unsupported',
        feature: 'aspectRatio',
        details:
          'KlingAI Motion Control does not support aspectRatio. ' +
          'The output dimensions are determined by the reference image/video.',
      });
    }

    if (options.resolution) {
      warnings.push({
        type: 'unsupported',
        feature: 'resolution',
        details:
          'KlingAI Motion Control does not support resolution. ' +
          'The output resolution is determined by the reference image/video.',
      });
    }

    if (options.seed) {
      warnings.push({
        type: 'unsupported',
        feature: 'seed',
        details:
          'KlingAI Motion Control does not support seed for deterministic generation.',
      });
    }

    if (options.duration) {
      warnings.push({
        type: 'unsupported',
        feature: 'duration',
        details:
          'KlingAI Motion Control does not support custom duration. ' +
          'The output duration matches the reference video duration.',
      });
    }

    if (options.fps) {
      warnings.push({
        type: 'unsupported',
        feature: 'fps',
        details: 'KlingAI Motion Control does not support custom FPS.',
      });
    }

    if (options.n != null && options.n > 1) {
      warnings.push({
        type: 'unsupported',
        feature: 'n',
        details:
          'KlingAI Motion Control does not support generating multiple videos per call. ' +
          'Only 1 video will be generated.',
      });
    }

    // Resolve the API endpoint path for this model
    const endpointPath = getEndpointPath(this.modelId);

    // Step 1: Create the task
    const { value: createResponse, responseHeaders: createHeaders } =
      await postJsonToApi({
        url: `${this.config.baseURL}${endpointPath}`,
        headers: combineHeaders(
          await resolve(this.config.headers),
          options.headers,
        ),
        body,
        successfulResponseHandler: createJsonResponseHandler(
          klingaiCreateTaskSchema,
        ),
        failedResponseHandler: klingaiFailedResponseHandler,
        abortSignal: options.abortSignal,
        fetch: this.config.fetch,
      });

    const taskId = createResponse.data?.task_id;
    if (!taskId) {
      throw new AISDKError({
        name: 'KLINGAI_VIDEO_GENERATION_ERROR',
        message: `No task_id returned from KlingAI API. Response: ${JSON.stringify(createResponse)}`,
      });
    }

    // Step 2: Poll for task completion
    const pollIntervalMs = klingaiOptions.pollIntervalMs ?? 5000; // 5 seconds
    const pollTimeoutMs = klingaiOptions.pollTimeoutMs ?? 600000; // 10 minutes
    const startTime = Date.now();
    let finalResponse: KlingAITaskResponse | undefined;
    let responseHeaders: Record<string, string> | undefined = createHeaders;

    while (true) {
      await delay(pollIntervalMs, { abortSignal: options.abortSignal });

      if (Date.now() - startTime > pollTimeoutMs) {
        throw new AISDKError({
          name: 'KLINGAI_VIDEO_GENERATION_TIMEOUT',
          message: `Video generation timed out after ${pollTimeoutMs}ms`,
        });
      }

      const { value: statusResponse, responseHeaders: pollHeaders } =
        await getFromApi({
          url: `${this.config.baseURL}${endpointPath}/${taskId}`,
          headers: combineHeaders(
            await resolve(this.config.headers),
            options.headers,
          ),
          successfulResponseHandler: createJsonResponseHandler(
            klingaiTaskStatusSchema,
          ),
          failedResponseHandler: klingaiFailedResponseHandler,
          abortSignal: options.abortSignal,
          fetch: this.config.fetch,
        });

      responseHeaders = pollHeaders;
      const taskStatus = statusResponse.data?.task_status;

      if (taskStatus === 'succeed') {
        finalResponse = statusResponse;
        break;
      }

      if (taskStatus === 'failed') {
        throw new AISDKError({
          name: 'KLINGAI_VIDEO_GENERATION_FAILED',
          message: `Video generation failed: ${statusResponse.data?.task_status_msg ?? 'Unknown error'}`,
        });
      }

      // Continue polling for 'submitted' and 'processing' statuses
    }

    if (!finalResponse?.data?.task_result?.videos?.length) {
      throw new AISDKError({
        name: 'KLINGAI_VIDEO_GENERATION_ERROR',
        message: `No videos in response. Response: ${JSON.stringify(finalResponse)}`,
      });
    }

    const videos: Array<{ type: 'url'; url: string; mediaType: string }> = [];
    const videoMetadata: Array<{
      id: string;
      url: string;
      watermarkUrl?: string;
      duration?: string;
    }> = [];

    for (const video of finalResponse.data.task_result.videos) {
      if (video.url) {
        videos.push({
          type: 'url',
          url: video.url,
          mediaType: 'video/mp4',
        });
        videoMetadata.push({
          id: video.id ?? '',
          url: video.url,
          ...(video.watermark_url ? { watermarkUrl: video.watermark_url } : {}),
          ...(video.duration ? { duration: video.duration } : {}),
        });
      }
    }

    if (videos.length === 0) {
      throw new AISDKError({
        name: 'KLINGAI_VIDEO_GENERATION_ERROR',
        message: 'No valid video URLs in response',
      });
    }

    return {
      videos,
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
      providerMetadata: {
        klingai: {
          taskId,
          videos: videoMetadata,
        },
      },
    };
  }
}

// Response schema for task creation (POST)
const klingaiCreateTaskSchema = z.object({
  code: z.number(),
  message: z.string(),
  request_id: z.string().nullish(),
  data: z
    .object({
      task_id: z.string(),
      task_status: z.string().nullish(),
      task_info: z
        .object({
          external_task_id: z.string().nullish(),
        })
        .nullish(),
      created_at: z.number().nullish(),
      updated_at: z.number().nullish(),
    })
    .nullish(),
});

// Response schema for task status query (GET)
const klingaiTaskStatusSchema = z.object({
  code: z.number(),
  message: z.string(),
  request_id: z.string().nullish(),
  data: z
    .object({
      task_id: z.string(),
      task_status: z.string(),
      task_status_msg: z.string().nullish(),
      task_info: z
        .object({
          external_task_id: z.string().nullish(),
        })
        .nullish(),
      watermark_info: z
        .object({
          enabled: z.boolean().nullish(),
        })
        .nullish(),
      final_unit_deduction: z.string().nullish(),
      created_at: z.number().nullish(),
      updated_at: z.number().nullish(),
      task_result: z
        .object({
          videos: z
            .array(
              z.object({
                id: z.string().nullish(),
                url: z.string().nullish(),
                watermark_url: z.string().nullish(),
                duration: z.string().nullish(),
              }),
            )
            .nullish(),
        })
        .nullish(),
    })
    .nullish(),
});

type KlingAITaskResponse = z.infer<typeof klingaiTaskStatusSchema>;
