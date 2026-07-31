import {
  AISDKError,
  type Experimental_VideoModelV4 as VideoModelV4,
  type Experimental_VideoModelV4File as VideoModelV4File,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertUint8ArrayToBase64,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  delay,
  getFromApi,
  getTopLevelMediaType,
  parseProviderOptions,
  postJsonToApi,
  type FetchFunction,
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
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
}

type MiniMaxVideoDoGenerateOptions = Parameters<VideoModelV4['doGenerate']>[0];

const DEFAULT_RESOLUTION = '2K';
const DEFAULT_POLL_INTERVAL_MS = 10_000;
const DEFAULT_POLL_TIMEOUT_MS = 600_000;
const MIN_DURATION_SECONDS = 5;
const MAX_DURATION_SECONDS = 15;
const MAX_REFERENCE_IMAGES = 9;
const MAX_REFERENCE_VIDEOS = 3;
const MAX_REFERENCE_AUDIOS = 3;

const allowedRatios = new Set<string>(minimaxVideoRatios);
const allowedResolutions = new Set<string>(minimaxVideoResolutions);

// The API takes a named resolution tier rather than pixel dimensions, so map
// the canonical 2K frame sizes onto the single tier H3 supports. Anything else
// can't be honored and warns.
const RESOLUTION_MAP: Record<string, string> = {
  // Square
  '2048x2048': '2K',
  // Landscape
  '2560x1440': '2K',
  // Portrait
  '1440x2560': '2K',
};

// A top-level `resolution` is accepted as either a named tier ('2K', matched
// case insensitively) or a `{width}x{height}` value mapped onto one.
function resolveTopLevelResolution(resolution: string): string | undefined {
  const named = resolution.toUpperCase();
  return allowedResolutions.has(named) ? named : RESOLUTION_MAP[resolution];
}

function isVideoFile(file: VideoModelV4File): boolean {
  return (
    file.mediaType != null && getTopLevelMediaType(file.mediaType) === 'video'
  );
}

