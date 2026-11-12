import type {
  Experimental_VideoModelV4CallOptions as VideoModelV4CallOptions,
  Experimental_VideoModelV4File as VideoModelV4File,
  Experimental_VideoModelV4OperationStatusResult as VideoModelV4OperationStatusResult,
  JSONObject,
  SharedV4Warning,
} from '@ai-sdk/provider';
import {
  type InferSchema,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import {
  resolveFirstFrameImage,
  resolveLastFrameImage,
  resolveResolution,
  splitInputReferences,
  toUrlOrDataUri,
} from './tencent-video-inputs';
import type { TencentVideoModelOptions } from './tencent-video-model-options';
import type { TencentKlingVideoKind } from './tencent-video-settings';

const KLING_RESOLUTION_TIERS: Record<number, string> = {
  720: '720p',
  1080: '1080p',
  2160: '4k',
};

/**
 * Models whose `settings` accept only resolution, aspect ratio and duration
 * (no `audio`, no `multi_shot`).
 *
 * @see https://www.tencentcloud.com/document/product/1300/83714
 */
const KLING_MODELS_WITHOUT_AUDIO_OR_MULTI_SHOT = new Set([
  'kling-video-v4',
  'kling-video-v3-turbo',
]);

/** Standard models that also serve the omni endpoint for reference inputs. */
const KLING_STANDARD_MODELS_WITH_OMNI = new Set(['kling-video-v4']);

export type TokenHubKlingEndpoint =
  | 'text-to-video'
  | 'image-to-video'
  | 'omni-video'
  | 'motion-control';

type Content = Record<string, string>;

function compact(
  value: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function buildRequestOptions(
  tencentOptions: TencentVideoModelOptions | undefined,
): Record<string, unknown> | undefined {
  return compact({
    external_task_id: tencentOptions?.externalTaskId,
    watermark_info:
      tencentOptions?.watermark != null
        ? { enabled: tencentOptions.watermark }
        : undefined,
  });
}

function promptContent(prompt: string | undefined): Content[] {
  return prompt != null ? [{ type: 'prompt', text: prompt }] : [];
}

function elementContents(
  tencentOptions: TencentVideoModelOptions | undefined,
): Content[] {
  return (tencentOptions?.elements ?? []).map(element => ({
    type: 'element',
    element_id: element.elementId,
    ...(element.id != null ? { id: element.id } : {}),
  }));
}

export function buildTokenHubKlingRequest({
  modelId,
  kind,
  options,
  tencentOptions,
  warnings,
}: {
  modelId: string;
  kind: TencentKlingVideoKind;
  options: VideoModelV4CallOptions;
  tencentOptions: TencentVideoModelOptions | undefined;
  warnings: SharedV4Warning[];
}): { endpoint: TokenHubKlingEndpoint; body: Record<string, unknown> } {
  const firstFrame = resolveFirstFrameImage(options, warnings);
  const lastFrame = resolveLastFrameImage(options, warnings);
  const references = splitInputReferences(options);
  const resolution = resolveResolution({
    options,
    tencentOptions,
    tiers: KLING_RESOLUTION_TIERS,
    warnings,
  });

  if (references.audios.length > 0) {
    warnings.push({
      type: 'unsupported',
      feature: 'inputReferences',
      details:
        'TokenHub Kling models do not accept audio references; use ' +
        '`providerOptions.tencent.voices` instead. The audio was ignored.',
    });
  }

  if (kind === 'motion-control') {
    // The character image comes from the first frame, else the first image
    // reference; the motion comes from the first video reference.
    const [firstImageReference, ...otherImageReferences] = references.images;
    const [motionVideo, ...otherVideoReferences] = references.videos;
    const unusedImageReferences =
      firstFrame != null ? references.images : otherImageReferences;

    return {
      endpoint: 'motion-control',
      body: buildMotionControlBody({
        modelId,
        options,
        tencentOptions,
        characterImage: firstFrame ?? firstImageReference,
        motionVideo,
        lastFrame,
        extraReferenceCount:
          unusedImageReferences.length + otherVideoReferences.length,
        resolution,
        warnings,
      }),
    };
  }

  const supportsAudioAndMultiShot =
    !KLING_MODELS_WITHOUT_AUDIO_OR_MULTI_SHOT.has(modelId);
  const audio = resolveAudio({
    options,
    tencentOptions,
    supported: supportsAudioAndMultiShot,
    warnings,
  });
  const multiShot = resolveMultiShot({
    tencentOptions,
    supported: supportsAudioAndMultiShot,
    warnings,
  });

  const hasReferences =
    references.images.length > 0 ||
    references.videos.length > 0 ||
    (tencentOptions?.voices?.length ?? 0) > 0;

  // Elements work on image-to-video and omni but not text-to-video, so an
  // omni-capable model sends elements without a first frame to omni.
  const hasElementsWithoutFirstFrame =
    firstFrame == null && (tencentOptions?.elements?.length ?? 0) > 0;

  if (
    kind === 'omni' ||
    (KLING_STANDARD_MODELS_WITH_OMNI.has(modelId) &&
      (hasReferences || hasElementsWithoutFirstFrame))
  ) {
    const videoType =
      tencentOptions?.referenceVideoType === 'base'
        ? 'base_video'
        : 'feature_video';

    const contents: Content[] = [
      ...promptContent(options.prompt),
      ...(firstFrame != null
        ? [{ type: 'first_frame', url: toUrlOrDataUri(firstFrame) }]
        : []),
      ...(lastFrame != null
        ? [{ type: 'last_frame', url: toUrlOrDataUri(lastFrame) }]
        : []),
      ...references.images.map(image => ({
        type: 'refer_image',
        url: toUrlOrDataUri(image),
      })),
      ...references.videos.map(video => ({
        type: videoType,
        url: toUrlOrDataUri(video),
      })),
      ...elementContents(tencentOptions),
      ...(tencentOptions?.voices ?? []).map(voice => ({
        type: 'voice',
        voice_id: voice.voiceId,
        id: voice.id,
      })),
    ];

    return {
      endpoint: 'omni-video',
      body: withSettingsAndOptions(
        { model: modelId, contents },
        {
          resolution,
          aspect_ratio: options.aspectRatio,
          duration: options.duration,
          multi_shot: multiShot,
          audio,
        },
        tencentOptions,
      ),
    };
  }

  if (hasReferences) {
    warnings.push({
      type: 'unsupported',
      feature: 'inputReferences',
      details:
        `${modelId} does not accept reference inputs; use an omni model ` +
        'such as kling-video-v3-omni or kling-video-v4. The references were ignored.',
    });
  }

  if (firstFrame != null) {
    if (options.aspectRatio != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'aspectRatio',
        details:
          'TokenHub Kling image-to-video follows the aspect ratio of the input image.',
      });
    }

    const contents: Content[] = [
      ...promptContent(options.prompt),
      { type: 'first_frame', url: toUrlOrDataUri(firstFrame) },
      ...(lastFrame != null
        ? [{ type: 'last_frame', url: toUrlOrDataUri(lastFrame) }]
        : []),
      ...elementContents(tencentOptions),
    ];

    return {
      endpoint: 'image-to-video',
      body: withSettingsAndOptions(
        { model: modelId, contents },
        {
          resolution,
          duration: options.duration,
          multi_shot: multiShot,
          audio,
        },
        tencentOptions,
      ),
    };
  }

  if (lastFrame != null) {
    warnings.push({
      type: 'unsupported',
      feature: 'frameImages',
      details:
        'TokenHub Kling does not support a last frame without a first frame; ' +
        'the last frame was ignored.',
    });
  }

  if ((tencentOptions?.elements?.length ?? 0) > 0) {
    warnings.push({
      type: 'unsupported',
      feature: 'providerOptions.tencent.elements',
      details:
        'TokenHub Kling text-to-video does not accept elements; the elements were ignored.',
    });
  }

  return {
    endpoint: 'text-to-video',
    body: withSettingsAndOptions(
      {
        model: modelId,
        ...(options.prompt != null ? { prompt: options.prompt } : {}),
      },
      {
        resolution,
        aspect_ratio: options.aspectRatio,
        duration: options.duration,
        multi_shot: multiShot,
        audio,
      },
      tencentOptions,
    ),
  };
}

