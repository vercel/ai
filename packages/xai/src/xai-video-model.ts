import {
  AISDKError,
  APICallError,
  type Experimental_VideoModelV4,
  type Experimental_VideoModelV4File,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertUint8ArrayToBase64,
  createJsonResponseHandler,
  delay,
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

const RESOLUTION_MAP: Record<string, string> = {
  '1920x1080': '1080p',
  '1280x720': '720p',
  '854x480': '480p',
  '640x480': '480p',
};

type XaiVideoDoGenerateOptions = Parameters<
  Experimental_VideoModelV4['doGenerate']
>[0];

function getFirstFrameImage(
  options: XaiVideoDoGenerateOptions,
): Experimental_VideoModelV4File | undefined {
  return options.frameImages?.find(frame => frame.frameType === 'first_frame')
    ?.image;
}

function getLastFrameImage(
  options: XaiVideoDoGenerateOptions,
): Experimental_VideoModelV4File | undefined {
  return options.frameImages?.find(frame => frame.frameType === 'last_frame')
    ?.image;
}

function resolveStartImage(
  options: XaiVideoDoGenerateOptions,
): Experimental_VideoModelV4File | undefined {
  return getFirstFrameImage(options) ?? options.image;
}

const isVideoFile = (file: Experimental_VideoModelV4File): boolean =>
  file.mediaType != null && getTopLevelMediaType(file.mediaType) === 'video';

const isAudioFile = (file: Experimental_VideoModelV4File): boolean =>
  file.mediaType != null && getTopLevelMediaType(file.mediaType) === 'audio';

// xAI accepts a single reference audio track per request.
const MAX_REFERENCE_AUDIOS = 1;

function fileToXaiUrl(file: Experimental_VideoModelV4File): string {
  if (file.type === 'url') {
    return file.url;
  }

  const base64Data =
    typeof file.data === 'string'
      ? file.data
      : convertUint8ArrayToBase64(file.data);
  return `data:${file.mediaType};base64,${base64Data}`;
}

// Resolves the reference images and audio for R2V generation. First-class
// `inputReferences` win over the legacy `referenceImageUrls` and
// `referenceAudioUrls` provider options. Video references are not supported for
// reference-to-video and are skipped with a warning. References without a media
// type (only possible for URLs) are treated as images.
function resolveReferences(
  options: XaiVideoDoGenerateOptions,
  xaiOptions: XaiParsedVideoModelOptions | undefined,
  warnings: SharedV4Warning[],
): {
  images: Array<{ url: string }> | undefined;
  audios: Array<{ url: string }> | undefined;
} {
  let images: Array<{ url: string }> | undefined;
  let audios: Array<{ url: string }> | undefined;

  if (options.inputReferences != null && options.inputReferences.length > 0) {
    const imageFiles: Experimental_VideoModelV4File[] = [];
    const audioFiles: Experimental_VideoModelV4File[] = [];

    for (const reference of options.inputReferences) {
      if (isVideoFile(reference)) {
        warnings.push({
          type: 'unsupported',
          feature: 'inputReferences',
          details:
            'xAI reference-to-video accepts image and audio references only. ' +
            'The video reference was ignored. Use providerOptions.xai.mode ' +
            '"extend-video" to continue from a video.',
        });
        continue;
      }

      if (isAudioFile(reference)) {
        audioFiles.push(reference);
        continue;
      }

      imageFiles.push(reference);
    }

    images = imageFiles.map(reference => ({ url: fileToXaiUrl(reference) }));

    if (audioFiles.length > 0) {
      audios = audioFiles
        .slice(0, MAX_REFERENCE_AUDIOS)
        .map(reference => ({ url: fileToXaiUrl(reference) }));

      if (audioFiles.length > MAX_REFERENCE_AUDIOS) {
        warnings.push({
          type: 'unsupported',
          feature: 'inputReferences',
          details:
            `xAI accepts at most ${MAX_REFERENCE_AUDIOS} reference audio ` +
            'track. The extra audio references were ignored.',
        });
      }
    }
  } else if (
    xaiOptions?.referenceImageUrls != null &&
    xaiOptions.referenceImageUrls.length > 0
  ) {
    images = xaiOptions.referenceImageUrls.map(url => ({ url }));
  }

  // The provider option supplies audio whenever `inputReferences` carried none,
  // so reference images can come from `inputReferences` while the audio comes
  // from `referenceAudioUrls`.
  if (
    audios == null &&
    xaiOptions?.referenceAudioUrls != null &&
    xaiOptions.referenceAudioUrls.length > 0
  ) {
    audios = xaiOptions.referenceAudioUrls.map(url => ({ url }));
  }

  return { images, audios };
}

function resolveVideoMode(
  options: XaiVideoDoGenerateOptions,
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
  const hasInputReferences =
    options.inputReferences != null && options.inputReferences.length > 0;
  const hasLegacyReferenceUrls =
    xaiOptions?.referenceImageUrls != null &&
    xaiOptions.referenceImageUrls.length > 0;

  if (!hasFrameImages && (hasInputReferences || hasLegacyReferenceUrls)) {
    return 'reference-to-video';
  }

  return undefined;
}

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

    // Reference images and audio for R2V (reference-to-video) generation
    if (hasReferenceImages) {
      const { images: referenceImages, audios: referenceAudios } =
        resolveReferences(options, xaiOptions, warnings);

      if (referenceImages != null) {
        body.reference_images = referenceImages;
      }

      // Optional reference audio (max 1).
      if (referenceAudios != null) {
        if (referenceImages == null || referenceImages.length === 0) {
          warnings.push({
            type: 'unsupported',
            feature: 'referenceAudioUrls',
            details:
              'xAI reference audio must be paired with at least one reference ' +
              'image. The reference audio was ignored.',
          });
        } else {
          body.reference_audios = referenceAudios;
        }
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

    // Warn when reference audio was provided but cannot be used in the resolved
    // mode (reference audio is only supported for reference-to-video).
    if (
      xaiOptions?.referenceAudioUrls != null &&
      xaiOptions.referenceAudioUrls.length > 0 &&
      !hasReferenceImages
    ) {
      warnings.push({
        type: 'unsupported',
        feature: 'referenceAudioUrls',
        details:
          'xAI only supports reference audio for reference-to-video ' +
          'generation. The reference audio was ignored.',
      });
    }

    // Warn when reference images were provided but cannot be used in the
    // resolved mode (e.g. alongside frameImages, or in edit/extend modes).
    if (
      options.inputReferences != null &&
      options.inputReferences.length > 0 &&
      !hasReferenceImages
    ) {
      warnings.push({
        type: 'unsupported',
        feature: 'inputReferences',
        details:
          'xAI only supports inputReferences for reference-to-video ' +
          'generation. The reference images were ignored.',
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
            'user',
            'referenceAudioUrls',
          ].includes(key)
        ) {
          body[key] = value;
        }
      }
    }

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

    // Step 1: Create video generation/edit/extension request
    const { value: createResponse } = await postJsonToApi({
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
          validateUrl: false,
          headers: combineHeaders(this.config.headers(), options.headers),
          successfulResponseHandler: xaiVideoStatusResponseHandler,
          failedResponseHandler: xaiFailedResponseHandler,
          abortSignal: options.abortSignal,
          fetch: this.config.fetch,
        });

      responseHeaders = pollHeaders;

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

      if (statusResponse.status === 'expired') {
        throw new AISDKError({
          name: 'XAI_VIDEO_GENERATION_EXPIRED',
          message: 'Video generation request expired.',
        });
      }

      if (statusResponse.status === 'failed') {
        throw new AISDKError({
          name: 'XAI_VIDEO_GENERATION_FAILED',
          message: 'Video generation failed.',
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
