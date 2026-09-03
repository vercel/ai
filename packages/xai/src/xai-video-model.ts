import {
  AISDKError,
  APICallError,
  type Experimental_VideoModelV4 as VideoModelV4,
  type Experimental_VideoModelV4CallOptions as VideoModelV4CallOptions,
  type Experimental_VideoModelV4File as VideoModelV4File,
  type Experimental_VideoModelV4OperationStartResult as VideoModelV4OperationStartResult,
  type Experimental_VideoModelV4OperationStatusResult as VideoModelV4OperationStatusResult,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertUint8ArrayToBase64,
  createJsonResponseHandler,
  extractResponseHeaders,
  getFromApi,
  getTopLevelMediaType,
  parseProviderOptions,
  postJsonToApi,
  safeParseJSON,
  type FetchFunction,
  type ResponseHandler,
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

function encodePathSegment(value: string): string {
  const encodedValue = encodeURIComponent(value);

  // URL parsing normalizes both literal and percent-encoded dot segments.
  return encodedValue === '.'
    ? '%252E'
    : encodedValue === '..'
      ? '%252E%252E'
      : encodedValue;
}

const RESOLUTION_MAP: Record<string, string> = {
  '1920x1080': '1080p',
  '1280x720': '720p',
  '854x480': '480p',
  '640x480': '480p',
};

type XaiVideoCallOptions = VideoModelV4CallOptions;

function getFirstFrameImage(
  options: XaiVideoCallOptions,
): VideoModelV4File | undefined {
  return options.frameImages?.find(frame => frame.frameType === 'first_frame')
    ?.image;
}

function getLastFrameImage(
  options: XaiVideoCallOptions,
): VideoModelV4File | undefined {
  return options.frameImages?.find(frame => frame.frameType === 'last_frame')
    ?.image;
}

function resolveStartImage(
  options: XaiVideoCallOptions,
): VideoModelV4File | undefined {
  return getFirstFrameImage(options) ?? options.image;
}

const isVideoFile = (file: VideoModelV4File): boolean =>
  file.mediaType != null && getTopLevelMediaType(file.mediaType) === 'video';

// References without a media type (only possible for URLs) are treated as
// images, matching the legacy `referenceImageUrls` behavior.
const isImageReference = (file: VideoModelV4File): boolean =>
  file.mediaType == null || getTopLevelMediaType(file.mediaType) === 'image';

function fileToXaiUrl(file: VideoModelV4File): string {
  if (file.type === 'url') {
    return file.url;
  }

  const base64Data =
    typeof file.data === 'string'
      ? file.data
      : convertUint8ArrayToBase64(file.data);
  return `data:${file.mediaType};base64,${base64Data}`;
}

// Resolves the reference images for R2V generation. First-class
// `inputReferences` win over the legacy `referenceImageUrls` provider option.
// Non-image references (video or audio) are not supported for
// reference-to-video and are skipped with a warning.
function resolveReferences(
  options: XaiVideoCallOptions,
  xaiOptions: XaiParsedVideoModelOptions | undefined,
  warnings: SharedV4Warning[],
): Array<{ url: string }> | undefined {
  if (options.inputReferences != null && options.inputReferences.length > 0) {
    const imageFiles: VideoModelV4File[] = [];

    for (const reference of options.inputReferences) {
      if (!isImageReference(reference)) {
        warnings.push({
          type: 'unsupported',
          feature: 'inputReferences',
          details: isVideoFile(reference)
            ? 'xAI reference-to-video accepts image references only. The ' +
              'video reference was ignored. Use providerOptions.xai.mode ' +
              '"extend-video" to continue from a video.'
            : 'xAI reference-to-video accepts image references only. The ' +
              'non-image reference was ignored.',
        });
        continue;
      }

      imageFiles.push(reference);
    }

    return imageFiles.length > 0
      ? imageFiles.map(reference => ({ url: fileToXaiUrl(reference) }))
      : undefined;
  }

  if (
    xaiOptions?.referenceImageUrls != null &&
    xaiOptions.referenceImageUrls.length > 0
  ) {
    return xaiOptions.referenceImageUrls.map(url => ({ url }));
  }

  return undefined;
}

// True when at least one reference would survive as an image.
function hasImageInputReference(options: XaiVideoCallOptions): boolean {
  return options.inputReferences?.some(isImageReference) ?? false;
}

function resolveVideoMode(
  options: XaiVideoCallOptions,
  xaiOptions: XaiParsedVideoModelOptions | undefined,
): XaiParsedVideoModelOptions['mode'] | undefined {
  if (xaiOptions?.mode != null) {
    return xaiOptions.mode;
  }

  if (xaiOptions?.videoUrl != null) {
    return 'edit-video';
  }

  // frameImages (first/last frame) take precedence over reference images, so
  // only auto-select reference-to-video when no frame images are provided.
  const hasFrameImages =
    options.frameImages != null && options.frameImages.length > 0;
  const hasLegacyReferenceUrls =
    xaiOptions?.referenceImageUrls != null &&
    xaiOptions.referenceImageUrls.length > 0;

  // Reference-to-video needs at least one image reference. An audio-only (or
  // video-only) `inputReferences` array must not flip a text- or
  // image-to-video request into R2V.
  if (
    !hasFrameImages &&
    (hasImageInputReference(options) || hasLegacyReferenceUrls)
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

  private async buildRequestBody(options: VideoModelV4CallOptions): Promise<{
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

    const effectiveMode = resolveVideoMode(options, xaiOptions);

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
            'Use providerOptions.xai.resolution with "480p", "720p", or ' +
            '"1080p" instead.',
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

    // Convert the start image (first_frame or image-to-video input) to the
    // nested xAI request image object.
    const startImage = resolveStartImage(options);
    if (startImage != null) {
      if (isVideoFile(startImage)) {
        const fromFrameImages = getFirstFrameImage(options) != null;
        warnings.push({
          type: 'unsupported',
          feature: fromFrameImages ? 'frameImages' : 'image',
          details:
            'xAI does not accept a video as a start/frame image. The video ' +
            'was ignored. Use providerOptions.xai.mode "extend-video" to ' +
            'continue from a video instead.',
        });
      } else {
        body.image = { url: fileToXaiUrl(startImage) };
      }
    }

    // xAI has no first-last-frame interpolation; warn and ignore last_frame.
    const lastFrameImage = getLastFrameImage(options);
    if (lastFrameImage != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'frameImages',
        details: isVideoFile(lastFrameImage)
          ? 'xAI does not accept a video as a start/frame image. The video ' +
            'last frame was ignored. Use providerOptions.xai.mode ' +
            '"extend-video" to continue from a video instead.'
          : 'xAI video models do not support last_frame. Use ' +
            'providerOptions.xai.mode "extend-video" to continue from a ' +
            "video's last frame. The last frame image was ignored.",
      });
    }

    // Reference images for R2V (reference-to-video) generation
    if (hasReferenceImages) {
      const referenceImages = resolveReferences(options, xaiOptions, warnings);

      if (referenceImages != null) {
        body.reference_images = referenceImages;
      } else {
        // Explicit R2V with no usable image references would silently send
        // a plain generations request; tell the user it is no longer R2V.
        warnings.push({
          type: 'unsupported',
          feature: 'referenceImages',
          details:
            'xAI reference-to-video requires at least one image reference. ' +
            'The video will be generated without reference images.',
        });
      }

      const referenceVoiceIds = xaiOptions?.referenceVoiceIds;
      if (referenceVoiceIds != null && referenceVoiceIds.length > 0) {
        body.reference_audios = referenceVoiceIds.map(voiceId => ({
          voice_id: voiceId,
        }));
      }

      // Reference-to-video is capped at 720p; downgrade a 1080p request.
      if (body.resolution === '1080p') {
        warnings.push({
          type: 'unsupported',
          feature: 'resolution',
          details:
            'xAI reference-to-video is limited to 720p. The request was ' +
            'downgraded from 1080p to 720p.',
        });
        body.resolution = '720p';
      }
    }

    // 1080p requires grok-imagine-video-1.5; the original grok-imagine-video
    // rejects it. Warn, but send the request as the user asked.
    if (body.resolution === '1080p' && this.modelId === 'grok-imagine-video') {
      warnings.push({
        type: 'unsupported',
        feature: 'resolution',
        details:
          'xAI model "grok-imagine-video" does not support 1080p. Use ' +
          '"grok-imagine-video-1.5" for 1080p, or a lower resolution. The ' +
          'request was sent with 1080p.',
      });
    }

    // Warn when references were provided but cannot be used in the resolved
    // mode (e.g. alongside frameImages, in edit/extend modes, or when the
    // references carried no usable image to drive reference-to-video).
    if (
      options.inputReferences != null &&
      options.inputReferences.length > 0 &&
      !hasReferenceImages
    ) {
      warnings.push({
        type: 'unsupported',
        feature: 'inputReferences',
        details: hasImageInputReference(options)
          ? 'xAI only supports inputReferences for reference-to-video ' +
            'generation. The reference images were ignored.'
          : 'xAI reference-to-video requires at least one image reference. ' +
            'The references were ignored.',
      });
    }

    // Preset reference voices only apply to reference-to-video generation.
    if (
      xaiOptions?.referenceVoiceIds != null &&
      xaiOptions.referenceVoiceIds.length > 0 &&
      !hasReferenceImages
    ) {
      warnings.push({
        type: 'unsupported',
        feature: 'referenceVoiceIds',
        details:
          'xAI only supports reference voices for reference-to-video ' +
          'generation. The reference voices were ignored.',
      });
    }

    if (!isExtension && xaiOptions?.user !== undefined) {
      body.user = xaiOptions.user;
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
            'referenceVoiceIds',
            'user',
          ].includes(key)
        ) {
          body[key] = value;
        }
      }
    }

    return {
      body,
      warnings,
      xaiOptions,
      isEdit,
      isExtension,
      hasReferenceImages,
      effectiveMode,
    };
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
      url: `${baseURL}/videos/${encodePathSegment(requestId)}`,
      validateUrl: false,
      headers: combineHeaders(this.config.headers(), options.headers),
      successfulResponseHandler: xaiVideoStatusResponseHandler,
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
      const errorDetails =
        statusResponse.error?.message ?? statusResponse.error?.code;

      return {
        status: 'error' as const,
        error:
          errorDetails != null
            ? `Video generation failed: ${errorDetails}`
            : 'Video generation failed.',
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
      // Terminal outcomes, so they are reported the same way as an upstream `failed`
      if (statusResponse.video?.respect_moderation === false) {
        return {
          status: 'error' as const,
          error:
            'Video generation was blocked due to a content policy violation.',
          response: {
            timestamp: currentDate,
            modelId: this.modelId,
            headers: responseHeaders,
          },
        };
      }

      if (!statusResponse.video?.url) {
        return {
          status: 'error' as const,
          error: 'Video generation completed but no video URL was returned.',
          response: {
            timestamp: currentDate,
            modelId: this.modelId,
            headers: responseHeaders,
          },
        };
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

const xaiVideoStatusJsonResponseHandler = createJsonResponseHandler(
  xaiVideoStatusResponseSchema,
);

// Generous bound for a `{status, progress}` payload of ~50 bytes.
const MAX_PENDING_BODY_BYTES = 1024 * 1024;

const textDecoder = new TextDecoder();

// Bounded replacement for `response.text()`. Throws on overflow without
// cancelling the body: cancelling a tee branch neither settles nor releases
// the underlying source while the sibling branch is live.
async function readPendingBody({
  response,
  url,
  requestBodyValues,
}: Parameters<ResponseHandler<unknown>>[0]): Promise<string> {
  if (response.body == null) {
    return '';
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.length;
      if (totalBytes > MAX_PENDING_BODY_BYTES) {
        throw new APICallError({
          message: `xAI video status response exceeded ${MAX_PENDING_BODY_BYTES} bytes`,
          url,
          requestBodyValues,
          statusCode: response.status,
          responseHeaders: extractResponseHeaders(response),
        });
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return textDecoder.decode(merged);
}

const xaiVideoStatusResponseHandler: ResponseHandler<
  z.infer<typeof xaiVideoStatusResponseSchema>
> = async options => {
  // xAI answers 202 while a generation is still running, sometimes with an
  // empty body. Read it rather than cancelling: `body.cancel()` never settles
  // on a tee branch, which `Response.clone()` in fetch instrumentation creates.
  if (options.response.status === 202) {
    const responseHeaders = extractResponseHeaders(options.response);
    const text = await readPendingBody(options);

    if (text.trim().length === 0) {
      return { responseHeaders, value: { status: 'pending' } };
    }

    const parsed = await safeParseJSON({
      text,
      schema: xaiVideoStatusResponseSchema,
    });

    return {
      responseHeaders,
      value: parsed.success ? parsed.value : { status: 'pending' },
    };
  }

  return xaiVideoStatusJsonResponseHandler(options);
};