function withSettingsAndOptions(
  body: Record<string, unknown>,
  settings: Record<string, unknown>,
  tencentOptions: TencentVideoModelOptions | undefined,
): Record<string, unknown> {
  const compactSettings = compact(settings);
  const requestOptions = buildRequestOptions(tencentOptions);
  return {
    ...body,
    ...(compactSettings != null ? { settings: compactSettings } : {}),
    ...(requestOptions != null ? { options: requestOptions } : {}),
  };
}

function resolveAudio({
  options,
  tencentOptions,
  supported,
  warnings,
}: {
  options: VideoModelV4CallOptions;
  tencentOptions: TencentVideoModelOptions | undefined;
  supported: boolean;
  warnings: SharedV4Warning[];
}): string | undefined {
  const audio =
    tencentOptions?.audio ??
    (options.generateAudio != null
      ? options.generateAudio
        ? 'native'
        : 'off'
      : undefined);

  if (audio != null && !supported) {
    warnings.push({
      type: 'unsupported',
      feature: 'generateAudio',
      details: 'This TokenHub Kling model does not support the audio setting.',
    });
    return undefined;
  }

  return audio;
}

function resolveMultiShot({
  tencentOptions,
  supported,
  warnings,
}: {
  tencentOptions: TencentVideoModelOptions | undefined;
  supported: boolean;
  warnings: SharedV4Warning[];
}): boolean | undefined {
  if (tencentOptions?.multiShot != null && !supported) {
    warnings.push({
      type: 'unsupported',
      feature: 'providerOptions.tencent.multiShot',
      details: 'This TokenHub Kling model does not support multi-shot output.',
    });
    return undefined;
  }
  return tencentOptions?.multiShot;
}

