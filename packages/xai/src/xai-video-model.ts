import {
  AISDKError,
  type Experimental_VideoModelV4 as VideoModelV4,
  type Experimental_VideoModelV4OperationStartResult as VideoModelV4OperationStartResult,
  type Experimental_VideoModelV4OperationStatusResult as VideoModelV4OperationStatusResult,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertUint8ArrayToBase64,
  createJsonResponseHandler,
  type FetchFunction,
  getFromApi,
  parseProviderOptions,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { xaiFailedResponseHandler } from './xai-error';
import {
  xaiVideoModelOptionsSchema,
  type XaiParsedVideoModelOptions,
} from './xai-video-model-options';
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

function resolveVideoMode(
  options: XaiParsedVideoModelOptions | undefined,
): XaiParsedVideoModelOptions['mode'] | undefined {
  if (options?.mode != null) {
    return options.mode;
  }

  if (options?.videoUrl != null) {
    return 'edit-video';
  }

  if (
    options?.referenceImageUrls != null &&
    options.referenceImageUrls.length > 0
  ) {
    return 'reference-to-video';
  }

  return undefined;
}

export class XaiVideoModel implements VideoModelV4 {
  readonly specificationVersion = 'v4';
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
    warnings: SharedV4Warning[];
    xaiOptions: XaiParsedVideoModelOptions | undefined;
    isEdit: boolean;
    isExtension: boolean;
    hasReferenceImages: boolean;
    effectiveMode: XaiParsedVideoModelOptions['mode'] | undefined;
  }> {
    const warnings: SharedV4Warning[] = [];

    const xaiOptions = (await parseProviderOptions({
      provider: 'xai',
      providerOptions: options.providerOptions,
      schema: xaiVideoModelOptionsSchema,
    })) as XaiParsedVideoModelOptions | undefined;

    const effectiveMode = resolveVideoMode(xaiOptions);

    const isEdit = effectiveMode === 'edit-video';
    const isExtension = effectiveMode === 'extend-video';
    const hasReferenceImages = effectiveMode === 'reference-to-video';

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

    // Edit mode: duration, aspectRatio, resolution not supported
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

    // Extension mode: aspectRatio and resolution not supported
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

    const allowDuration = !isEdit;
    const allowAspectRatio = !isEdit && !isExtension;
    const allowResolution = !isEdit && !isExtension;

    if (allowDuration && options.duration != null) {
      body.duration = options.duration;
    }

    if (allowAspectRatio && options.aspectRatio != null) {
      body.aspect_ratio = options.aspectRatio;
    }

    if (allowResolution && xaiOptions?.resolution != null) {
      body.resolution = xaiOptions.resolution;
    } else if (allowResolution && options.resolution != null) {
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

    // Video editing: pass source video URL (nested object)
    if (isEdit) {
      body.video = { url: xaiOptions!.videoUrl };
    }

    // Video extension: pass source video URL (nested object)
    if (isExtension) {
      body.video = { url: xaiOptions!.videoUrl };
    }

    // Convert SDK image input to the nested xAI request image object
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

    // Reference images for R2V (reference-to-video) generation
    if (hasReferenceImages) {
      body.reference_images = xaiOptions!.referenceImageUrls!.map(url => ({
        url,
      }));
    }

    if (xaiOptions != null) {
      for (const [key, value] of Object.entries(xaiOptions)) {
        if (
          ![
            'mode',
            'pollIntervalMs',
            'pollTimeoutMs',
            'resolution',
            'videoUrl',
            'referenceImageUrls',
          ].includes(key)
        ) {
          body[key] = value;
        }
      }
    }

    return { body, warnings, xaiOptions, isEdit, isExtension, hasReferenceImages, effectiveMode };
  }

  async doStart(
    options: Parameters<NonNullable<VideoModelV4['doStart']>>[0],
  ): Promise<VideoModelV4OperationStartResult> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { body, warnings, isEdit, isExtension } =
      await this.buildRequestBody(options);

    const baseURL = this.config.baseURL ?? 'https://api.x.ai/v1';

    // Determine endpoint based on mode
    let endpoint: string;
    if (isEdit) {
      endpoint = `${baseURL}/videos/edits`;
    } else if (isExtension) {
      endpoint = `${baseURL}/videos/extensions`;
    } else {
      endpoint = `${baseURL}/videos/generations`;
    }

    const { value: createResponse, responseHeaders } = await postJsonToApi({
      url: endpoint,
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
    options: Parameters<NonNullable<VideoModelV4['doStatus']>>[0],
  ): Promise<VideoModelV4OperationStatusResult> {
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
      return {
        status: 'error' as const,
        error: 'Video generation request expired.',
        response: {
          timestamp: currentDate,
          modelId: this.modelId,
          headers: responseHeaders,
        },
      };
    }

    if (statusResponse.status === 'failed') {
      return {
        status: 'error' as const,
        error: 'Video generation failed.',
        response: {
          timestamp: currentDate,
          modelId: this.modelId,
          headers: responseHeaders,
        },
      };
    }

    if (
      statusResponse.status === 'done' ||
      (statusResponse.status == null && statusResponse.video?.url)
    ) {
      if (statusResponse.video?.respect_moderation === false) {
        throw new AISDKError({
          name: 'XAI_VIDEO_MODERATION_ERROR',
          message:
            'Video generation was blocked due to a content policy violation.',
        });
      }

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
            ...(statusResponse.usage?.cost_in_usd_ticks != null
              ? { costInUsdTicks: statusResponse.usage.cost_in_usd_ticks }
              : {}),
            ...(statusResponse.progress != null
              ? { progress: statusResponse.progress }
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
  usage: z
    .object({
      cost_in_usd_ticks: z.number().nullish(),
    })
    .nullish(),
  progress: z.number().nullish(),
  error: z
    .object({
      code: z.string().nullish(),
      message: z.string().nullish(),
    })
    .nullish(),
});
