import {
  AISDKError,
  type Experimental_VideoModelV4,
  type SharedV4Warning,
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
  };
}

const RESOLUTION_MAP: Record<string, string> = {
  '1280x720': '720p',
  '854x480': '480p',
  '640x480': '480p',
};

export class XaiVideoModel implements Experimental_VideoModelV4 {
  readonly specificationVersion = 'v4';
  readonly maxVideosPerCall = 1;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: XaiVideoModelId,
    private config: XaiVideoModelConfig,
  ) {}

  async doGenerate(
    options: Parameters<Experimental_VideoModelV4['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<Experimental_VideoModelV4['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const warnings: SharedV4Warning[] = [];

    const xaiOptions = (await parseProviderOptions({
      provider: 'xai',
      providerOptions: options.providerOptions,
      schema: xaiVideoModelOptionsSchema,
    })) as XaiVideoModelOptions | undefined;

    const isEdit = xaiOptions?.videoUrl != null;
    const isExtension = xaiOptions?.extensionVideoUrl != null;
    const isR2V =
      xaiOptions?.referenceImages != null &&
      xaiOptions.referenceImages.length > 0;

    // Conflict validation
    if (isEdit && isExtension) {
      throw new AISDKError({
        name: 'XAI_VIDEO_GENERATION_ERROR',
        message:
          'Cannot combine videoUrl (edit mode) with extensionVideoUrl (extension mode). Use one or the other.',
      });
    }

    if (isR2V && options.image != null) {
      throw new AISDKError({
        name: 'XAI_VIDEO_GENERATION_ERROR',
        message:
          'Cannot combine referenceImages (R2V mode) with image (I2V mode). Use one or the other.',
      });
    }

    if (isR2V && isEdit) {
      throw new AISDKError({
        name: 'XAI_VIDEO_GENERATION_ERROR',
        message:
          'Cannot combine referenceImages (R2V mode) with videoUrl (edit mode). Use one or the other.',
      });
    }

    if (isR2V && isExtension) {
      throw new AISDKError({
        name: 'XAI_VIDEO_GENERATION_ERROR',
        message:
          'Cannot combine referenceImages (R2V mode) with extensionVideoUrl (extension mode). Use one or the other.',
      });
    }

    if (isExtension && options.image != null) {
      throw new AISDKError({
        name: 'XAI_VIDEO_GENERATION_ERROR',
        message:
          'Cannot combine extensionVideoUrl (extension mode) with image (I2V mode). Use one or the other.',
      });
    }

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

    if (isExtension && options.aspectRatio != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'aspectRatio',
        details: 'xAI video extension does not support custom aspect ratio.',
      });
    }

    if (
      isExtension &&
      (xaiOptions?.resolution != null || options.resolution != null)
    ) {
      warnings.push({
        type: 'unsupported',
        feature: 'resolution',
        details: 'xAI video extension does not support custom resolution.',
      });
    }

    const body: Record<string, unknown> = {
      model: this.modelId,
      prompt: options.prompt,
    };

    // Duration: supported for generation, extension, and R2V — not edit
    if (!isEdit && options.duration != null) {
      body.duration = options.duration;
    }

    // Aspect ratio: supported for generation and R2V — not edit or extension
    if (!isEdit && !isExtension && options.aspectRatio != null) {
      body.aspect_ratio = options.aspectRatio;
    }

    // Resolution: supported for generation and R2V — not edit or extension
    if (!isEdit && !isExtension && xaiOptions?.resolution != null) {
      body.resolution = xaiOptions.resolution;
    } else if (!isEdit && !isExtension && options.resolution != null) {
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

    // Video editing: pass source video URL
    if (xaiOptions?.videoUrl != null) {
      body.video = { url: xaiOptions.videoUrl };
    }

    // Video extension: pass source video URL
    if (xaiOptions?.extensionVideoUrl != null) {
      body.video = { url: xaiOptions.extensionVideoUrl };
    }

    // Reference-to-video: pass reference images
    if (isR2V) {
      body.reference_images = xaiOptions!.referenceImages!.map(url => ({
        url,
      }));
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
        if (
          ![
            'pollIntervalMs',
            'pollTimeoutMs',
            'resolution',
            'videoUrl',
            'extensionVideoUrl',
            'referenceImages',
          ].includes(key)
        ) {
          body[key] = value;
        }
      }
    }

    const baseURL = this.config.baseURL ?? 'https://api.x.ai/v1';

    // Determine endpoint based on mode
    const endpoint = isEdit
      ? 'edits'
      : isExtension
        ? 'extensions'
        : 'generations';

    // Step 1: Create video generation/edit/extension request
    const { value: createResponse } = await postJsonToApi({
      url: `${baseURL}/videos/${endpoint}`,
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

      // Extension API nests video/usage inside a `response` object;
      // generation/edit APIs have them at the top level. Normalize here.
      const videoData = statusResponse.video ?? statusResponse.response?.video;
      const usageData = statusResponse.usage ?? statusResponse.response?.usage;

      if (
        statusResponse.status === 'done' ||
        (statusResponse.status == null && videoData?.url)
      ) {
        if (videoData?.respect_moderation === false) {
          throw new AISDKError({
            name: 'XAI_VIDEO_MODERATION_ERROR',
            message:
              'Video generation was blocked due to a content policy violation.',
          });
        }

        if (!videoData?.url) {
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
              url: videoData.url,
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
              videoUrl: videoData.url,
              ...(videoData.duration != null
                ? { duration: videoData.duration }
                : {}),
              ...(usageData?.cost_in_usd_ticks != null
                ? { costInUsdTicks: usageData.cost_in_usd_ticks }
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

const xaiVideoDataSchema = z.object({
  url: z.string(),
  duration: z.number().nullish(),
  respect_moderation: z.boolean().nullish(),
});

const xaiUsageSchema = z.object({
  cost_in_usd_ticks: z.number().nullish(),
});

const xaiVideoStatusResponseSchema = z.object({
  status: z.string().nullish(),
  // Generation/edit APIs: video and usage at top level
  video: xaiVideoDataSchema.nullish(),
  model: z.string().nullish(),
  usage: xaiUsageSchema.nullish(),
  // Extension API: video and usage nested under response
  response: z
    .object({
      video: xaiVideoDataSchema.nullish(),
      model: z.string().nullish(),
      usage: xaiUsageSchema.nullish(),
    })
    .nullish(),
});