function buildMotionControlBody({
  modelId,
  options,
  tencentOptions,
  characterImage,
  motionVideo,
  lastFrame,
  extraReferenceCount,
  resolution,
  warnings,
}: {
  modelId: string;
  options: VideoModelV4CallOptions;
  tencentOptions: TencentVideoModelOptions | undefined;
  characterImage: VideoModelV4File | undefined;
  motionVideo: VideoModelV4File | undefined;
  lastFrame: VideoModelV4File | undefined;
  extraReferenceCount: number;
  resolution: string | undefined;
  warnings: SharedV4Warning[];
}): Record<string, unknown> {
  for (const [feature, value, details] of [
    [
      'duration',
      options.duration,
      'Motion control output follows the length of the motion reference video.',
    ],
    [
      'aspectRatio',
      options.aspectRatio,
      'Motion control output follows the aspect ratio of the input media.',
    ],
    [
      'frameImages',
      lastFrame,
      'Motion control does not support a last frame; it was ignored.',
    ],
  ] as const) {
    if (value != null) {
      warnings.push({ type: 'unsupported', feature, details });
    }
  }

  if (extraReferenceCount > 0) {
    warnings.push({
      type: 'unsupported',
      feature: 'inputReferences',
      details:
        'Motion control uses one character image and one motion reference video; ' +
        'additional references were ignored.',
    });
  }

  const audio =
    tencentOptions?.audio ??
    (options.generateAudio === false ? 'off' : undefined);

  const contents: Content[] = [
    ...promptContent(options.prompt),
    ...(characterImage != null
      ? [{ type: 'image', url: toUrlOrDataUri(characterImage) }]
      : []),
    ...(motionVideo != null
      ? [{ type: 'video', url: toUrlOrDataUri(motionVideo) }]
      : []),
    ...elementContents(tencentOptions),
  ];

  return withSettingsAndOptions(
    { model: modelId, contents },
    {
      character_orientation: tencentOptions?.characterOrientation,
      audio,
      resolution,
    },
    tencentOptions,
  );
}

