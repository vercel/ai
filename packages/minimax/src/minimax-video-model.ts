import {
  AISDKError,
  type Experimental_VideoModelV4 as VideoModelV4,
  type Experimental_VideoModelV4File as VideoModelV4File,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertImageModelFileToDataUri,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  delay,
  getFromApi,
  getTopLevelMediaType,
  parseProviderOptions,
  postJsonToApi,
  resolve,
  type FetchFunction,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import {
  minimaxVideoModelOptionsSchema,
  minimaxVideoRatios,
  minimaxVideoResolutions,
  type MiniMaxVideoModelOptions,
} from './minimax-video-model-options';
import type { MiniMaxVideoModelId } from './minimax-video-settings';

interface MiniMaxVideoModelConfig {
  provider: string;
  // API root without a version suffix, e.g. `https://api.minimax.io`.
  baseURL: string;
  headers: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
}

type MiniMaxVideoDoGenerateOptions = Parameters<
  NonNullable<VideoModelV4['doGenerate']>
>[0];

const DEFAULT_RESOLUTION = '2K';
const DEFAULT_ASPECT_RATIO = '16:9';
const DEFAULT_POLL_INTERVAL_MS = 10_000;
const DEFAULT_POLL_TIMEOUT_MS = 600_000;
const DEFAULT_DURATION_SECONDS = 5;
const MAX_DURATION_SECONDS = 15;
const MAX_REFERENCE_IMAGES = 9;
const MAX_REFERENCE_VIDEOS = 3;
const MAX_REFERENCE_AUDIOS = 3;

const allowedRatios = new Set<string>(minimaxVideoRatios);
const allowedResolutions = new Set<string>(minimaxVideoResolutions);
const modelResolutionSettings: Record<
  string,
  { supported: readonly string[]; default: string }
> = {
  'MiniMax-H3': { supported: ['768P', '2K'], default: DEFAULT_RESOLUTION },
  'MiniMax-H3-Max': { supported: ['480P', '768P'], default: '768P' },
};

// The top-level `resolution` is `{width}x{height}`, but the API takes a named
// tier, so map canonical frame sizes onto the tiers. One frame size per ratio
// per tier, so a caller who pairs a resolution with any supported ratio
// resolves to the tier instead of being told the resolution is unsupported.
// MiniMax does not publish tier dimensions, so this is a closed table rather
// than a rule: 480P and 768P rows are named for the shorter side, the 2K rows
// for the longer one. A frame size not listed here warns.
const RESOLUTION_MAP: Record<string, string> = {
  // 480P — square, landscape, portrait
  '480x480': '480P',
  '1120x480': '480P',
  '854x480': '480P',
  '640x480': '480P',
  '480x854': '480P',
  '480x640': '480P',
  // 768P — square, landscape, portrait
  '768x768': '768P',
  '1792x768': '768P',
  '1366x768': '768P',
  '1024x768': '768P',
  '768x1366': '768P',
  '768x1024': '768P',
  // 2K — square, landscape, portrait
  '2048x2048': '2K',
  '2560x1080': '2K',
  '2560x1440': '2K',
  '2048x1536': '2K',
  '1440x2560': '2K',
  '1536x2048': '2K',
};

// A caller may pass a named tier itself rather than a frame size. Normalize it
// case-insensitively to the exact casing expected by the MiniMax API.
function resolveTopLevelResolution(resolution: string): string | undefined {
  const named = resolution.toUpperCase();
  return allowedResolutions.has(named) ? named : RESOLUTION_MAP[resolution];
}

// Frame images must be images. Returns the offending top-level media type when
// a frame is something else, so it can be rejected the way a reference input of
// the wrong kind is. A frame with no media type is left alone: the core emits
// URL inputs without one, and unlike a reference there is no routing decision
// riding on it.
function nonImageFrameMediaType(file: VideoModelV4File): string | undefined {
  if (file.mediaType == null) {
    return undefined;
  }

  const topLevelMediaType = getTopLevelMediaType(file.mediaType);
  return topLevelMediaType === 'image' ? undefined : topLevelMediaType;
}

export class MiniMaxVideoModel implements VideoModelV4 {
  readonly specificationVersion = 'v4';
  readonly maxVideosPerCall = 1;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: MiniMaxVideoModelId,
    private config: MiniMaxVideoModelConfig,
  ) {}

  async doGenerate(
    options: MiniMaxVideoDoGenerateOptions,
  ): Promise<Awaited<ReturnType<NonNullable<VideoModelV4['doGenerate']>>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const warnings: SharedV4Warning[] = [];

    const minimaxOptions = (await parseProviderOptions({
      provider: 'minimax',
      providerOptions: options.providerOptions,
      schema: minimaxVideoModelOptionsSchema,
    })) as MiniMaxVideoModelOptions | undefined;

    if (options.fps != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'fps',
        details: `${this.modelId} does not support a custom frame rate.`,
      });
    }

    if (options.seed != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'seed',
        details: `${this.modelId} does not support a seed.`,
      });
    }

    if (options.n != null && options.n > 1) {
      warnings.push({
        type: 'unsupported',
        feature: 'n',
        details: `${this.modelId} generates a single video per call. Only 1 video will be generated.`,
      });
    }

    if (options.generateAudio != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'generateAudio',
        details: `The ${this.modelId} API does not expose an audio parameter. The generateAudio option was ignored.`,
      });
    }

    const resolutionSettings = modelResolutionSettings[this.modelId];
    const supportedResolutions =
      resolutionSettings?.supported ?? minimaxVideoResolutions;
    const supportedResolutionSet = new Set<string>(supportedResolutions);
    const supportedResolutionNames = supportedResolutions
      .map(resolution => `"${resolution}"`)
      .join(' or ');

    // Resolution: the API takes a named tier, so an explicit provider option
    // wins and a top-level value is resolved to a tier.
    let resolution: string | undefined = minimaxOptions?.resolution;
    if (resolution != null && !supportedResolutionSet.has(resolution)) {
      warnings.push({
        type: 'unsupported',
        feature: 'resolution',
        details: `${this.modelId} supports ${supportedResolutionNames}. The provider resolution "${resolution}" was ignored.`,
      });
      resolution = undefined;
    }

    if (options.resolution != null) {
      const mapped = resolveTopLevelResolution(options.resolution);
      if (resolution != null) {
        // The provider option is already a tier and wins, so say so whenever
        // the top-level value is dropped — it either names no tier, or names a
        // different one now that every tier has frame sizes.
        if (mapped == null) {
          warnings.push({
            type: 'unsupported',
            feature: 'resolution',
            details:
              `Unrecognized resolution "${options.resolution}". ${this.modelId} supports ${supportedResolutionNames}, ` +
              `so providerOptions.minimax.resolution ("${resolution}") was used instead.`,
          });
        } else if (mapped !== resolution) {
          warnings.push({
            type: 'unsupported',
            feature: 'resolution',
            details:
              `The resolution "${options.resolution}" selects ${mapped}, but ` +
              `providerOptions.minimax.resolution ("${resolution}") was used instead.`,
          });
        }
      } else if (mapped != null && supportedResolutionSet.has(mapped)) {
        resolution = mapped;
      } else {
        warnings.push({
          type: 'unsupported',
          feature: 'resolution',
          details:
            mapped == null
              ? `Unrecognized resolution "${options.resolution}". ${this.modelId} supports ${supportedResolutionNames}.`
              : `${this.modelId} does not support the resolution "${mapped}". It supports ${supportedResolutionNames}.`,
        });
      }
    }
    resolution ??= resolutionSettings?.default ?? DEFAULT_RESOLUTION;

    // `convertImageModelFileToDataUri` passes `url` files through unchanged and
    // encodes inline data as a data URI. MiniMax `mm_file://…` handles survive
    // that pass-through, but not the core `generateVideo` path: it base64-decodes
    // any string that is not `http(s)://` or `data:`, so `mm_file://` only
    // reaches the API through `providerOptions.minimax.referenceAudioUrls`,
    // which is forwarded raw — not through `image`, `frameImages`, or
    // `inputReferences`.
    const content: Array<Record<string, unknown>> = [
      { type: 'text', text: options.prompt ?? '' },
    ];

    // The inputs that actually make it into `content` below, after the caps and
    // rejections H3 imposes. Reported as `providerMetadata.minimax
    // .resolvedInputs`: the warnings say an input was dropped, but not how many
    // survived, which callers that meter usage need. Accumulated at the push
    // sites rather than re-derived, so the two cannot disagree.
    let sentImageCount = 0;
    const sentReferenceVideoUrls: string[] = [];

    // Resolve first/last frame inputs. A standalone `image` is treated as the
    // first frame (image-to-video). The core sets `image` to the `first_frame`
    // frame image when there is one, so the frame-image entry is tracked
    // separately to report which input a warning came from.
    const firstFrameImage = options.frameImages?.find(
      frame => frame.frameType === 'first_frame',
    )?.image;
    let firstFrame = firstFrameImage ?? options.image;
    let lastFrame = options.frameImages?.find(
      frame => frame.frameType === 'last_frame',
    )?.image;

    // Reject unusable frames before deciding the generation mode.
    const firstFrameMediaType =
      firstFrame != null ? nonImageFrameMediaType(firstFrame) : undefined;
    if (firstFrame != null && firstFrameMediaType != null) {
      warnings.push({
        type: 'unsupported',
        feature: firstFrameImage != null ? 'frameImages' : 'image',
        details:
          firstFrameMediaType === 'video'
            ? `${this.modelId} does not accept a video as a frame image. The video was ignored.`
            : `${this.modelId} only accepts an image as a frame image; the "${firstFrame.mediaType}" file was ignored.`,
      });
      firstFrame = undefined;
    }

    if (lastFrame != null) {
      if (firstFrame == null) {
        warnings.push({
          type: 'unsupported',
          feature: 'frameImages',
          details: `${this.modelId} requires a first_frame when a last_frame is provided. The last_frame was ignored.`,
        });
        lastFrame = undefined;
      } else {
        const lastFrameMediaType = nonImageFrameMediaType(lastFrame);
        if (lastFrameMediaType != null) {
          warnings.push({
            type: 'unsupported',
            feature: 'frameImages',
            details:
              lastFrameMediaType === 'video'
                ? `${this.modelId} does not accept a video as a frame image. The last_frame video was ignored.`
                : `${this.modelId} only accepts an image as a frame image; the "${lastFrame.mediaType}" last_frame was ignored.`,
          });
          lastFrame = undefined;
        }
      }
    }

    const usesFrameImages = firstFrame != null || lastFrame != null;

    const referenceFiles = options.inputReferences ?? [];
    const referenceAudioUrls = minimaxOptions?.referenceAudioUrls ?? [];
    const supportsReferences = this.modelId !== 'MiniMax-H3-Max';

    if (!supportsReferences && referenceFiles.length > 0) {
      warnings.push({
        type: 'unsupported',
        feature: 'inputReferences',
        details:
          'MiniMax-H3-Max does not support reference-to-video inputs. The references were ignored.',
      });
    }

    if (!supportsReferences && referenceAudioUrls.length > 0) {
      warnings.push({
        type: 'unsupported',
        feature: 'referenceAudioUrls',
        details:
          'MiniMax-H3-Max does not support reference audio. The audio was ignored.',
      });
    }

    const usesReferences =
      supportsReferences &&
      (referenceFiles.length > 0 || referenceAudioUrls.length > 0);

    if (usesFrameImages) {
      if (firstFrame != null) {
        content.push({
          type: 'image_url',
          image_url: { url: convertImageModelFileToDataUri(firstFrame) },
          role: 'first_frame',
        });
        sentImageCount++;
      }

      if (lastFrame != null) {
        content.push({
          type: 'image_url',
          image_url: { url: convertImageModelFileToDataUri(lastFrame) },
          role: 'last_frame',
        });
        sentImageCount++;
      }

      // Frame images and reference inputs are mutually exclusive.
      if (usesReferences) {
        warnings.push({
          type: 'unsupported',
          feature: 'inputReferences',
          details:
            'MiniMax-H3 cannot combine frame images with reference inputs. The references were ignored.',
        });
      }
    } else if (usesReferences) {
      const referenceImages: VideoModelV4File[] = [];
      const referenceVideos: VideoModelV4File[] = [];

      for (const file of referenceFiles) {
        const topLevelMediaType =
          file.mediaType != null
            ? getTopLevelMediaType(file.mediaType)
            : undefined;

        if (topLevelMediaType === 'video') {
          referenceVideos.push(file);
        } else if (topLevelMediaType === 'image') {
          referenceImages.push(file);
        } else if (topLevelMediaType == null) {
          // Only URL references can omit a media type.
          // Fall back to an image and warn
          warnings.push({
            type: 'unsupported',
            feature: 'inputReferences',
            details:
              'MiniMax-H3 requires an explicit mediaType to route URL references as ' +
              'video or image. Pass { data: url, mediaType: "video/mp4" } for video ' +
              'references. The reference was treated as an image.',
          });
          referenceImages.push(file);
        } else {
          warnings.push({
            type: 'unsupported',
            feature: 'inputReferences',
            details:
              `MiniMax-H3 only accepts image and video references; the "${file.mediaType}" ` +
              'reference was ignored. Pass reference audio via ' +
              'providerOptions.minimax.referenceAudioUrls.',
          });
        }
      }

      for (const image of referenceImages.slice(0, MAX_REFERENCE_IMAGES)) {
        content.push({
          type: 'image_url',
          image_url: { url: convertImageModelFileToDataUri(image) },
          role: 'reference_image',
        });
        sentImageCount++;
      }
      if (referenceImages.length > MAX_REFERENCE_IMAGES) {
        warnings.push({
          type: 'unsupported',
          feature: 'inputReferences',
          details: `MiniMax-H3 accepts at most ${MAX_REFERENCE_IMAGES} reference images. Extra images were ignored.`,
        });
      }

      for (const video of referenceVideos.slice(0, MAX_REFERENCE_VIDEOS)) {
        const url = convertImageModelFileToDataUri(video);
        content.push({
          type: 'video_url',
          video_url: { url },
          role: 'reference_video',
        });
        // Inline files become data URIs, which are not worth echoing back.
        if (video.type === 'url') {
          sentReferenceVideoUrls.push(url);
        }
      }
      if (referenceVideos.length > MAX_REFERENCE_VIDEOS) {
        warnings.push({
          type: 'unsupported',
          feature: 'inputReferences',
          details: `MiniMax-H3 accepts at most ${MAX_REFERENCE_VIDEOS} reference videos. Extra videos were ignored.`,
        });
      }

      // Reference audio must accompany at least one reference image or video.
      if (referenceAudioUrls.length > 0) {
        if (referenceImages.length === 0 && referenceVideos.length === 0) {
          warnings.push({
            type: 'unsupported',
            feature: 'referenceAudioUrls',
            details:
              'MiniMax-H3 reference audio must be paired with at least one reference image or video. The audio was ignored.',
          });
        } else {
          for (const url of referenceAudioUrls.slice(0, MAX_REFERENCE_AUDIOS)) {
            content.push({
              type: 'audio_url',
              audio_url: { url },
              role: 'reference_audio',
            });
          }
          if (referenceAudioUrls.length > MAX_REFERENCE_AUDIOS) {
            warnings.push({
              type: 'unsupported',
              feature: 'referenceAudioUrls',
              details: `MiniMax-H3 accepts at most ${MAX_REFERENCE_AUDIOS} reference audios. Extra audios were ignored.`,
            });
          }
        }
      }
    }

    // Aspect ratio. In frame-image mode the ratio follows the supplied image,
    // so an explicit ratio is ignored.
    const isTextToVideo = content.length === 1;
    let ratio = minimaxOptions?.ratio as string | undefined;
    if (ratio == null && options.aspectRatio != null) {
      if (allowedRatios.has(options.aspectRatio)) {
        ratio = options.aspectRatio;
      } else {
        warnings.push({
          type: 'unsupported',
          feature: 'aspectRatio',
          details: isTextToVideo
            ? `${this.modelId} does not support the aspect ratio "${options.aspectRatio}". Using the default (${DEFAULT_ASPECT_RATIO}).`
            : `${this.modelId} does not support the aspect ratio "${options.aspectRatio}". Using the provider default (adaptive).`,
        });
        if (isTextToVideo) {
          ratio = DEFAULT_ASPECT_RATIO;
        }
      }
    }
    if (ratio === 'adaptive' && isTextToVideo) {
      warnings.push({
        type: 'unsupported',
        feature: 'aspectRatio',
        details:
          `${this.modelId} text-to-video does not support the adaptive aspect ratio. ` +
          `Using the default (${DEFAULT_ASPECT_RATIO}).`,
      });
      ratio = DEFAULT_ASPECT_RATIO;
    }
    if (usesFrameImages && ratio != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'aspectRatio',
        details: `${this.modelId} derives the aspect ratio from the frame image; the requested ratio was ignored.`,
      });
      ratio = undefined;
    }
    if (ratio == null && isTextToVideo) {
      ratio = DEFAULT_ASPECT_RATIO;
    }

    // Both H3 models take an integer duration, but H3 starts at 4 seconds while
    // H3-Max starts at 5. Round before clamping because the API rejects both
    // fractional and out-of-range values.
    const minDurationSeconds = this.modelId === 'MiniMax-H3' ? 4 : 5;
    let duration = options.duration ?? DEFAULT_DURATION_SECONDS;
    if (options.duration != null) {
      if (!Number.isInteger(duration)) {
        duration = Math.round(duration);
        warnings.push({
          type: 'unsupported',
          feature: 'duration',
          details: `${this.modelId} requires a whole number of seconds. The requested duration of ${options.duration} was rounded to ${duration}.`,
        });
      }

      if (duration > MAX_DURATION_SECONDS) {
        warnings.push({
          type: 'unsupported',
          feature: 'duration',
          details: `${this.modelId} supports at most ${MAX_DURATION_SECONDS} seconds. The requested duration of ${options.duration} was clamped to ${MAX_DURATION_SECONDS}.`,
        });
        duration = MAX_DURATION_SECONDS;
      } else if (duration < minDurationSeconds) {
        warnings.push({
          type: 'unsupported',
          feature: 'duration',
          details: `${this.modelId} requires at least ${minDurationSeconds} seconds. The requested duration of ${options.duration} was clamped to ${minDurationSeconds}.`,
        });
        duration = minDurationSeconds;
      }
    }

    const body: Record<string, unknown> = {
      model: this.modelId,
      content,
      resolution,
      duration,
    };
    if (ratio != null) {
      body.ratio = ratio;
    }
    if (minimaxOptions?.aigcWatermark != null) {
      body.aigc_watermark = minimaxOptions.aigcWatermark;
    }

    const baseURL = this.config.baseURL;

    const { value: createResponse } = await postJsonToApi({
      url: `${baseURL}/v2/video_generation`,
      headers: combineHeaders(
        await resolve(this.config.headers),
        options.headers,
      ),
      body,
      failedResponseHandler: minimaxVideoFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        minimaxCreateVideoResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const taskId = createResponse.task_id;
    if (!taskId) {
      throw new AISDKError({
        name: 'MINIMAX_VIDEO_GENERATION_ERROR',
        message: `No task_id returned from the MiniMax API. Response: ${JSON.stringify(createResponse)}`,
      });
    }

    const pollIntervalMs =
      minimaxOptions?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const pollTimeoutMs =
      minimaxOptions?.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
    const startTime = Date.now();
    let responseHeaders: Record<string, string> | undefined;

    while (true) {
      await delay(pollIntervalMs, { abortSignal: options.abortSignal });

      if (Date.now() - startTime > pollTimeoutMs) {
        throw new AISDKError({
          name: 'MINIMAX_VIDEO_GENERATION_TIMEOUT',
          message: `MiniMax video generation timed out after ${pollTimeoutMs}ms. Task ID: ${taskId}`,
        });
      }

      const { value: statusResponse, responseHeaders: pollHeaders } =
        await getFromApi({
          url: `${baseURL}/v2/query/video_generation/${taskId}`,
          validateUrl: true,
          trustedOrigin: baseURL,
          headers: combineHeaders(
            await resolve(this.config.headers),
            options.headers,
          ),
          successfulResponseHandler: createJsonResponseHandler(
            minimaxVideoStatusResponseSchema,
          ),
          failedResponseHandler: minimaxVideoFailedResponseHandler,
          abortSignal: options.abortSignal,
          fetch: this.config.fetch,
        });

      responseHeaders = pollHeaders;
      const task = statusResponse.task;

      switch (task.status) {
        case 'succeeded': {
          const url = task.content?.url;
          if (!url) {
            throw new AISDKError({
              name: 'MINIMAX_VIDEO_GENERATION_ERROR',
              message: `MiniMax video generation completed but no video URL was returned. Task ID: ${taskId}`,
            });
          }

          return {
            videos: [
              {
                type: 'url' as const,
                url,
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
              minimax: {
                taskId,
                videoUrl: url,
                resolvedInputs: {
                  imageCount: sentImageCount,
                  referenceVideoUrls: sentReferenceVideoUrls,
                },
                ...(task.duration != null ? { duration: task.duration } : {}),
                ...(task.ratio != null ? { ratio: task.ratio } : {}),
                ...(task.resolution != null
                  ? { resolution: task.resolution }
                  : {}),
                ...(task.usage != null
                  ? {
                      usage: {
                        totalSeconds: task.usage.total_seconds,
                        inputSeconds: task.usage.input_seconds,
                        outputSeconds: task.usage.output_seconds,
                      },
                    }
                  : {}),
              },
            },
          };
        }

        case 'failed': {
          throw new AISDKError({
            name: 'MINIMAX_VIDEO_GENERATION_FAILED',
            message: `MiniMax video generation failed${
              task.error?.message ? `: ${task.error.message}` : ''
            }${task.error?.code != null ? ` (${task.error.code})` : ''}. Task ID: ${taskId}`,
          });
        }

        case 'cancelled': {
          throw new AISDKError({
            name: 'MINIMAX_VIDEO_GENERATION_CANCELLED',
            message: `MiniMax video generation was cancelled. Task ID: ${taskId}`,
          });
        }

        case 'expired': {
          throw new AISDKError({
            name: 'MINIMAX_VIDEO_GENERATION_EXPIRED',
            message: `MiniMax video generation request expired. Task ID: ${taskId}`,
          });
        }

        // 'queued' | 'running' | unknown → keep polling.
        default:
          break;
      }
    }
  }
}

const minimaxCreateVideoResponseSchema = z.object({
  task_id: z.string().nullish(),
});

const minimaxVideoStatusResponseSchema = z.object({
  task: z.object({
    id: z.string().nullish(),
    status: z.string().nullish(),
    content: z
      .object({
        url: z.string().nullish(),
      })
      .nullish(),
    resolution: z.string().nullish(),
    duration: z.number().nullish(),
    ratio: z.string().nullish(),
    usage: z
      .object({
        total_seconds: z.number().nullish(),
        input_seconds: z.number().nullish(),
        output_seconds: z.number().nullish(),
      })
      .nullish(),
    error: z
      .object({
        code: z.union([z.string(), z.number()]).nullish(),
        message: z.string().nullish(),
      })
      .nullish(),
  }),
});

const minimaxVideoErrorSchema = z.object({
  type: z.string().nullish(),
  error: z
    .object({
      type: z.string().nullish(),
      message: z.string().nullish(),
      http_code: z.union([z.string(), z.number()]).nullish(),
    })
    .nullish(),
  request_id: z.string().nullish(),
});

const minimaxVideoFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: minimaxVideoErrorSchema,
  errorToMessage: data =>
    data.error?.message ?? 'MiniMax video generation error',
});
