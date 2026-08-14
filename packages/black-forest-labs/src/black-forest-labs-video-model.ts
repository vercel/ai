import {
  AISDKError,
  InvalidArgumentError,
  type Experimental_VideoModelV4 as VideoModelV4,
  type Experimental_VideoModelV4CallOptions as VideoModelV4CallOptions,
  type Experimental_VideoModelV4File as VideoModelV4File,
  type Experimental_VideoModelV4OperationStartResult as VideoModelV4OperationStartResult,
  type Experimental_VideoModelV4OperationStatusResult as VideoModelV4OperationStatusResult,
  type Experimental_VideoModelV4Result as VideoModelV4Result,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonResponseHandler,
  delay,
  getFromApi,
  getTopLevelMediaType,
  parseProviderOptions,
  postJsonToApi,
  resolve,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  type FetchFunction,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import {
  bflFailedResponseHandler,
  isTrustedUrl,
} from './black-forest-labs-api';
import {
  blackForestLabsVideoModelOptionsSchema,
  type BlackForestLabsVideoModelOptions,
} from './black-forest-labs-video-model-options';
import {
  blackForestLabsVideoAspectRatios,
  blackForestLabsVideoResolutions,
  type BlackForestLabsVideoModelId,
} from './black-forest-labs-video-settings';

const DEFAULT_POLL_INTERVAL_MILLIS = 2_000;
const DEFAULT_POLL_TIMEOUT_MILLIS = 600_000;
const MIN_DURATION_SECONDS = 5;
const MAX_DURATION_SECONDS = 20;
/** Keyframe counts above this need an explicit duration when untimed. */
const UNTIMED_KEYFRAMES_NEEDING_DURATION = 3;

const allowedAspectRatios = new Set<string>(blackForestLabsVideoAspectRatios);
const allowedResolutions = new Set<string>(blackForestLabsVideoResolutions);

/**
 * Statuses that end the poll without a video.
 */
const TERMINAL_FAILURE_STATUSES = new Set([
  'Error',
  'Failed',
  'Request Moderated',
  'Content Moderated',
  'Task not found',
]);

type BlackForestLabsVideoKeyframe = string | [number, string];

interface BlackForestLabsVideoModelConfig {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  pollIntervalMillis?: number;
  pollTimeoutMillis?: number;
  _internal?: {
    currentDate?: () => Date;
  };
}

type BlackForestLabsVideoOperation = {
  requestId: string;
  pollingUrl: string;
  cost?: number;
  inputMegapixels?: number;
  outputMegapixels?: number;
};

type BlackForestLabsVideoDoGenerateOptions = VideoModelV4CallOptions;

/**
 * The API takes a named tier (`hd`/`fhd`) while the top-level `resolution` is
 * `{width}x{height}`, so a caller may reasonably pass either.
 */
function resolveTopLevelResolution(
  resolution: string,
): { tier: string; derived: boolean } | undefined {
  const named = resolution.toLowerCase();
  if (allowedResolutions.has(named)) {
    return { tier: named, derived: false };
  }

  const match = resolution.match(/^(\d+)x(\d+)$/);
  if (match == null) {
    return undefined;
  }

  const shorterSide = Math.min(Number(match[1]), Number(match[2]));
  return {
    tier: shorterSide <= 720 ? 'hd' : 'fhd',
    derived: shorterSide !== 720 && shorterSide !== 1080,
  };
}

function nonImageFrameMediaType(file: VideoModelV4File): string | undefined {
  if (file.mediaType == null) {
    return undefined;
  }

  const topLevelMediaType = getTopLevelMediaType(file.mediaType);
  return topLevelMediaType === 'image' ? undefined : topLevelMediaType;
}

/**
 * Draft-enhance replays an encrypted bundle from a prior `draft` generation at
 * full quality. The bundle pins the original mode, prompt, seed, and
 * conditioning media, and the API accepts nothing alongside it but
 * `safety_tolerance` — so this is a separate body rather than one more field,
 * and everything else the caller set is reported as dropped.
 */
function getDraftEnhanceArgs(
  options: BlackForestLabsVideoDoGenerateOptions,
  bflOptions: BlackForestLabsVideoModelOptions,
) {
  const warnings: Array<SharedV4Warning> = [];

  const pinnedByBundle: Array<[feature: string, isSet: boolean]> = [
    ['prompt', (options.prompt?.trim().length ?? 0) > 0],
    [
      'aspectRatio',
      options.aspectRatio != null || bflOptions.aspectRatio != null,
    ],
    ['resolution', options.resolution != null || bflOptions.resolution != null],
    ['duration', options.duration != null],
    ['fps', options.fps != null],
    ['seed', options.seed != null],
    ['generateAudio', options.generateAudio != null],
    ['image', options.image != null],
    ['frameImages', (options.frameImages?.length ?? 0) > 0],
    ['inputReferences', (options.inputReferences?.length ?? 0) > 0],
    ['keyframes', (bflOptions.keyframes?.length ?? 0) > 0],
    ['version', bflOptions.version != null],
  ];

  for (const [feature, isSet] of pinnedByBundle) {
    if (isSet) {
      warnings.push({
        type: 'unsupported',
        feature,
        details:
          `FLUX 3 draft enhance replays the draft bundle as it was generated, so "${feature}" ` +
          'was ignored. Set it on the original draft request instead.',
      });
    }
  }

  if (bflOptions.draft != null) {
    warnings.push({
      type: 'unsupported',
      feature: 'draft',
      details:
        'FLUX 3 draft enhance always renders at full quality. The draft option was ignored.',
    });
  }

  if (options.n != null && options.n > 1) {
    warnings.push({
      type: 'unsupported',
      feature: 'n',
      details:
        'FLUX 3 video generates a single video per call. Only 1 video will be generated.',
    });
  }

  return {
    body: {
      mode: 'draft_enhance',
      draft_cache: bflOptions.draftCache,
      safety_tolerance: bflOptions.safetyTolerance,
    } as Record<string, unknown>,
    warnings,
  };
}

/**
 * A failed poll carries a `details` payload that is a plain string for
 * moderation refusals and an object for everything else.
 */
function describePollDetails(details: unknown): string | undefined {
  if (details == null) {
    return undefined;
  }

  if (typeof details === 'string') {
    return details;
  }

  try {
    return JSON.stringify(details);
  } catch {
    return undefined;
  }
}

/**
 * The API takes conditioning media as an http(s) URL or a bare base64 string —
 * not a data URI.
 */
function toBlackForestLabsFile(file: VideoModelV4File): string {
  if (file.type === 'url') {
    return file.url;
  }

  if (typeof file.data === 'string') {
    return file.data;
  }

  return Buffer.from(file.data).toString('base64');
}

export class BlackForestLabsVideoModel implements VideoModelV4 {
  readonly specificationVersion = 'v4';
  readonly maxVideosPerCall = 1;

  get provider(): string {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: BlackForestLabsVideoModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: BlackForestLabsVideoModelId;
    config: BlackForestLabsVideoModelConfig;
  }) {
    return new BlackForestLabsVideoModel(options.modelId, options.config);
  }

  constructor(
    readonly modelId: BlackForestLabsVideoModelId,
    private readonly config: BlackForestLabsVideoModelConfig,
  ) {}

  private async getArgs(options: BlackForestLabsVideoDoGenerateOptions) {
    const warnings: Array<SharedV4Warning> = [];

    const bflOptions = (await parseProviderOptions({
      provider: 'blackForestLabs',
      providerOptions: options.providerOptions,
      schema: blackForestLabsVideoModelOptionsSchema,
    })) as BlackForestLabsVideoModelOptions | undefined;

    if (bflOptions?.draftCache != null) {
      return getDraftEnhanceArgs(options, bflOptions);
    }

    if (options.fps != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'fps',
        details: 'FLUX 3 video does not support a custom frame rate.',
      });
    }

    if (options.seed != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'seed',
        details: 'FLUX 3 video does not accept a seed.',
      });
    }

    if (options.n != null && options.n > 1) {
      warnings.push({
        type: 'unsupported',
        feature: 'n',
        details:
          'FLUX 3 video generates a single video per call. Only 1 video will be generated.',
      });
    }

    // Resolution: an explicit provider option is already a tier, so it wins and
    // a top-level value only has to be resolved when it is the sole source.
    let resolution: string | undefined = bflOptions?.resolution;
    if (options.resolution != null) {
      const resolved = resolveTopLevelResolution(options.resolution);
      if (resolution != null) {
        if (resolved == null) {
          warnings.push({
            type: 'unsupported',
            feature: 'resolution',
            details:
              `Unrecognized resolution "${options.resolution}". FLUX 3 video supports "hd" and "fhd", ` +
              `so providerOptions.blackForestLabs.resolution ("${resolution}") was used instead.`,
          });
        }
      } else if (resolved == null) {
        warnings.push({
          type: 'unsupported',
          feature: 'resolution',
          details:
            `Unrecognized resolution "${options.resolution}". FLUX 3 video supports ` +
            '"hd" and "fhd", or a {width}x{height} value to map onto one.',
        });
      } else {
        resolution = resolved.tier;
        if (resolved.derived) {
          warnings.push({
            type: 'compatibility',
            feature: 'resolution',
            details:
              `FLUX 3 video renders at "hd" or "fhd"; the requested resolution ` +
              `"${options.resolution}" was mapped to "${resolved.tier}".`,
          });
        }
      }
    }

    // Aspect ratio: the provider option can also express `auto`, so it wins.
    let aspectRatio: string | undefined = bflOptions?.aspectRatio;
    if (aspectRatio == null && options.aspectRatio != null) {
      if (allowedAspectRatios.has(options.aspectRatio)) {
        aspectRatio = options.aspectRatio;
      } else {
        warnings.push({
          type: 'unsupported',
          feature: 'aspectRatio',
          details:
            `FLUX 3 video does not support the aspect ratio "${options.aspectRatio}". ` +
            'Using the provider default (auto).',
        });
      }
    }

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

    const firstFrameMediaType =
      firstFrame != null ? nonImageFrameMediaType(firstFrame) : undefined;
    if (firstFrame != null && firstFrameMediaType != null) {
      warnings.push({
        type: 'unsupported',
        feature: firstFrameImage != null ? 'frameImages' : 'image',
        details:
          firstFrameMediaType === 'video'
            ? 'FLUX 3 video does not accept a video as a keyframe. Pass it as an inputReference to continue from it instead.'
            : `FLUX 3 video only accepts an image as a keyframe; the "${firstFrame.mediaType}" file was ignored.`,
      });
      firstFrame = undefined;
    }

    if (lastFrame != null) {
      if (firstFrame == null) {
        // Keyframes are positional: the first entry opens the clip, so there is
        // no way to send a closing frame on its own.
        warnings.push({
          type: 'unsupported',
          feature: 'frameImages',
          details:
            'FLUX 3 video requires a first_frame when a last_frame is provided. The last_frame was ignored.',
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
                ? 'FLUX 3 video does not accept a video as a keyframe. The last_frame video was ignored.'
                : `FLUX 3 video only accepts an image as a keyframe; the "${lastFrame.mediaType}" last_frame was ignored.`,
          });
          lastFrame = undefined;
        }
      }
    }

    // Keyframes: the provider option covers the shapes the top-level fields
    // cannot express (3+ images, images pinned to a second), so it wins.
    let keyframes: BlackForestLabsVideoKeyframe[] | undefined =
      bflOptions?.keyframes != null && bflOptions.keyframes.length > 0
        ? [...bflOptions.keyframes]
        : undefined;

    if (keyframes != null) {
      if (firstFrame != null || lastFrame != null) {
        warnings.push({
          type: 'unsupported',
          feature: options.frameImages != null ? 'frameImages' : 'image',
          details:
            'FLUX 3 video takes a single keyframe list. providerOptions.blackForestLabs.keyframes ' +
            'was used and the top-level frame images were ignored.',
        });
      }
    } else if (firstFrame != null) {
      keyframes = [toBlackForestLabsFile(firstFrame)];
      if (lastFrame != null) {
        keyframes.push(toBlackForestLabsFile(lastFrame));
      }
    }

    // Video continuation. FLUX 3 takes a single `start_video` and has no
    // reference-image concept, so image references cannot be honored.
    let startVideo: string | undefined;
    const referenceFiles = options.inputReferences ?? [];
    const referenceVideos: VideoModelV4File[] = [];

    for (const file of referenceFiles) {
      const topLevelMediaType =
        file.mediaType != null
          ? getTopLevelMediaType(file.mediaType)
          : undefined;

      if (topLevelMediaType === 'video') {
        referenceVideos.push(file);
      } else if (topLevelMediaType == null) {
        warnings.push({
          type: 'compatibility',
          feature: 'inputReferences',
          details:
            'FLUX 3 video only accepts a video reference, so the reference with no mediaType ' +
            'was treated as the video to continue from. Pass { url, mediaType: "video/mp4" } to be explicit.',
        });
        referenceVideos.push(file);
      } else if (topLevelMediaType === 'image') {
        warnings.push({
          type: 'unsupported',
          feature: 'inputReferences',
          details:
            'FLUX 3 video has no reference-image input. Pass images as `image`, `frameImages`, or ' +
            'providerOptions.blackForestLabs.keyframes instead. The reference was ignored.',
        });
      } else {
        warnings.push({
          type: 'unsupported',
          feature: 'inputReferences',
          details: `FLUX 3 video only accepts a video reference; the "${file.mediaType}" reference was ignored.`,
        });
      }
    }

    if (referenceVideos.length > 0) {
      if (keyframes != null) {
        // Continuation and keyframes are mutually exclusive modes.
        warnings.push({
          type: 'unsupported',
          feature: 'inputReferences',
          details:
            'FLUX 3 video cannot combine keyframes with a video to continue from. The video reference was ignored.',
        });
      } else {
        startVideo = toBlackForestLabsFile(referenceVideos[0]);
        if (referenceVideos.length > 1) {
          warnings.push({
            type: 'unsupported',
            feature: 'inputReferences',
            details:
              'FLUX 3 video continues from a single video. Only the first video reference was used.',
          });
        }
      }
    }

    // Duration: whole seconds between 5 and 20, or omitted to let the API pick
    // one that matches the content.
    let duration = options.duration;
    if (duration != null) {
      if (!Number.isInteger(duration)) {
        const rounded = Math.round(duration);
        warnings.push({
          type: 'unsupported',
          feature: 'duration',
          details: `FLUX 3 video requires a whole number of seconds. The requested duration of ${duration} was rounded to ${rounded}.`,
        });
        duration = rounded;
      }

      if (duration > MAX_DURATION_SECONDS) {
        warnings.push({
          type: 'unsupported',
          feature: 'duration',
          details: `FLUX 3 video supports at most ${MAX_DURATION_SECONDS} seconds. The requested duration of ${options.duration} was clamped to ${MAX_DURATION_SECONDS}.`,
        });
        duration = MAX_DURATION_SECONDS;
      } else if (duration < MIN_DURATION_SECONDS) {
        warnings.push({
          type: 'unsupported',
          feature: 'duration',
          details: `FLUX 3 video requires at least ${MIN_DURATION_SECONDS} seconds. The requested duration of ${options.duration} was clamped to ${MIN_DURATION_SECONDS}.`,
        });
        duration = MIN_DURATION_SECONDS;
      }
    }

    const untimedKeyframeCount =
      keyframes?.filter(keyframe => typeof keyframe === 'string').length ?? 0;
    if (
      duration == null &&
      untimedKeyframeCount >= UNTIMED_KEYFRAMES_NEEDING_DURATION
    ) {
      throw new InvalidArgumentError({
        argument: 'duration',
        message:
          `FLUX 3 video requires an explicit duration when ${UNTIMED_KEYFRAMES_NEEDING_DURATION} or more ` +
          'keyframes are sent without a timestamp.',
      });
    }

    const mode = keyframes != null ? 'i2v' : startVideo != null ? 'v2v' : 't2v';

    const body: Record<string, unknown> = {
      mode,
      prompt: options.prompt ?? '',
      aspect_ratio: aspectRatio,
      duration,
      resolution,
      version: bflOptions?.version,
      generate_audio: options.generateAudio,
      safety_tolerance: bflOptions?.safetyTolerance,
      draft: bflOptions?.draft,
      ...(mode === 'i2v' && { keyframes }),
      ...(mode === 'v2v' && { start_video: startVideo }),
    };

    return { body, warnings };
  }

  async doStart(
    options: Parameters<NonNullable<VideoModelV4['doStart']>>[0],
  ): Promise<VideoModelV4OperationStartResult> {
    const { body, warnings } = await this.getArgs(options);

    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const combinedHeaders = combineHeaders(
      await resolve(this.config.headers),
      options.headers,
    );

    const { value: submit, responseHeaders } = await postJsonToApi({
      url: `${this.config.baseURL}/${this.modelId}`,
      headers: combinedHeaders,
      body,
      failedResponseHandler: bflFailedResponseHandler,
      successfulResponseHandler:
        createJsonResponseHandler(bflVideoSubmitSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    return {
      operation: {
        requestId: submit.id,
        pollingUrl: submit.polling_url,
        ...(submit.cost != null && { cost: submit.cost }),
        ...(submit.input_mp != null && {
          inputMegapixels: submit.input_mp,
        }),
        ...(submit.output_mp != null && {
          outputMegapixels: submit.output_mp,
        }),
      } satisfies BlackForestLabsVideoOperation,
      warnings,
      response: {
        modelId: this.modelId,
        timestamp: currentDate,
        headers: responseHeaders,
      },
    };
  }

  async doStatus(
    options: Parameters<NonNullable<VideoModelV4['doStatus']>>[0],
  ): Promise<VideoModelV4OperationStatusResult> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const operation = options.operation as BlackForestLabsVideoOperation;
    const url = new URL(operation.pollingUrl);
    if (!url.searchParams.has('id')) {
      url.searchParams.set('id', operation.requestId);
    }

    const combinedHeaders = combineHeaders(
      await resolve(this.config.headers),
      options.headers,
    );

    const { value, responseHeaders } = await getFromApi({
      url: url.toString(),
      // The polling URL comes from the provider response; validate it.
      validateUrl: true,
      trustedOrigin: this.config.baseURL,
      // Only send credentials when it stays on a trusted provider host.
      headers: isTrustedUrl(url.toString(), this.config.baseURL)
        ? combinedHeaders
        : undefined,
      failedResponseHandler: bflFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(bflVideoPollSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const response = {
      modelId: this.modelId,
      timestamp: currentDate,
      headers: responseHeaders,
    };
    const { status, result } = value;

    const cost = value.cost ?? operation.cost;

    if (status === 'Ready') {
      const parsed = bflVideoResultSchema.safeParse(result);
      if (!parsed.success) {
        throw new AISDKError({
          name: 'BLACK_FOREST_LABS_VIDEO_GENERATION_ERROR',
          message:
            'Black Forest Labs reported the video as Ready but returned no result.sample URL. ' +
            `Request id: ${operation.requestId}`,
        });
      }

      return {
        status: 'completed',
        videos: [
          {
            type: 'url',
            url: parsed.data.sample,
            mediaType: 'video/mp4',
          },
        ],
        warnings: [],
        providerMetadata: {
          blackForestLabs: {
            videos: [
              {
                id: operation.requestId,
                videoUrl: parsed.data.sample,
                ...(parsed.data.seed != null && { seed: parsed.data.seed }),
                ...(parsed.data.start_time != null && {
                  start_time: parsed.data.start_time,
                }),
                ...(parsed.data.end_time != null && {
                  end_time: parsed.data.end_time,
                }),
                ...(parsed.data.duration != null && {
                  duration: parsed.data.duration,
                }),
                ...(parsed.data.draft_cache != null && {
                  draftCache: parsed.data.draft_cache,
                }),
                ...(cost != null && { cost }),
                ...(operation.inputMegapixels != null && {
                  inputMegapixels: operation.inputMegapixels,
                }),
                ...(operation.outputMegapixels != null && {
                  outputMegapixels: operation.outputMegapixels,
                }),
              },
            ],
          },
        },
        response,
      };
    }

    if (TERMINAL_FAILURE_STATUSES.has(status)) {
      const detail = describePollDetails(value.details);
      return {
        status: 'error',
        error:
          `Black Forest Labs video generation failed with status "${status}"` +
          `${detail != null ? `: ${detail}` : ''}. Request id: ${operation.requestId}`,
        response,
      };
    }

    return { status: 'pending', response };
  }

  async doGenerate(
    options: BlackForestLabsVideoDoGenerateOptions,
  ): Promise<VideoModelV4Result> {
    const startResult = await this.doStart(options);
    const operation = startResult.operation as BlackForestLabsVideoOperation;
    const pollIntervalMillis =
      this.config.pollIntervalMillis ?? DEFAULT_POLL_INTERVAL_MILLIS;
    const pollTimeoutMillis =
      this.config.pollTimeoutMillis ?? DEFAULT_POLL_TIMEOUT_MILLIS;
    const startTime = Date.now();

    while (true) {
      await delay(pollIntervalMillis, { abortSignal: options.abortSignal });

      if (Date.now() - startTime > pollTimeoutMillis) {
        throw new AISDKError({
          name: 'BLACK_FOREST_LABS_VIDEO_GENERATION_TIMEOUT',
          message:
            `Black Forest Labs video generation timed out after ${pollTimeoutMillis}ms. ` +
            `Request id: ${operation.requestId}`,
        });
      }

      const statusResult = await this.doStatus({
        operation,
        headers: options.headers,
        abortSignal: options.abortSignal,
      });

      if (statusResult.status === 'pending') {
        continue;
      }

      if (statusResult.status === 'error') {
        throw new AISDKError({
          name: 'BLACK_FOREST_LABS_VIDEO_GENERATION_FAILED',
          message: statusResult.error,
        });
      }

      return {
        videos: statusResult.videos,
        warnings: [...startResult.warnings, ...statusResult.warnings],
        providerMetadata: statusResult.providerMetadata,
        response: statusResult.response,
      };
    }
  }
}

const bflVideoSubmitSchema = z.object({
  id: z.string(),
  polling_url: z.url(),
  cost: z.number().nullish(),
  input_mp: z.number().nullish(),
  output_mp: z.number().nullish(),
});

const bflVideoResultSchema = z.object({
  sample: z.url(),
  seed: z.number().nullish(),
  start_time: z.number().nullish(),
  end_time: z.number().nullish(),
  duration: z.number().nullish(),
  draft_cache: z.string().nullish(),
});

const bflVideoPollSchema = z
  .object({
    status: z.string().optional(),
    state: z.string().optional(),
    details: z.unknown().optional(),
    result: z.unknown().optional(),
    // `SettledCostResultResponse.cost` — the price actually charged, which the
    // API can only know once generation finishes. Absent on the plain
    // `ResultResponse` variant.
    cost: z.number().nullish(),
  })
  .refine(v => v.status != null || v.state != null, {
    message: 'Missing status in Black Forest Labs poll response',
  })
  .transform(v => ({
    status: (v.status ?? v.state)!,
    details: v.details,
    result: v.result,
    cost: v.cost,
  }));