export const tokenHubKlingCreateResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      code: z.union([z.number(), z.string()]).nullish(),
      message: z.string().nullish(),
      request_id: z.string().nullish(),
      data: z
        .object({
          id: z.string().nullish(),
          status: z.string().nullish(),
        })
        .nullish(),
    }),
  ),
);

export const tokenHubKlingStatusResponseSchema = lazySchema(() => {
  const taskSchema = z.object({
    id: z.string().nullish(),
    status: z.string().nullish(),
    message: z.string().nullish(),
    outputs: z
      .array(
        z.object({
          type: z.string().nullish(),
          id: z.string().nullish(),
          url: z.string().nullish(),
          duration: z.union([z.string(), z.number()]).nullish(),
        }),
      )
      .nullish(),
  });

  return zodSchema(
    z.object({
      code: z.union([z.number(), z.string()]).nullish(),
      message: z.string().nullish(),
      request_id: z.string().nullish(),
      // The guide documents an array; a single task object is accepted too.
      data: z.union([z.array(taskSchema), taskSchema]).nullish(),
      tokenhub_usage: z
        .object({ total_tokens: z.number().nullish() })
        .nullish(),
    }),
  );
});

type TokenHubKlingStatusResponse = InferSchema<
  typeof tokenHubKlingStatusResponseSchema
>;

type StatusResponseMetadata = {
  timestamp: Date;
  modelId: string;
  headers: Record<string, string> | undefined;
};

export function interpretTokenHubKlingStatus({
  statusResponse,
  taskId,
  response,
}: {
  statusResponse: TokenHubKlingStatusResponse;
  taskId: string;
  response: StatusResponseMetadata;
}): VideoModelV4OperationStatusResult {
  const task = Array.isArray(statusResponse.data)
    ? (statusResponse.data.find(entry => entry.id === taskId) ??
      statusResponse.data[0])
    : statusResponse.data;

  if (task?.status === 'succeeded') {
    const outputs = (task.outputs ?? []).filter(
      output => output.url != null && (output.type ?? 'video') === 'video',
    );

    if (outputs.length === 0) {
      return {
        status: 'error',
        error: `TokenHub Kling task ${taskId} succeeded without a video URL.`,
        response,
      };
    }

    const videos: JSONObject[] = outputs.map(output => {
      // TokenHub reports the duration as a string; VOD reports a number.
      const duration =
        output.duration == null || output.duration === ''
          ? undefined
          : Number(output.duration);
      return {
        ...(output.id != null ? { id: output.id } : {}),
        url: output.url as string,
        ...(duration != null && Number.isFinite(duration) ? { duration } : {}),
      };
    });

    const totalTokens = statusResponse.tokenhub_usage?.total_tokens;

    return {
      status: 'completed',
      videos: outputs.map(output => ({
        type: 'url' as const,
        url: output.url as string,
        mediaType: 'video/mp4',
      })),
      warnings: [],
      response,
      providerMetadata: {
        tencent: {
          taskId,
          videos,
          ...(statusResponse.request_id != null
            ? { requestId: statusResponse.request_id }
            : {}),
          ...(totalTokens != null ? { usage: { totalTokens } } : {}),
        },
      },
    };
  }

  if (task?.status === 'failed') {
    return {
      status: 'error',
      error: `Video generation failed: ${task.message || 'unknown error'} (task ${taskId})`,
      response,
    };
  }

  return { status: 'pending', response };
}
