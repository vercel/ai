import {
  AISDKError,
  type Experimental_VideoModelV4 as VideoModelV4,
  type Experimental_VideoModelV4CallOptions as VideoModelV4CallOptions,
  type Experimental_VideoModelV4File as VideoModelV4File,
  type Experimental_VideoModelV4OperationStartResult as VideoModelV4OperationStartResult,
  type Experimental_VideoModelV4OperationStatusResult as VideoModelV4OperationStatusResult,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertImageModelFileToDataUri,
  createBinaryResponseHandler,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  detectMediaType,
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
  siftQVideoModelOptionsSchema,
  type SiftQVideoModelOptions,
} from './siftq-video-model-options';

interface SiftQVideoModelConfig {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
    maxRequestBytes?: number;
  };
}

type SiftQVideoOperation = {
  taskId: string;
};

type SiftQContentItem =
  | { type: 'text'; text: string }
  | {
      type: 'image_url';
      image_url: { url: string };
      role: 'first_frame' | 'last_frame' | 'reference_image';
    }
  | {
      type: 'video_url';
      video_url: { url: string };
      role: 'reference_video';
    }
  | {
      type: 'audio_url';
      audio_url: { url: string };
      role: 'reference_audio';
    };

const MODEL_ID = 'MiniMax-H3' as const;
const DEFAULT_DURATION = 5;
const DEFAULT_RESOLUTION = '2K' as const;
const DEFAULT_TEXT_RATIO = '16:9' as const;
const MAX_PROMPT_LENGTH = 7000;
const MAX_REQUEST_BYTES = 64 * 1024 * 1024;
const MAX_REFERENCE_IMAGES = 9;
const MAX_REFERENCE_VIDEOS = 3;
const MAX_REFERENCE_AUDIOS = 3;