// Converts a video-model file into a MiniMax content URL. Passes through `url`
// files unchanged (so `https://…` and `mm_file://…` references work as-is) and
// encodes inline file data as a data URI.
function fileToUrl(file: VideoModelV4File): string {
  if (file.type === 'url') {
    return file.url;
  }

  const base64Data =
    typeof file.data === 'string'
      ? file.data
      : convertUint8ArrayToBase64(file.data);
  return `data:${file.mediaType};base64,${base64Data}`;
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
  ): Promise<Awaited<ReturnType<VideoModelV4['doGenerate']>>> {
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
        details: 'MiniMax-H3 does not support a custom frame rate.',
      });
    }

    if (options.seed != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'seed',
        details: 'MiniMax-H3 does not support a seed.',
      });
    }

    if (options.n != null && options.n > 1) {
      warnings.push({
        type: 'unsupported',
        feature: 'n',
        details:
          'MiniMax-H3 generates a single video per call. Only 1 video will be generated.',
      });
    }

    if (options.generateAudio === false) {
      warnings.push({
        type: 'unsupported',
        feature: 'generateAudio',
        details:
          'MiniMax-H3 always generates native audio; it cannot be disabled.',
      });
    }

    // Resolution: the API takes a named tier, so an explicit provider option
    // wins and a top-level value is resolved to a tier.
    let resolution: string | undefined = minimaxOptions?.resolution;
    if (resolution == null && options.resolution != null) {
      const mapped = resolveTopLevelResolution(options.resolution);
      if (mapped != null) {
        resolution = mapped;
      } else {
        warnings.push({
          type: 'unsupported',
          feature: 'resolution',
          details:
            `Unrecognized resolution "${options.resolution}". MiniMax-H3 only ` +
            'supports "2K".',
        });
      }
    }
    resolution ??= DEFAULT_RESOLUTION;

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
    // first frame (image-to-video).
    const firstFrame =
      options.frameImages?.find(frame => frame.frameType === 'first_frame')
        ?.image ?? options.image;
    const lastFrame = options.frameImages?.find(
      frame => frame.frameType === 'last_frame',
    )?.image;
    const usesFrameImages = firstFrame != null || lastFrame != null;

    const referenceFiles = options.inputReferences ?? [];
    const referenceAudioUrls = minimaxOptions?.referenceAudioUrls ?? [];
    const usesReferences =
      referenceFiles.length > 0 || referenceAudioUrls.length > 0;

    if (usesFrameImages) {
      if (firstFrame != null) {
        if (isVideoFile(firstFrame)) {
          warnings.push({
            type: 'unsupported',
            feature: options.image != null ? 'image' : 'frameImages',
            details:
              'MiniMax-H3 does not accept a video as a frame image. The video was ignored.',
          });
        } else {
          content.push({
            type: 'image_url',
            image_url: { url: fileToUrl(firstFrame) },
            role: 'first_frame',
          });
          sentImageCount++;
        }
      }

      if (lastFrame != null) {
        if (firstFrame == null) {
          warnings.push({
            type: 'unsupported',
            feature: 'frameImages',
            details:
              'MiniMax-H3 requires a first_frame when a last_frame is provided. The last_frame was ignored.',
          });
        } else if (isVideoFile(lastFrame)) {
          warnings.push({
            type: 'unsupported',
            feature: 'frameImages',
            details:
              'MiniMax-H3 does not accept a video as a frame image. The last_frame video was ignored.',
          });
        } else {
          content.push({
            type: 'image_url',
            image_url: { url: fileToUrl(lastFrame) },
            role: 'last_frame',
          });
          sentImageCount++;
        }
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
      const referenceImages = referenceFiles.filter(file => !isVideoFile(file));
      const referenceVideos = referenceFiles.filter(file => isVideoFile(file));

      for (const image of referenceImages.slice(0, MAX_REFERENCE_IMAGES)) {
        content.push({
          type: 'image_url',
          image_url: { url: fileToUrl(image) },
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
        const url = fileToUrl(video);
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
    let ratio = minimaxOptions?.ratio as string | undefined;
    if (ratio == null && options.aspectRatio != null) {
      if (allowedRatios.has(options.aspectRatio)) {
        ratio = options.aspectRatio;
      } else {
        warnings.push({
          type: 'unsupported',
          feature: 'aspectRatio',
          details:
            `MiniMax-H3 does not support the aspect ratio "${options.aspectRatio}". ` +
            'Using the provider default (adaptive).',
        });
      }
    }
    if (usesFrameImages && ratio != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'aspectRatio',
        details:
          'MiniMax-H3 derives the aspect ratio from the frame image; the requested ratio was ignored.',
      });
      ratio = undefined;
    }

    const duration = options.duration ?? MIN_DURATION_SECONDS;
    if (
      options.duration != null &&
      (options.duration < MIN_DURATION_SECONDS ||
        options.duration > MAX_DURATION_SECONDS)
    ) {
      warnings.push({
        type: 'unsupported',
        feature: 'duration',
        details: `MiniMax-H3 supports durations between ${MIN_DURATION_SECONDS} and ${MAX_DURATION_SECONDS} seconds.`,
      });
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
      headers: combineHeaders(this.config.headers(), options.headers),
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
          message: `MiniMax video generation timed out after ${pollTimeoutMs}ms`,
        });
      }

      const { value: statusResponse, responseHeaders: pollHeaders } =
        await getFromApi({
          url: `${baseURL}/v2/query/video_generation/${taskId}`,
          validateUrl: false,
          headers: combineHeaders(this.config.headers(), options.headers),
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
              message:
                'MiniMax video generation completed but no video URL was returned.',
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
                ...(task.usage != null ? { usage: task.usage } : {}),
              },
            },
          };
        }

        case 'failed': {
          throw new AISDKError({
            name: 'MINIMAX_VIDEO_GENERATION_FAILED',
            message: `MiniMax video generation failed${
              task.error?.message ? `: ${task.error.message}` : ''
            }${task.error?.code != null ? ` (${task.error.code})` : ''}`,
          });
        }

        case 'cancelled': {
          throw new AISDKError({
            name: 'MINIMAX_VIDEO_GENERATION_CANCELLED',
            message: 'MiniMax video generation was cancelled.',
          });
        }

        case 'expired': {
          throw new AISDKError({
            name: 'MINIMAX_VIDEO_GENERATION_EXPIRED',
            message: 'MiniMax video generation request expired.',
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
