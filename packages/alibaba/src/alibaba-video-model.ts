import {
  AISDKError,
  type Experimental_VideoModelV3,
  type SharedV3Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertUint8ArrayToBase64,
  createJsonErrorResponseHandler,
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
import type { AlibabaVideoModelId } from './alibaba-video-settings';

export type AlibabaVideoModelOptions = {
  /** Negative prompt to specify what to avoid (max 500 chars). */
  negativePrompt?: string | null;
  /** URL to audio file for audio-video sync (WAV/MP3, 3-30s, max 15MB). */
  audioUrl?: string | null;
  /** Enable prompt extension/rewriting for better generation. Defaults to true. */
  promptExtend?: boolean | null;
  /** Shot type: 'single' for single-shot or 'multi' for multi-shot narrative. */
  shotType?: 'single' | 'multi' | null;
  /** Whether to add watermark to generated video. Defaults to false. */
  watermark?: boolean | null;
  /** Enable audio generation (for I2V/R2V models). */
  audio?: boolean | null;
  /**
   * Reference URLs for reference-to-video mode.
   * Array of URLs to images (0-5) and/or videos (0-3), max 5 total.
   * Use character identifiers (character1, character2) in prompts to reference them.
   */
  referenceUrls?: string[] | null;
  /** Polling interval in milliseconds. Defaults to 5000 (5 seconds). */
  pollIntervalMs?: number | null;
  /** Maximum wait time in milliseconds for video generation. Defaults to 600000 (10 minutes). */
  pollTimeoutMs?: number | null;
  [key: string]: unknown;
};

const alibabaVideoModelOptionsSchema = lazySchema(() =>
  zodSchema(
    z
      .object({
        negativePrompt: z.string().nullish(),
        audioUrl: z.string().nullish(),
        promptExtend: z.boolean().nullish(),
        shotType: z.enum(['single', 'multi']).nullish(),
        watermark: z.boolean().nullish(),
        audio: z.boolean().nullish(),
        referenceUrls: z.array(z.string()).nullish(),
        pollIntervalMs: z.number().positive().nullish(),
        pollTimeoutMs: z.number().positive().nullish(),
      })
      .passthrough(),
  ),
);

interface AlibabaVideoModelConfig {
  provider: string;
  baseURL: string;
  headers: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
}

// DashScope native API error format (different from OpenAI-compatible endpoint)
const alibabaVideoErrorSchema = z.object({
  code: z.string().nullish(),
  message: z.string(),
  request_id: z.string().nullish(),
});

const alibabaVideoFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: alibabaVideoErrorSchema,
  errorToMessage: data => data.message,
});

const alibabaVideoCreateTaskSchema = z.object({
  output: z
    .object({
      task_status: z.string(),
      task_id: z.string(),
    })
    .nullish(),
  request_id: z.string().nullish(),
});

const alibabaVideoTaskStatusSchema = z.object({
  output: z
    .object({
      task_id: z.string(),
      task_status: z.string(),
      video_url: z.string().nullish(),
      submit_time: z.string().nullish(),
      scheduled_time: z.string().nullish(),
      end_time: z.string().nullish(),
      orig_prompt: z.string().nullish(),
      actual_prompt: z.string().nullish(),
      code: z.string().nullish(),
      message: z.string().nullish(),
    })
    .nullish(),
  usage: z
    .object({
      duration: z.number().nullish(),
      output_video_duration: z.number().nullish(),
      SR: z.number().nullish(),
      size: z.string().nullish(),
    })
    .nullish(),
  request_id: z.string().nullish(),
});

type AlibabaVideoTaskStatusResponse = z.infer<
  typeof alibabaVideoTaskStatusSchema
>;

function detectMode(modelId: string): 't2v' | 'i2v' | 'r2v' {
  if (modelId.includes('-i2v')) return 'i2v';
  if (modelId.includes('-r2v')) return 'r2v';
  return 't2v';
}