const supportedRatios = new Set([
  'adaptive',
  '21:9',
  '16:9',
  '4:3',
  '1:1',
  '3:4',
  '9:16',
]);
const supportedImageTypes = new Set([
  'image/jpg',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);
const supportedVideoTypes = new Set(['video/mp4', 'video/quicktime']);
const supportedAudioTypes = new Set([
  'audio/wav',
  'audio/x-wav',
  'audio/mp3',
  'audio/mpeg',
]);
const twoKPixelResolutions = new Set([
  '2048x2048',
  '2560x1080',
  '2560x1440',
  '2048x1536',
  '1440x2560',
  '1536x2048',
]);

function apiError(name: string, message: string): AISDKError {
  return new AISDKError({ name, message });
}

function topLevelMediaType(file: VideoModelV4File): string | undefined {
  return file.mediaType == null
    ? undefined
    : getTopLevelMediaType(file.mediaType);
}

function validateMediaFile(
  file: VideoModelV4File,
  kind: 'image' | 'video' | 'audio',
): void {
  if (file.type === 'url') {
    let supportedLocation = /^mm_file:\/\/[^\s/]+$/.test(file.url);
    if (!supportedLocation) {
      try {
        const url = new URL(file.url);
        supportedLocation =
          url.protocol === 'http:' || url.protocol === 'https:';
      } catch {
        supportedLocation = false;
      }
    }
    if (!supportedLocation) {
      throw apiError(
        'SIFTQ_INVALID_MEDIA_LOCATION',
        'SiftQ media locations must use http(s) or mm_file://.',
      );
    }
  }

  const topLevelType = topLevelMediaType(file);
  if (topLevelType != null && topLevelType !== kind) {
    throw apiError(
      'SIFTQ_INVALID_REFERENCE_MEDIA',
      `SiftQ expected a ${kind} input, but received ${file.mediaType}.`,
    );
  }

  const mediaType = file.mediaType?.split(';', 1)[0].toLowerCase();
  const supportedTypes =
    kind === 'image'
      ? supportedImageTypes
      : kind === 'video'
        ? supportedVideoTypes
        : supportedAudioTypes;
  if (mediaType != null && !supportedTypes.has(mediaType)) {
    throw apiError(
      'SIFTQ_UNSUPPORTED_MEDIA_FORMAT',
      `SiftQ does not support ${mediaType} as a ${kind} input.`,
    );
  }

  if (file.type === 'file') {
    const size =
      typeof file.data === 'string'
        ? Math.floor(file.data.replace(/\s/g, '').length * 0.75)
        : file.data.byteLength;
    const limit =
      kind === 'image'
        ? 30 * 1024 * 1024
        : kind === 'video'
          ? 50 * 1024 * 1024
          : 15 * 1024 * 1024;
    if (size > limit) {
      throw apiError(
        'SIFTQ_MEDIA_TOO_LARGE',
        `SiftQ ${kind} inputs must not exceed ${limit / 1024 / 1024} MB.`,
      );
    }
  }
}

function assertRequestSize(
  body: Record<string, unknown>,
  maxRequestBytes = MAX_REQUEST_BYTES,
): void {
  const bodySize = new TextEncoder().encode(JSON.stringify(body)).byteLength;
  if (bodySize > maxRequestBytes) {
    throw apiError(
      'SIFTQ_REQUEST_TOO_LARGE',
      'SiftQ request bodies must not exceed 64 MB.',
    );
  }
}

export class SiftQVideoModel implements VideoModelV4 {
  readonly specificationVersion = 'v4';
  readonly maxVideosPerCall = 1;
  readonly modelId = MODEL_ID;

  get provider(): string {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: SiftQVideoModel) {
    return serializeModelOptions({
      modelId: MODEL_ID,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId?: string;
    config: SiftQVideoModelConfig;
  }) {
    return new SiftQVideoModel(options.config);
  }

  constructor(private readonly config: SiftQVideoModelConfig) {}

  async handleWebhookOption(
    options: Parameters<NonNullable<VideoModelV4['handleWebhookOption']>>[0],
  ) {
    const { url, received } = await options.webhook();
    return { webhookUrl: url, received };
  }

  private async buildRequestBody(options: VideoModelV4CallOptions): Promise<{
    body: Record<string, unknown>;
    warnings: SharedV4Warning[];
  }> {
    const warnings: SharedV4Warning[] = [];
    const siftQOptions = (await parseProviderOptions({
      provider: 'siftq',
      providerOptions: options.providerOptions,
      schema: siftQVideoModelOptionsSchema,
    })) as SiftQVideoModelOptions | undefined;

    if (options.n > 1) {
      warnings.push({
        type: 'unsupported',
        feature: 'n',
        details:
          'SiftQ creates one video per task. Only one video will be generated.',
      });
    }
    if (options.fps != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'fps',
        details: 'MiniMax-H3 does not accept a custom output frame rate.',
      });
    }
    if (options.seed != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'seed',
        details: 'MiniMax-H3 does not accept a deterministic seed.',
      });
    }
    if (options.generateAudio != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'generateAudio',
        details:
          'MiniMax-H3 V2 does not expose a generate_audio request field.',
      });
    }
    let resolution = siftQOptions?.resolution ?? undefined;
    if (options.resolution != null) {
      const mappedResolution = twoKPixelResolutions.has(options.resolution)
        ? '2K'
        : undefined;
      if (resolution == null && mappedResolution != null) {
        resolution = mappedResolution;
      } else if (
        mappedResolution == null ||
        (resolution != null && mappedResolution !== resolution)
      ) {
        warnings.push({
          type: 'unsupported',
          feature: 'resolution',
          details:
            'SiftQ accepts named tiers (768P or 2K). The pixel resolution could not be honored; use providerOptions.siftq.resolution.',
        });
      }
    }

    const prompt = options.prompt ?? '';
    if (prompt.trim().length === 0) {
      throw apiError(
        'SIFTQ_INVALID_VIDEO_PROMPT',
        'MiniMax-H3 requires a non-empty text prompt.',
      );
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      throw apiError(
        'SIFTQ_INVALID_VIDEO_PROMPT',
        `MiniMax-H3 prompts must not exceed ${MAX_PROMPT_LENGTH} characters.`,
      );
    }

    const duration = options.duration ?? DEFAULT_DURATION;
    if (!Number.isInteger(duration) || duration < 4 || duration > 15) {
      throw apiError(
        'SIFTQ_INVALID_VIDEO_DURATION',
        'MiniMax-H3 duration must be an integer from 4 through 15 seconds.',
      );
    }

    const firstFrames =
      options.frameImages?.filter(frame => frame.frameType === 'first_frame') ??
      [];
    const lastFrames =
      options.frameImages?.filter(frame => frame.frameType === 'last_frame') ??
      [];
    if (firstFrames.length > 1 || lastFrames.length > 1) {
      throw apiError(
        'SIFTQ_INVALID_FRAME_IMAGES',
        'MiniMax-H3 accepts at most one first frame and one last frame.',
      );
    }

    const firstFrame = firstFrames[0]?.image ?? options.image;
    const lastFrame = lastFrames[0]?.image;
    if (lastFrame != null && firstFrame == null) {
      throw apiError(
        'SIFTQ_MISSING_FIRST_FRAME',
        'MiniMax-H3 requires a first frame when a last frame is provided.',
      );
    }

    const hasFrameMode = firstFrame != null || lastFrame != null;
    const hasReferenceInputs =
      (options.inputReferences?.length ?? 0) > 0 ||
      (siftQOptions?.referenceAudioUrls?.length ?? 0) > 0;
    if (hasFrameMode && hasReferenceInputs) {
      throw apiError(
        'SIFTQ_INCOMPATIBLE_VIDEO_INPUTS',
        'MiniMax-H3 frame inputs and reference inputs are mutually exclusive.',
      );
    }

    const content: SiftQContentItem[] = [{ type: 'text', text: prompt }];
    if (firstFrame != null) {
      validateMediaFile(firstFrame, 'image');
      content.push({
        type: 'image_url',
        image_url: { url: convertImageModelFileToDataUri(firstFrame) },
        role: 'first_frame',
      });
    }
    if (lastFrame != null) {
      validateMediaFile(lastFrame, 'image');
      content.push({
        type: 'image_url',
        image_url: { url: convertImageModelFileToDataUri(lastFrame) },
        role: 'last_frame',
      });
    }

    let referenceImageCount = 0;
    let referenceVideoCount = 0;
    let referenceAudioCount = 0;
    for (const reference of options.inputReferences ?? []) {
      const mediaType = topLevelMediaType(reference);
      if (mediaType === 'video') {
        validateMediaFile(reference, 'video');
        referenceVideoCount++;
        content.push({
          type: 'video_url',
          video_url: { url: convertImageModelFileToDataUri(reference) },
          role: 'reference_video',
        });
      } else if (mediaType === 'audio') {
        validateMediaFile(reference, 'audio');
        referenceAudioCount++;
        content.push({
          type: 'audio_url',
          audio_url: { url: convertImageModelFileToDataUri(reference) },
          role: 'reference_audio',
        });
      } else if (mediaType === 'image' || mediaType == null) {
        if (mediaType == null) {
          warnings.push({
            type: 'unsupported',
            feature: 'inputReferences',
            details:
              'An untyped SiftQ input reference was treated as an image. Set mediaType to route it explicitly.',
          });
        }
        validateMediaFile(reference, 'image');
        referenceImageCount++;
        content.push({
          type: 'image_url',
          image_url: { url: convertImageModelFileToDataUri(reference) },
          role: 'reference_image',
        });
      } else {
        throw apiError(
          'SIFTQ_INVALID_REFERENCE_MEDIA',
          `MiniMax-H3 does not support ${reference.mediaType} references.`,
        );
      }
    }

    for (const url of siftQOptions?.referenceAudioUrls ?? []) {
      referenceAudioCount++;
      content.push({
        type: 'audio_url',
        audio_url: { url },
        role: 'reference_audio',
      });
    }

    if (referenceImageCount > MAX_REFERENCE_IMAGES) {
      throw apiError(
        'SIFTQ_TOO_MANY_REFERENCE_IMAGES',
        `MiniMax-H3 accepts at most ${MAX_REFERENCE_IMAGES} reference images.`,
      );
    }
    if (referenceVideoCount > MAX_REFERENCE_VIDEOS) {
      throw apiError(
        'SIFTQ_TOO_MANY_REFERENCE_VIDEOS',
        `MiniMax-H3 accepts at most ${MAX_REFERENCE_VIDEOS} reference videos.`,
      );
    }
    if (referenceAudioCount > MAX_REFERENCE_AUDIOS) {
      throw apiError(
        'SIFTQ_TOO_MANY_REFERENCE_AUDIOS',
        `MiniMax-H3 accepts at most ${MAX_REFERENCE_AUDIOS} reference audios.`,
      );
    }

    const optionRatio = siftQOptions?.ratio ?? undefined;
    if (
      optionRatio != null &&
      options.aspectRatio != null &&
      optionRatio !== options.aspectRatio
    ) {
      warnings.push({
        type: 'unsupported',
        feature: 'aspectRatio',
        details:
          'providerOptions.siftq.ratio takes precedence over the generic aspectRatio option.',
      });
    }
    const requestedRatio = optionRatio ?? options.aspectRatio;
    if (requestedRatio != null && !supportedRatios.has(requestedRatio)) {
      throw apiError(
        'SIFTQ_INVALID_VIDEO_RATIO',
        `MiniMax-H3 does not support the ${requestedRatio} ratio.`,
      );
    }

    const hasReferenceMode =
      referenceImageCount + referenceVideoCount + referenceAudioCount > 0;
    let ratio: string;
    if (hasFrameMode) {
      ratio = 'adaptive';
      if (requestedRatio != null && requestedRatio !== 'adaptive') {
        warnings.push({
          type: 'unsupported',
          feature: 'aspectRatio',
          details:
            'MiniMax-H3 derives frame-based output ratio from the input image. The requested ratio was ignored.',
        });
      }
    } else if (hasReferenceMode) {
      ratio = requestedRatio ?? 'adaptive';
    } else {
      ratio = requestedRatio ?? DEFAULT_TEXT_RATIO;
      if (ratio === 'adaptive') {
        throw apiError(
          'SIFTQ_INVALID_VIDEO_RATIO',
          'MiniMax-H3 text-to-video generation requires a concrete ratio.',
        );
      }
    }

    const body: Record<string, unknown> = {
      model: MODEL_ID,
      content,
      resolution: resolution ?? DEFAULT_RESOLUTION,
      duration,
      ratio,
    };
    assertRequestSize(body, this.config._internal?.maxRequestBytes);
    return { body, warnings };
  }

  async doStart(
    options: Parameters<NonNullable<VideoModelV4['doStart']>>[0],
  ): Promise<VideoModelV4OperationStartResult> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { body, warnings } = await this.buildRequestBody(options);
    if (options.webhookUrl != null) {
      let callbackUrl: URL;
      try {
        callbackUrl = new URL(options.webhookUrl);
      } catch {
        throw apiError(
          'SIFTQ_INVALID_CALLBACK_URL',
          'SiftQ callback_url must be an absolute http(s) URL.',
        );
      }
      if (
        callbackUrl.protocol !== 'http:' &&
        callbackUrl.protocol !== 'https:'
      ) {
        throw apiError(
          'SIFTQ_INVALID_CALLBACK_URL',
          'SiftQ callback_url must be an absolute http(s) URL.',
        );
      }
      body.callback_url = options.webhookUrl;
      assertRequestSize(body, this.config._internal?.maxRequestBytes);
    }

    const { value, responseHeaders } = await postJsonToApi({
      url: `${this.config.baseURL}/v2/video_generation`,
      headers: combineHeaders(
        await resolve(this.config.headers ?? {}),
        options.headers,
      ),
      body,
      failedResponseHandler: siftQFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        siftQCreateResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const taskId = value.task_id?.trim();
    if (!taskId) {
      throw apiError(
        'SIFTQ_VIDEO_GENERATION_ERROR',
        'SiftQ did not return a task_id for the video generation request.',
      );
    }

    return {
      operation: { taskId } satisfies SiftQVideoOperation,
      warnings,
      providerMetadata: { siftq: { taskId } },
      response: {
        timestamp: currentDate,
        modelId: MODEL_ID,
        headers: responseHeaders,
      },
    };
  }

  async doStatus(
    options: Parameters<NonNullable<VideoModelV4['doStatus']>>[0],
  ): Promise<VideoModelV4OperationStatusResult> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const operation = siftQOperationSchema.safeParse(options.operation);
    if (!operation.success || operation.data.taskId.trim().length === 0) {
      throw apiError(
        'SIFTQ_INVALID_VIDEO_OPERATION',
        'SiftQ video status requires an operation containing a non-empty taskId.',
      );
    }

    const taskId = operation.data.taskId;
    const headers = combineHeaders(
      await resolve(this.config.headers ?? {}),
      options.headers,
    );
    const { value, responseHeaders } = await getFromApi({
      url: `${this.config.baseURL}/v2/query/video_generation/${encodeURIComponent(taskId)}`,
      validateUrl: false,
      headers,
      failedResponseHandler: siftQFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        siftQStatusResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const task = value.task;
    const response = {
      timestamp: currentDate,
      modelId: MODEL_ID,
      headers: responseHeaders,
    };
    const providerMetadata = {
      siftq: {
        taskId,
        status: task.status,
        ...(task.task_type != null ? { taskType: task.task_type } : {}),
        ...(task.modality != null ? { modality: task.modality } : {}),
        ...(task.resolution != null ? { resolution: task.resolution } : {}),
        ...(task.duration != null ? { duration: task.duration } : {}),
        ...(task.ratio != null ? { ratio: task.ratio } : {}),
        ...(task.usage != null ? { usage: task.usage } : {}),
      },
    };

    if (task.status === 'queued' || task.status === 'running') {
      return { status: 'pending', providerMetadata, response };
    }

    if (task.status === 'failed' || task.status === 'cancelled') {
      const reason =
        task.error?.message ??
        task.error?.code ??
        (task.status === 'cancelled'
          ? 'The task was cancelled.'
          : 'The task failed without an error message.');
      return {
        status: 'error',
        error: `SiftQ video generation ${task.status}. Task ID: ${taskId}. ${reason}`,
        providerMetadata,
        response,
      };
    }

    const downloadUrl = task.content?.url?.trim();
    if (!downloadUrl) {
      throw apiError(
        'SIFTQ_VIDEO_GENERATION_ERROR',
        `SiftQ succeeded task ${taskId} without task.content.url.`,
      );
    }

    const { value: videoData, responseHeaders: downloadHeaders } =
      await getFromApi({
        url: downloadUrl,
        validateUrl: true,
        trustedOrigin: this.config.baseURL,
        credentialedOrigin: this.config.baseURL,
        headers,
        failedResponseHandler: siftQFailedResponseHandler,
        successfulResponseHandler: createBinaryResponseHandler(),
        abortSignal: options.abortSignal,
        fetch: this.config.fetch,
      });

    if (videoData.byteLength === 0) {
      throw apiError(
        'SIFTQ_EMPTY_VIDEO_RESULT',
        `SiftQ returned an empty video for task ${taskId}.`,
      );
    }

    const contentType = downloadHeaders?.['content-type']?.split(';', 1)[0];
    const detectedMediaType = detectMediaType({
      data: videoData,
      topLevelType: 'video',
    });
    const mediaType =
      contentType?.startsWith('video/') === true
        ? contentType
        : detectedMediaType;
    if (mediaType == null) {
      throw apiError(
        'SIFTQ_INVALID_VIDEO_RESULT',
        `SiftQ returned a non-video result for task ${taskId}${
          contentType == null ? '' : ` (content-type: ${contentType})`
        }.`,
      );
    }

    return {
      status: 'completed',
      videos: [{ type: 'binary', data: videoData, mediaType }],
      warnings: [],
      providerMetadata: {
        siftq: { ...providerMetadata.siftq, downloadUrl },
      },
      response: {
        ...response,
        headers: downloadHeaders ?? responseHeaders,
      },
    };
  }
}

const siftQOperationSchema = z.object({
  taskId: z.string(),
});

const siftQCreateResponseSchema = z.object({
  task_id: z.string().nullish(),
});

const siftQUsageSchema = z
  .object({
    total_seconds: z.number().nullish(),
    input_seconds: z.number().nullish(),
    output_seconds: z.number().nullish(),
    input_image_count: z.number().nullish(),
  })
  .nullish();

const siftQStatusResponseSchema = z.object({
  task: z.object({
    id: z.string().nullish(),
    model: z.string().nullish(),
    status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']),
    error: z
      .object({
        code: z.string().nullish(),
        message: z.string().nullish(),
      })
      .nullish(),
    created_at: z.number().nullish(),
    updated_at: z.number().nullish(),
    content: z
      .object({
        url: z.string().nullish(),
      })
      .nullish(),
    resolution: z.string().nullish(),
    duration: z.number().nullish(),
    ratio: z.string().nullish(),
    task_type: z
      .enum(['generation', 'h3_context_ir', 'regeneration'])
      .nullish(),
    modality: z.enum(['video', 'text']).nullish(),
    usage: siftQUsageSchema,
  }),
});

const siftQErrorSchema = z.object({
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

const siftQFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: siftQErrorSchema,
  errorToMessage: data => data.error?.message ?? 'SiftQ API request failed',
});
