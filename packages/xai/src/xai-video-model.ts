import {
  AISDKError,
  type Experimental_VideoModelV3,
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
import { xaiVideoModelOptions } from './xai-video-options';
import type { XaiVideoModelId } from './xai-video-settings';

interface XaiVideoModelConfig {
  provider: string;
  baseURL: string | undefined;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
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

  async doGenerate(
    options: Parameters<Experimental_VideoModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<Experimental_VideoModelV3['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const warnings: SharedV3Warning[] = [];

    const xaiOptions = await parseProviderOptions({
      provider: 'xai',
      providerOptions: options.providerOptions,
      schema: xaiVideoModelOptions,
    });

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

    const body: Record<string, unknown> = {
      model: this.modelId,
      prompt: options.prompt,
    };

    if (options.duration != null) {
      body.duration = options.duration;
    }

    if (options.aspectRatio != null) {
      body.aspect_ratio = options.aspectRatio;
    }

    // Resolution: prefer provider option (native format), then map SDK format
    if (xaiOptions?.resolution != null) {
      body.resolution = xaiOptions.resolution;
    } else if (options.resolution != null) {
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

    // Image-to-video: convert SDK image to image_url field
    if (options.image != null) {
      if (options.image.type === 'url') {
        body.image_url = options.image.url;
      } else {
        const base64Data =
          typeof options.image.data === 'string'
            ? options.image.data
            : convertUint8ArrayToBase64(options.image.data);
        body.image_url = `data:${options.image.mediaType};base64,${base64Data}`;
      }
    }

    const baseURL = this.config.baseURL ?? 'https://api.x.ai/v1';

    // Step 1: Create video generation request
    const { value: createResponse } = await postJsonToApi({
      url: `${baseURL}/videos/generations`,
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
    const pollIntervalMs = xaiOptions?.pollIntervalMs ?? 5000;
    const pollTimeoutMs = xaiOptions?.pollTimeoutMs ?? 600000;
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

      if (statusResponse.status === 'done') {
        if (!statusResponse.video?.url) {
          throw new AISDKError({
            name: 'XAI_VIDEO_GENERATION_ERROR',
            message:
              'Video generation completed but no video URL was returned.',
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
              ...(statusResponse.video.duration != null
                ? { duration: statusResponse.video.duration }
                : {}),
            },
          },
        };
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
}

const xaiCreateVideoResponseSchema = z.object({
  request_id: z.string().nullish(),
});

const xaiVideoStatusResponseSchema = z.object({
  status: z.string(),
  video: z
    .object({
      url: z.string(),
      duration: z.number().nullish(),
      respect_moderation: z.boolean().nullish(),
    })
    .nullish(),
  model: z.string().nullish(),
});