export class AlibabaVideoModel implements Experimental_VideoModelV3 {
  readonly specificationVersion = 'v3';
  readonly maxVideosPerCall = 1;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: AlibabaVideoModelId,
    private readonly config: AlibabaVideoModelConfig,
  ) {}

  async doGenerate(
    options: Parameters<Experimental_VideoModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<Experimental_VideoModelV3['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const warnings: SharedV3Warning[] = [];
    const mode = detectMode(this.modelId);

    const alibabaOptions = (await parseProviderOptions({
      provider: 'alibaba',
      providerOptions: options.providerOptions,
      schema: alibabaVideoModelOptionsSchema,
    })) as AlibabaVideoModelOptions | undefined;

    // Build input object
    const input: Record<string, unknown> = {};

    if (options.prompt != null) {
      input.prompt = options.prompt;
    }

    if (alibabaOptions?.negativePrompt != null) {
      input.negative_prompt = alibabaOptions.negativePrompt;
    }

    if (alibabaOptions?.audioUrl != null) {
      input.audio_url = alibabaOptions.audioUrl;
    }

    // Handle image input for I2V mode
    if (mode === 'i2v' && options.image != null) {
      if (options.image.type === 'url') {
        input.img_url = options.image.url;
      } else {
        const base64Data =
          typeof options.image.data === 'string'
            ? options.image.data
            : convertUint8ArrayToBase64(options.image.data);
        input.img_url = base64Data;
      }
    }

    // Handle reference URLs for R2V mode
    if (mode === 'r2v' && alibabaOptions?.referenceUrls != null) {
      input.reference_urls = alibabaOptions.referenceUrls;
    }

    // Build parameters object
    const parameters: Record<string, unknown> = {};

    if (options.duration != null) {
      parameters.duration = options.duration;
    }

    if (options.seed != null) {
      parameters.seed = options.seed;
    }

    // Resolution / Size mapping
    if (options.resolution != null) {
      if (mode === 'i2v') {
        // I2V uses "720P" / "1080P" format
        const resolutionMap: Record<string, string> = {
          '1280x720': '720P',
          '720x1280': '720P',
          '960x960': '720P',
          '1088x832': '720P',
          '832x1088': '720P',
          '1920x1080': '1080P',
          '1080x1920': '1080P',
          '1440x1440': '1080P',
          '1632x1248': '1080P',
          '1248x1632': '1080P',
          '832x480': '480P',
          '480x832': '480P',
          '624x624': '480P',
        };
        parameters.resolution =
          resolutionMap[options.resolution] || options.resolution;
      } else {
        // T2V and R2V use "WIDTH*HEIGHT" format for the size parameter
        // Convert "WIDTHxHEIGHT" (SDK standard) to "WIDTH*HEIGHT" (Alibaba API)
        parameters.size = options.resolution.replace('x', '*');
      }
    }

    // Provider-specific parameters
    if (alibabaOptions?.promptExtend != null) {
      parameters.prompt_extend = alibabaOptions.promptExtend;
    }
    if (alibabaOptions?.shotType != null) {
      parameters.shot_type = alibabaOptions.shotType;
    }
    if (alibabaOptions?.watermark != null) {
      parameters.watermark = alibabaOptions.watermark;
    }
    if (alibabaOptions?.audio != null) {
      parameters.audio = alibabaOptions.audio;
    }

    // Warn about unsupported standard options
    if (options.aspectRatio) {
      warnings.push({
        type: 'unsupported',
        feature: 'aspectRatio',
        details:
          'Alibaba video models use explicit size/resolution dimensions. Use the resolution option or providerOptions.alibaba for size control.',
      });
    }
    if (options.fps) {
      warnings.push({
        type: 'unsupported',
        feature: 'fps',
        details: 'Alibaba video models do not support custom FPS.',
      });
    }
    if (options.n != null && options.n > 1) {
      warnings.push({
        type: 'unsupported',
        feature: 'n',
        details:
          'Alibaba video models only support generating 1 video per call.',
      });
    }

    // Step 1: Create task
    const { value: createResponse } = await postJsonToApi({
      url: `${this.config.baseURL}/api/v1/services/aigc/video-generation/video-synthesis`,
      headers: combineHeaders(
        await resolve(this.config.headers),
        options.headers,
        {
          'X-DashScope-Async': 'enable',
        },
      ),
      body: {
        model: this.modelId,
        input,
        parameters,
      },
      successfulResponseHandler: createJsonResponseHandler(
        alibabaVideoCreateTaskSchema,
      ),
      failedResponseHandler: alibabaVideoFailedResponseHandler,
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const taskId = createResponse.output?.task_id;
    if (!taskId) {
      throw new AISDKError({
        name: 'ALIBABA_VIDEO_GENERATION_ERROR',
        message: `No task_id returned from Alibaba API. Response: ${JSON.stringify(createResponse)}`,
      });
    }

    // Step 2: Poll for task completion
    const pollIntervalMs = alibabaOptions?.pollIntervalMs ?? 5000;
    const pollTimeoutMs = alibabaOptions?.pollTimeoutMs ?? 600000;
    const startTime = Date.now();
    let finalResponse: AlibabaVideoTaskStatusResponse | undefined;
    let responseHeaders: Record<string, string> | undefined;

    while (true) {
      await delay(pollIntervalMs, { abortSignal: options.abortSignal });

      if (Date.now() - startTime > pollTimeoutMs) {
        throw new AISDKError({
          name: 'ALIBABA_VIDEO_GENERATION_TIMEOUT',
          message: `Video generation timed out after ${pollTimeoutMs}ms`,
        });
      }

      const { value: statusResponse, responseHeaders: pollHeaders } =
        await getFromApi({
          url: `${this.config.baseURL}/api/v1/tasks/${taskId}`,
          headers: combineHeaders(
            await resolve(this.config.headers),
            options.headers,
          ),
          successfulResponseHandler: createJsonResponseHandler(
            alibabaVideoTaskStatusSchema,
          ),
          failedResponseHandler: alibabaVideoFailedResponseHandler,
          abortSignal: options.abortSignal,
          fetch: this.config.fetch,
        });

      responseHeaders = pollHeaders;
      const taskStatus = statusResponse.output?.task_status;

      if (taskStatus === 'SUCCEEDED') {
        finalResponse = statusResponse;
        break;
      }

      if (taskStatus === 'FAILED' || taskStatus === 'CANCELED') {
        throw new AISDKError({
          name: 'ALIBABA_VIDEO_GENERATION_FAILED',
          message: `Video generation ${taskStatus.toLowerCase()}. Task ID: ${taskId}. ${statusResponse.output?.message ?? ''}`,
        });
      }

      // Continue polling for PENDING, RUNNING, UNKNOWN statuses
    }

    const videoUrl = finalResponse?.output?.video_url;
    if (!videoUrl) {
      throw new AISDKError({
        name: 'ALIBABA_VIDEO_GENERATION_ERROR',
        message: `No video URL in response. Task ID: ${taskId}`,
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
        alibaba: {
          taskId,
          videoUrl,
          ...(finalResponse?.output?.actual_prompt
            ? { actualPrompt: finalResponse.output.actual_prompt }
            : {}),
          ...(finalResponse?.usage
            ? {
                usage: {
                  duration: finalResponse.usage.duration,
                  outputVideoDuration:
                    finalResponse.usage.output_video_duration,
                  resolution: finalResponse.usage.SR,
                  size: finalResponse.usage.size,
                },
              }
            : {}),
        },
      },
    };
  }
}
