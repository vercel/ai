import {
  AISDKError,
  type Experimental_VideoModelV3,
  type SharedV3Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertImageModelFileToDataUri,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  delay,
  getFromApi,
  lazySchema,
  parseProviderOptions,
  postJsonToApi,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { ByteDanceConfig } from './bytedance-config';
import type { ByteDanceVideoModelId } from './bytedance-video-settings';

export type ByteDanceVideoProviderOptions = {
  watermark?: boolean | null;
  generateAudio?: boolean | null;
  pollIntervalMs?: number | null;
  pollTimeoutMs?: number | null;
  [key: string]: unknown;
};

export const byteDanceVideoProviderOptionsSchema = lazySchema(() =>
  zodSchema(
    z
      .object({
        watermark: z.boolean().nullish(),
        generateAudio: z.boolean().nullish(),
        pollIntervalMs: z.number().positive().nullish(),
        pollTimeoutMs: z.number().positive().nullish(),
      })
      .passthrough(),
  ),
);

interface ByteDanceVideoModelConfig extends ByteDanceConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

export class ByteDanceVideoModel implements Experimental_VideoModelV3 {
  readonly specificationVersion = 'v3';
  readonly maxVideosPerCall = 1;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: ByteDanceVideoModelId,
    private readonly config: ByteDanceVideoModelConfig,
  ) {}

  async doGenerate(
    options: Parameters<Experimental_VideoModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<Experimental_VideoModelV3['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const warnings: SharedV3Warning[] = [];

    const byteDanceOptions = (await parseProviderOptions({
      provider: 'bytedance',
      providerOptions: options.providerOptions,
      schema: byteDanceVideoProviderOptionsSchema,
    })) as ByteDanceVideoProviderOptions | undefined;

    const content: Array<Record<string, unknown>> = [];

    if (options.prompt != null) {
      content.push({
        type: 'text',
        text: options.prompt,
      });
    }

    if (options.image != null) {
      content.push({
        type: 'image_url',
        image_url: { url: convertImageModelFileToDataUri(options.image) },
      });
    }

    const body: Record<string, unknown> = {
      model: this.modelId,
      content,
    };

    if (options.aspectRatio) {
      body.ratio = options.aspectRatio;
    }

    if (options.duration) {
      body.duration = options.duration;
    }

    if (options.seed) {
      body.seed = options.seed;
    }

    if (options.resolution) {
      body.resolution = options.resolution;
    }

    if (byteDanceOptions != null) {
      if (
        byteDanceOptions.watermark !== undefined &&
        byteDanceOptions.watermark !== null
      ) {
        body.watermark = byteDanceOptions.watermark;
      }
      if (
        byteDanceOptions.generateAudio !== undefined &&
        byteDanceOptions.generateAudio !== null
      ) {
        body.generate_audio = byteDanceOptions.generateAudio;
      }

      for (const [key, value] of Object.entries(byteDanceOptions)) {
        if (
          ![
            'watermark',
            'generateAudio',
            'pollIntervalMs',
            'pollTimeoutMs',
          ].includes(key)
        ) {
          body[key] = value;
        }
      }
    }

    const createUrl = `${this.config.baseURL}/contents/generations/tasks`;

    const { value: createResponse } = await postJsonToApi({
      url: createUrl,
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: byteDanceFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        byteDanceTaskResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const taskId = createResponse.id;

    if (!taskId) {
      throw new AISDKError({
        name: 'BYTEDANCE_VIDEO_GENERATION_ERROR',
        message: 'No task ID returned from API',
      });
    }

    const pollIntervalMs = byteDanceOptions?.pollIntervalMs ?? 3000;
    const pollTimeoutMs = byteDanceOptions?.pollTimeoutMs ?? 300000;

    const startTime = Date.now();
    let response: ByteDanceResponse;
    let responseHeaders: Record<string, string> | undefined;

    while (true) {
      const statusUrl = `${this.config.baseURL}/contents/generations/tasks/${taskId}`;

      const { value: statusResponse, responseHeaders: statusHeaders } =
        await getFromApi({
          url: statusUrl,
          headers: combineHeaders(this.config.headers(), options.headers),
          failedResponseHandler: byteDanceFailedResponseHandler,
          successfulResponseHandler: createJsonResponseHandler(
            byteDanceStatusResponseSchema,
          ),
          abortSignal: options.abortSignal,
          fetch: this.config.fetch,
        });

      if (statusResponse.status === 'succeeded') {
        response = statusResponse;
        responseHeaders = statusHeaders;
        break;
      }

      if (statusResponse.status === 'failed') {
        throw new AISDKError({
          name: 'BYTEDANCE_VIDEO_GENERATION_FAILED',
          message: `Video generation failed: ${JSON.stringify(statusResponse)}`,
        });
      }

      if (Date.now() - startTime > pollTimeoutMs) {
        throw new AISDKError({
          name: 'BYTEDANCE_VIDEO_GENERATION_TIMEOUT',
          message: `Video generation timed out after ${pollTimeoutMs}ms`,
        });
      }

      await delay(pollIntervalMs);

      if (options.abortSignal?.aborted) {
        throw new AISDKError({
          name: 'BYTEDANCE_VIDEO_GENERATION_ABORTED',
          message: 'Video generation request was aborted',
        });
      }
    }

    const videoUrl = response.content?.video_url;
    if (!videoUrl) {
      throw new AISDKError({
        name: 'BYTEDANCE_VIDEO_GENERATION_ERROR',
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
        bytedance: {
          taskId,
          usage: response.usage,
        },
      },
    };
  }
}

const byteDanceTaskResponseSchema = z.object({
  id: z.string().nullish(),
});

type ByteDanceResponse = z.infer<typeof byteDanceStatusResponseSchema>;

const byteDanceStatusResponseSchema = z.object({
  id: z.string().nullish(),
  model: z.string().nullish(),
  status: z.string(),
  content: z
    .object({
      video_url: z.string().nullish(),
    })
    .nullish(),
  usage: z
    .object({
      completion_tokens: z.number().nullish(),
    })
    .nullish(),
});

const byteDanceErrorSchema = z.object({
  error: z
    .object({
      message: z.string(),
      code: z.string().nullish(),
    })
    .nullish(),
  message: z.string().nullish(),
});

const byteDanceFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: byteDanceErrorSchema,
  errorToMessage: data =>
    data.error?.message ?? data.message ?? 'Unknown error',
});
