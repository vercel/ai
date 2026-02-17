import {
  AISDKError,
  type Experimental_VideoModelV3,
  type Experimental_VideoModelV3StartResult,
  type Experimental_VideoModelV3StatusResult,
  type SharedV3Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertUint8ArrayToBase64,
  createJsonResponseHandler,
  delay,
  type FetchFunction,
  getFromApi,
  parseProviderOptions,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { xaiFailedResponseHandler } from './xai-error';
import {
  type XaiVideoModelOptions,
  xaiVideoModelOptionsSchema,
} from './xai-video-options';
import type { XaiVideoModelId } from './xai-video-settings';

interface XaiVideoModelConfig {
  provider: string;
  baseURL: string | undefined;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
    pollIntervalMs?: number;
    pollTimeoutMs?: number;
  };
}

const RESOLUTION_MAP: Record<string, string> = {
  '1280x720': '720p',
  '854x480': '480p',
  '640x480': '480p',
};

export class XaiVideoModel implements Experimental_VideoModelV3 {
  readonly specificationVersion = 'v3';
  readonly maxVideosPerCall = 1;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: XaiVideoModelId,
    private config: XaiVideoModelConfig,
  ) {}

  private async buildRequestBody(options: {
    prompt?: string;
    n?: number;
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
    body: Record<string, unknown>;
    warnings: SharedV3Warning[];
    xaiOptions: XaiVideoModelOptions | undefined;
    isEdit: boolean;
  }> {
    const warnings: SharedV3Warning[] = [];

    const xaiOptions = (await parseProviderOptions({
      provider: 'xai',
      providerOptions: options.providerOptions,
      schema: xaiVideoModelOptionsSchema,
    })) as XaiVideoModelOptions | undefined;

    const isEdit = xaiOptions?.videoUrl != null;

    if (options.fps != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'fps',
        details: 'xAI video models do not support custom FPS.',
      });
    }

    if (options.seed != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'seed',
        details: 'xAI video models do not support seed.',
      });
    }

    if (options.n != null && options.n > 1) {
      warnings.push({
        type: 'unsupported',
        feature: 'n',
        details:
          'xAI video models do not support generating multiple videos per call. ' +
          'Only 1 video will be generated.',
      });
    }

    if (isEdit && options.duration != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'duration',
        details: 'xAI video editing does not support custom duration.',
      });
    }

    if (isEdit && options.aspectRatio != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'aspectRatio',
        details: 'xAI video editing does not support custom aspect ratio.',
      });
    }

    if (
      isEdit &&
      (xaiOptions?.resolution != null || options.resolution != null)
    ) {
      warnings.push({
        type: 'unsupported',
        feature: 'resolution',
        details: 'xAI video editing does not support custom resolution.',
      });
    }

    const body: Record<string, unknown> = {
      model: this.modelId,
      prompt: options.prompt,
    };

    if (!isEdit && options.duration != null) {
      body.duration = options.duration;
    }

    if (!isEdit && options.aspectRatio != null) {
      body.aspect_ratio = options.aspectRatio;
    }

    if (!isEdit && xaiOptions?.resolution != null) {
      body.resolution = xaiOptions.resolution;
    } else if (!isEdit && options.resolution != null) {
      const mapped = RESOLUTION_MAP[options.resolution];
      if (mapped != null) {
        body.resolution = mapped;
      } else {
        warnings.push({
          type: 'unsupported',
          feature: 'resolution',
          details:
            `Unrecognized resolution "${options.resolution}". ` +
            'Use providerOptions.xai.resolution with "480p" or "720p" instead.',
        });
      }
    }

    // Video editing: pass source video URL (nested object like image)
    if (xaiOptions?.videoUrl != null) {
      body.video = { url: xaiOptions.videoUrl };
    }

    // Image-to-video: convert SDK image to nested image object
    if (options.image != null) {
      if (options.image.type === 'url') {
        body.image = { url: options.image.url };
      } else {
        const base64Data =
          typeof options.image.data === 'string'
            ? options.image.data
            : convertUint8ArrayToBase64(options.image.data);
        body.image = {
          url: `data:${options.image.mediaType};base64,${base64Data}`,
        };
      }
    }

    if (xaiOptions != null) {
      for (const [key, value] of Object.entries(xaiOptions)) {
        if (!['resolution', 'videoUrl'].includes(key)) {
          body[key] = value;
        }
      }
    }

    return { body, warnings, xaiOptions, isEdit };
  }

  private buildCompletedResult({
    statusResponse,
    requestId,
    warnings,
    currentDate,
    responseHeaders,
  }: {
    statusResponse: {
      video?: { url: string; duration?: number | null } | null;
    };
    requestId: string;
    warnings: SharedV3Warning[];
    currentDate: Date;
    responseHeaders: Record<string, string> | undefined;
  }) {
    if (!statusResponse.video?.url) {
      throw new AISDKError({
        name: 'XAI_VIDEO_GENERATION_ERROR',
        message: 'Video generation completed but no video URL was returned.',
      });
    }

    return {
      videos: [
        {
          type: 'url' as const,
          url: statusResponse.video.url,
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
        xai: {
          requestId,
          videoUrl: statusResponse.video.url,
          ...(statusResponse.video.duration != null
            ? { duration: statusResponse.video.duration }
            : {}),
        },
      },
    };
  }

  async doGenerate(
    options: Parameters<
      NonNullable<Experimental_VideoModelV3['doGenerate']>
    >[0],
  ): Promise<
    Awaited<ReturnType<NonNullable<Experimental_VideoModelV3['doGenerate']>>>
  > {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { body, warnings, xaiOptions, isEdit } =
      await this.buildRequestBody(options);

    const baseURL = this.config.baseURL ?? 'https://api.x.ai/v1';

    // Step 1: Create video generation/edit request
    const { value: createResponse } = await postJsonToApi({
      url: `${baseURL}/videos/${isEdit ? 'edits' : 'generations'}`,
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: xaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        xaiCreateVideoResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const requestId = createResponse.request_id;
    if (!requestId) {
      throw new AISDKError({
        name: 'XAI_VIDEO_GENERATION_ERROR',
        message: `No request_id returned from xAI API. Response: ${JSON.stringify(createResponse)}`,
      });
    }

    // Step 2: Poll for completion
    const pollIntervalMs = this.config._internal?.pollIntervalMs ?? 5000;
    const pollTimeoutMs = this.config._internal?.pollTimeoutMs ?? 600000;
    const startTime = Date.now();
    let responseHeaders: Record<string, string> | undefined;

    while (true) {
      await delay(pollIntervalMs, { abortSignal: options.abortSignal });

      if (Date.now() - startTime > pollTimeoutMs) {
        throw new AISDKError({
          name: 'XAI_VIDEO_GENERATION_TIMEOUT',
          message: `Video generation timed out after ${pollTimeoutMs}ms`,
        });
      }

      const { value: statusResponse, responseHeaders: pollHeaders } =
        await getFromApi({
          url: `${baseURL}/videos/${requestId}`,
          headers: combineHeaders(this.config.headers(), options.headers),
          successfulResponseHandler: createJsonResponseHandler(
            xaiVideoStatusResponseSchema,
          ),
          failedResponseHandler: xaiFailedResponseHandler,
          abortSignal: options.abortSignal,
          fetch: this.config.fetch,
        });

      responseHeaders = pollHeaders;

      if (
        statusResponse.status === 'done' ||
        (statusResponse.status == null && statusResponse.video?.url)
      ) {
        return this.buildCompletedResult({
          statusResponse,
          requestId,
          warnings,
          currentDate,
          responseHeaders,
        });
      }

      if (statusResponse.status === 'expired') {
        throw new AISDKError({
          name: 'XAI_VIDEO_GENERATION_EXPIRED',
          message: 'Video generation request expired.',
        });
      }

      // 'pending' → continue polling
    }
  }

  async doStart(
    options: Parameters<NonNullable<Experimental_VideoModelV3['doStart']>>[0],
  ): Promise<Experimental_VideoModelV3StartResult> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { body, warnings, xaiOptions, isEdit } =
      await this.buildRequestBody(options);

    const baseURL = this.config.baseURL ?? 'https://api.x.ai/v1';

    const { value: createResponse, responseHeaders } = await postJsonToApi({
      url: `${baseURL}/videos/${isEdit ? 'edits' : 'generations'}`,
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: xaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        xaiCreateVideoResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const requestId = createResponse.request_id;
    if (!requestId) {
      throw new AISDKError({
        name: 'XAI_VIDEO_GENERATION_ERROR',
        message: `No request_id returned from xAI API.`,
      });
    }

    return {
      operation: { requestId },
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
    };
  }

  async doStatus(
    options: Parameters<NonNullable<Experimental_VideoModelV3['doStatus']>>[0],
  ): Promise<Experimental_VideoModelV3StatusResult> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { requestId } = options.operation as { requestId: string };
    const baseURL = this.config.baseURL ?? 'https://api.x.ai/v1';

    const { value: statusResponse, responseHeaders } = await getFromApi({
      url: `${baseURL}/videos/${requestId}`,
      headers: combineHeaders(this.config.headers(), options.headers),
      successfulResponseHandler: createJsonResponseHandler(
        xaiVideoStatusResponseSchema,
      ),
      failedResponseHandler: xaiFailedResponseHandler,
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    if (statusResponse.status === 'expired') {
      throw new AISDKError({
        name: 'XAI_VIDEO_GENERATION_EXPIRED',
        message: 'Video generation request expired.',
      });
    }

    if (
      statusResponse.status === 'done' ||
      (statusResponse.status == null && statusResponse.video?.url)
    ) {
      if (!statusResponse.video?.url) {
        throw new AISDKError({
          name: 'XAI_VIDEO_GENERATION_ERROR',
          message: 'Video generation completed but no video URL was returned.',
        });
      }

      return {
        status: 'completed',
        videos: [
          {
            type: 'url',
            url: statusResponse.video.url,
            mediaType: 'video/mp4',
          },
        ],
        warnings: [],
        response: {
          timestamp: currentDate,
          modelId: this.modelId,
          headers: responseHeaders,
        },
        providerMetadata: {
          xai: {
            requestId,
            videoUrl: statusResponse.video.url,
            ...(statusResponse.video.duration != null
              ? { duration: statusResponse.video.duration }
              : {}),
          },
        },
      };
    }

    // pending status
    return {
      status: 'pending',
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
    };
  }
}

const xaiCreateVideoResponseSchema = z.object({
  request_id: z.string().nullish(),
});

const xaiVideoStatusResponseSchema = z.object({
  status: z.string().nullish(),
  video: z
    .object({
      url: z.string(),
      duration: z.number().nullish(),
      respect_moderation: z.boolean().nullish(),
    })
    .nullish(),
  model: z.string().nullish(),
});
