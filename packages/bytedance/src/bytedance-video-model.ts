import { AISDKError, VideoModelV3, SharedV3Warning } from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  delay,
  FetchFunction,
  getFromApi,
  lazySchema,
  parseProviderOptions,
  postJsonToApi,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { ByteDanceConfig } from './bytedance-config';
import { ByteDanceVideoModelId } from './bytedance-video-settings';

const byteDanceErrorSchema = z.object({
  error: z.object({
    message: z.string(),
    code: z.string().nullish(),
  }).nullish(),
  message: z.string().nullish(),
});

const byteDanceFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: byteDanceErrorSchema,
  errorToMessage: data => data.error?.message ?? data.message ?? 'Unknown error',
});

export type ByteDanceVideoCallOptions = {
  watermark?: boolean | null;
  generateAudio?: boolean | null;
  pollIntervalMs?: number | null;
  pollTimeoutMs?: number | null;
  [key: string]: any;
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

export class ByteDanceVideoModel implements VideoModelV3 {
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
    options: Parameters<VideoModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<VideoModelV3['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const warnings: SharedV3Warning[] = [];

    // Parse provider options
    const byteDanceOptions = (await parseProviderOptions({
      provider: 'bytedance',
      providerOptions: options.providerOptions,
      schema: byteDanceVideoProviderOptionsSchema,
    })) as ByteDanceVideoCallOptions | undefined;

    // Build content array
    const content: Array<Record<string, unknown>> = [];

    // Add prompt as text content
    if (options.prompt != null) {
      content.push({
        type: 'text',
        text: options.prompt,
      });
    }

    // Handle image-to-video: convert first file to image_url
    if (options.files != null && options.files.length > 0) {
      const firstFile = options.files[0];

      if (firstFile.type === 'url') {
        content.push({
          type: 'image_url',
          image_url: { url: firstFile.url },
        });
      } else {
        // Convert base64/binary to data URI
        const base64Data =
          typeof firstFile.data === 'string'
            ? firstFile.data
            : Buffer.from(firstFile.data).toString('base64');

        content.push({
          type: 'image_url',
          image_url: {
            url: `data:${firstFile.mediaType};base64,${base64Data}`,
          },
        });
      }

      if (options.files.length > 1) {
        warnings.push({
          type: 'other',
          message:
            'ByteDance video models only support a single input image. Additional files are ignored.',
        });
      }
    }

    // Build request body
    const body: Record<string, unknown> = {
      model: this.modelId,
      content,
    };

    // Map SDK options to ByteDance API
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

    // Add provider-specific options
    if (byteDanceOptions != null) {
      if (byteDanceOptions.watermark !== undefined && byteDanceOptions.watermark !== null) {
        body.watermark = byteDanceOptions.watermark;
      }
      if (byteDanceOptions.generateAudio !== undefined && byteDanceOptions.generateAudio !== null) {
        body.generate_audio = byteDanceOptions.generateAudio;
      }

      // Pass through any additional options
      for (const [key, value] of Object.entries(byteDanceOptions as any)) {
        if (
          !['watermark', 'generateAudio', 'pollIntervalMs', 'pollTimeoutMs'].includes(key)
        ) {
          body[key] = value;
        }
      }
    }

    // Submit task
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

    // Poll for completion
    const pollIntervalMs = byteDanceOptions?.pollIntervalMs ?? 3000; // 3 seconds
    const pollTimeoutMs = byteDanceOptions?.pollTimeoutMs ?? 300000; // 5 minutes

    const startTime = Date.now();
    let response;
    let responseHeaders;

    while (true) {
      // Check timeout
      if (Date.now() - startTime > pollTimeoutMs) {
        throw new AISDKError({
          name: 'BYTEDANCE_VIDEO_GENERATION_TIMEOUT',
          message: `Video generation timed out after ${pollTimeoutMs}ms`,
        });
      }

      // Wait before polling
      await delay(pollIntervalMs);

      // Check abort signal
      if (options.abortSignal?.aborted) {
        throw new AISDKError({
          name: 'BYTEDANCE_VIDEO_GENERATION_ABORTED',
          message: 'Video generation request was aborted',
        });
      }

      // Poll status
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

      // Still running, continue polling
    }

    // Extract video URL
    const videoUrl = response.content?.video_url;

    if (!videoUrl) {
      throw new AISDKError({
        name: 'BYTEDANCE_VIDEO_GENERATION_ERROR',
        message: 'No video URL in response',
      });
    }

    // Build provider metadata
    const providerMetadata: any = {
      bytedance: {
        taskId,
        usage: response.usage,
      },
    };

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
      providerMetadata,
    };
  }
}

const byteDanceTaskResponseSchema = z.object({
  id: z.string().nullish(),
});

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
