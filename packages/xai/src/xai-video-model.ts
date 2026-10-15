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

const isAudioReference = (file: VideoModelV4File): boolean =>
  file.mediaType != null && getTopLevelMediaType(file.mediaType) === 'audio';

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
// Video references are not supported for reference-to-video and are skipped
// with a warning. Audio references are handled separately below.
function resolveReferences(
  options: XaiVideoCallOptions,
  xaiOptions: XaiParsedVideoModelOptions | undefined,
  warnings: SharedV4Warning[],
): Array<{ url: string }> | undefined {
  if (options.inputReferences != null && options.inputReferences.length > 0) {
    const imageFiles: VideoModelV4File[] = [];

    for (const reference of options.inputReferences) {
      if (isAudioReference(reference)) {
        continue;
      }

      if (!isImageReference(reference)) {
        warnings.push({
          type: 'unsupported',
          feature: 'inputReferences',
          details:
            'xAI reference-to-video does not accept video references. The ' +
            'video reference was ignored. Use providerOptions.xai.mode ' +
            '"extend-video" to continue from a video.',
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
}

function resolveReferenceAudios(
  options: XaiVideoCallOptions,
): Array<{ url: string }> | undefined {
  const audioReferences = options.inputReferences?.filter(isAudioReference);

  return audioReferences != null && audioReferences.length > 0
    ? audioReferences.map(reference => ({ url: fileToXaiUrl(reference) }))
    : undefined;
}

// True when at least one reference would survive as an image.
function hasImageInputReference(options: XaiVideoCallOptions): boolean {
  return options.inputReferences?.some(isImageReference) ?? false;
}

function hasAudioInputReference(options: XaiVideoCallOptions): boolean {
  return options.inputReferences?.some(isAudioReference) ?? false;
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

  const hasLegacyReferenceUrls =
    xaiOptions?.referenceImageUrls != null &&
    xaiOptions.referenceImageUrls.length > 0;

  // xAI supports image references, audio references, or both. Video-only
  // references must not flip a standard generation request into R2V.
  if (
    hasImageInputReference(options) ||
    hasAudioInputReference(options) ||
    hasLegacyReferenceUrls
  ) {
    return 'reference-to-video';
  }
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

    if (options.generateAudio != null && !isEdit && !isExtension) {
      body.generate_audio = options.generateAudio;
    } else if (options.generateAudio != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'generateAudio',
        details: `xAI ${isEdit ? 'video editing' : 'video extension'} does not support generateAudio.`,
      });
    }

    if (xaiOptions?.storageOptions != null) {
      const { filename, expiresAfter, publicUrl } = xaiOptions.storageOptions;
      body.storage_options = {
        filename,
        ...(expiresAfter != null ? { expires_after: expiresAfter } : {}),
        ...(publicUrl != null
          ? {
              public_url:
                typeof publicUrl === 'boolean'
                  ? publicUrl
                  : {
                      ...(publicUrl.expiresAfter != null
                        ? { expires_after: publicUrl.expiresAfter }
                        : {}),
                    },
            }
          : {}),
      };
    }

    if (xaiOptions?.keyframes != null && xaiOptions.keyframes.length > 0) {
      if (this.modelId !== 'grok-imagine-video-1.5' || isEdit || isExtension) {
        warnings.push({
          type: 'unsupported',
          feature: 'keyframes',
          details:
            this.modelId !== 'grok-imagine-video-1.5'
              ? 'xAI only supports keyframes with "grok-imagine-video-1.5".'
              : `xAI ${isEdit ? 'video editing' : 'video extension'} does not support keyframes.`,
        });
      } else {
        body.keyframes = xaiOptions.keyframes.map(keyframe => ({
          image: { url: keyframe.imageUrl },
          timestamp_s: keyframe.timestampSeconds,
        }));
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

    // Only grok-imagine-video-1.5 supports a pinned last frame.
    const lastFrameImage = getLastFrameImage(options);
    if (lastFrameImage != null) {
      if (
        this.modelId !== 'grok-imagine-video-1.5' ||
        isEdit ||
        isExtension ||
        isVideoFile(lastFrameImage)
      ) {
        warnings.push({
          type: 'unsupported',
          feature: 'frameImages',
          details:
            this.modelId !== 'grok-imagine-video-1.5'
              ? 'xAI only supports last_frame with "grok-imagine-video-1.5". The last frame was ignored.'
              : 'xAI only accepts an image last_frame for video generation. The last frame was ignored.',
        });
      } else {
        body.last_frame = { url: fileToXaiUrl(lastFrameImage) };
      }
    }

    // Reference images for R2V (reference-to-video) generation
    if (hasReferenceImages) {
      const referenceImages = resolveReferences(options, xaiOptions, warnings);
      const referenceAudios = resolveReferenceAudios(options);

      if (referenceImages != null) {
        body.reference_images = referenceImages;
      } else if (referenceAudios == null) {
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
      const referenceVoices = referenceVoiceIds?.map(voiceId => ({
        voice_id: voiceId,
      }));
      const referenceAudioInputs = [
        ...(referenceAudios ?? []),
        ...(referenceVoices ?? []),
      ];
      if (referenceAudioInputs.length > 0) {
        if (referenceAudioInputs.length > 3) {
          warnings.push({
            type: 'unsupported',
            feature: 'inputReferences',
            details:
              'xAI reference-to-video supports at most 3 audio references. Only the first 3 were used.',
          });
        }
        body.reference_audios = referenceAudioInputs.slice(0, 3);
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
        details:
          hasImageInputReference(options) || hasAudioInputReference(options)
            ? 'xAI only supports inputReferences for reference-to-video ' +
              'generation. The references were ignored.'
            : 'xAI reference-to-video requires at least one image or audio reference. ' +
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
            'keyframes',
            'storageOptions',
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
      const video = statusResponse.video;

      // Terminal outcomes, so they are reported the same way as an upstream `failed`
      if (video?.respect_moderation === false) {
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

      const videoUrl =
        video?.url ?? video?.file_output?.public_url ?? undefined;

      if (!videoUrl) {
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
        videos: [{ type: 'url', url: videoUrl, mediaType: 'video/mp4' }],
        warnings: [],
        response: {
          timestamp: currentDate,
          modelId: this.modelId,
          headers: responseHeaders,
        },
        providerMetadata: {
          xai: {
            requestId,
            videoUrl,
            ...(video?.duration != null ? { duration: video.duration } : {}),
            ...(statusResponse.usage?.cost_in_usd_ticks != null
              ? { costInUsdTicks: statusResponse.usage.cost_in_usd_ticks }
              : {}),
            ...(statusResponse.progress != null
              ? { progress: statusResponse.progress }
              : {}),
            ...(video?.file_output != null
              ? {
                  fileOutput: {
                    fileId: video.file_output.file_id,
                    filename: video.file_output.filename,
                    ...(video.file_output.expires_at != null
                      ? {
                          expiresAt: video.file_output.expires_at,
                        }
                      : {}),
                    ...(video.file_output.public_url != null
                      ? {
                          publicUrl: video.file_output.public_url,
                        }
                      : {}),
                    ...(video.file_output.public_url_error != null
                      ? {
                          publicUrlError: video.file_output.public_url_error,
                        }
                      : {}),
                    ...(video.file_output.public_url_expires_at != null
                      ? {
                          publicUrlExpiresAt:
                            video.file_output.public_url_expires_at,
                        }
                      : {}),
                  },
                }
              : {}),
            ...(video?.storage_error != null
              ? { storageError: video.storage_error }
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
      url: z.string().nullish(),
      duration: z.number().nullish(),
      respect_moderation: z.boolean().nullish(),
      file_output: z
        .object({
          file_id: z.string(),
          filename: z.string(),
          expires_at: z.number().nullish(),
          public_url: z.string().nullish(),
          public_url_error: z.string().nullish(),
          public_url_expires_at: z.number().nullish(),
        })
        .nullish(),
      storage_error: z.string().nullish(),
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
