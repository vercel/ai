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
  getFileBase64,
  isAudioFile,
  isVideoFile,
  resolveFirstFrameImage,
  resolveLastFrameImage,
  resolveResolution,
} from './tencent-video-inputs';
import type { TencentVideoModelOptions } from './tencent-video-model-options';

export const TENCENT_VOD_SERVICE = 'vod';
export const TENCENT_VOD_VERSION = '2018-07-17';

const VOD_RESOLUTION_TIERS: Record<number, string> = {
  480: '480P',
  720: '720P',
  1080: '1080P',
  1440: '2K',
  2160: '4K',
};

function enabledDisabled(value: boolean | undefined): string | undefined {
  return value == null ? undefined : value ? 'Enabled' : 'Disabled';
}

function compact(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  );
}

function toVodFileInfo(file: VideoModelV4File): Record<string, string> {
  return file.type === 'url'
    ? { Type: 'Url', Url: file.url }
    : { Type: 'Base64', Base64: getFileBase64(file) };
}

/**
 * Builds the `CreateAigcVideoTask` request body.
 *
 * @see https://www.tencentcloud.com/document/api/266/76684
 */
export function buildVodCreateTaskBody({
  modelName,
  modelVersion,
  subAppId,
  options,
  tencentOptions,
  warnings,
}: {
  modelName: string;
  modelVersion: string;
  subAppId: number;
  options: VideoModelV4CallOptions;
  tencentOptions: TencentVideoModelOptions | undefined;
  warnings: SharedV4Warning[];
}): Record<string, unknown> {
  const fileInfos: Array<Record<string, string>> = [];

  const firstFrame = resolveFirstFrameImage(options, warnings);
  if (firstFrame != null) {
    fileInfos.push({
      ...toVodFileInfo(firstFrame),
      Category: 'Image',
      Usage: 'FirstFrame',
    });
  }

  const lastFrame = resolveLastFrameImage(options, warnings);
  if (lastFrame != null) {
    fileInfos.push({
      ...toVodFileInfo(lastFrame),
      Category: 'Image',
      Usage: 'LastFrame',
    });
  }

  for (const reference of options.inputReferences ?? []) {
    const category = isVideoFile(reference)
      ? 'Video'
      : isAudioFile(reference)
        ? 'Audio'
        : 'Image';

    fileInfos.push({
      ...toVodFileInfo(reference),
      Category: category,
      Usage: 'Reference',
      ...(category === 'Video' && tencentOptions?.referenceVideoType != null
        ? { ReferenceType: tencentOptions.referenceVideoType }
        : {}),
    });
  }

  const outputConfig = compact({
    StorageMode: 'Temporary',
    Resolution: resolveResolution({
      options,
      tencentOptions,
      tiers: VOD_RESOLUTION_TIERS,
      warnings,
    }),
    AspectRatio: options.aspectRatio,
    Duration: options.duration,
    AudioGeneration: enabledDisabled(options.generateAudio),
    PersonGeneration: tencentOptions?.personGeneration,
    InputComplianceCheck: enabledDisabled(tencentOptions?.inputComplianceCheck),
    OutputComplianceCheck: enabledDisabled(
      tencentOptions?.outputComplianceCheck,
    ),
    EnhanceSwitch: enabledDisabled(tencentOptions?.enhanceSwitch),
    OffPeak: enabledDisabled(tencentOptions?.offPeak),
    LogoAdd: enabledDisabled(tencentOptions?.watermark),
  });

  return compact({
    SubAppId: subAppId,
    ModelName: modelName,
    ModelVersion: modelVersion,
    Prompt: options.prompt,
    NegativePrompt: tencentOptions?.negativePrompt,
    EnhancePrompt: enabledDisabled(tencentOptions?.enhancePrompt),
    FileInfos: fileInfos.length > 0 ? fileInfos : undefined,
    OutputConfig: outputConfig,
    InputRegion: tencentOptions?.inputRegion,
    SceneType: tencentOptions?.sceneType,
    Seed: options.seed,
    SessionId: tencentOptions?.sessionId,
    SessionContext: tencentOptions?.sessionContext,
    TasksPriority: tencentOptions?.tasksPriority,
    ExtInfo: tencentOptions?.extInfo,
  });
}

export const vodCreateTaskResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      TaskId: z.string(),
      RequestId: z.string().nullish(),
    }),
  ),
);

export const vodDescribeTaskDetailResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      TaskType: z.string().nullish(),
      Status: z.string().nullish(),
      RequestId: z.string().nullish(),
      AigcVideoTask: z
        .object({
          TaskId: z.string().nullish(),
          Status: z.string().nullish(),
          ErrCode: z.number().nullish(),
          ErrCodeExt: z.string().nullish(),
          Message: z.string().nullish(),
          Progress: z.number().nullish(),
          Output: z
            .object({
              FileInfos: z
                .array(
                  z.object({
                    FileUrl: z.string().nullish(),
                    FileType: z.string().nullish(),
                    FileId: z.string().nullish(),
                    MetaData: z
                      .object({ Duration: z.number().nullish() })
                      .nullish(),
                  }),
                )
                .nullish(),
              Usage: z
                .object({
                  InputTokens: z.number().nullish(),
                  ThoughtTokens: z.number().nullish(),
                  InputImageCount: z.number().nullish(),
                  InputSeconds: z.number().nullish(),
                  OutputSeconds: z.number().nullish(),
                  TotalSeconds: z.number().nullish(),
                })
                .nullish(),
            })
            .nullish(),
        })
        .nullish(),
    }),
  ),
);

type VodDescribeTaskDetailResponse = InferSchema<
  typeof vodDescribeTaskDetailResponseSchema
>;

const VOD_FILE_TYPE_MEDIA_TYPES: Record<string, string> = {
  mov: 'video/quicktime',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

function compactJson(value: Record<string, unknown>): JSONObject {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v != null),
  ) as JSONObject;
}

/**
 * Interprets a `DescribeTaskDetail` response for an AIGC video task.
 *
 * @see https://www.tencentcloud.com/document/api/266/34129
 */
export function interpretVodTaskDetail({
  detail,
  taskId,
  response,
}: {
  detail: VodDescribeTaskDetailResponse;
  taskId: string;
  response: {
    timestamp: Date;
    modelId: string;
    headers: Record<string, string> | undefined;
  };
}): VideoModelV4OperationStatusResult {
  const task = detail.AigcVideoTask;

  if (detail.Status === 'ABORTED') {
    return {
      status: 'error',
      error: `Video generation aborted (task ${taskId})`,
      response,
    };
  }

  if (detail.Status !== 'FINISH') {
    return { status: 'pending', response };
  }

  if (task?.ErrCode != null && task.ErrCode !== 0) {
    const code = task.ErrCodeExt || String(task.ErrCode);
    return {
      status: 'error',
      error: `Video generation failed (${code}): ${task.Message || 'unknown error'} (task ${taskId})`,
      response,
    };
  }

  const files = (task?.Output?.FileInfos ?? []).filter(
    file => file.FileUrl != null,
  );

  if (files.length === 0) {
    return {
      status: 'error',
      error: `VOD task ${taskId} finished without a video URL.`,
      response,
    };
  }

  const usage = task?.Output?.Usage;

  return {
    status: 'completed',
    videos: files.map(file => ({
      type: 'url' as const,
      url: file.FileUrl as string,
      mediaType:
        VOD_FILE_TYPE_MEDIA_TYPES[file.FileType?.toLowerCase() ?? ''] ??
        'video/mp4',
    })),
    warnings: [],
    response,
    providerMetadata: {
      tencent: compactJson({
        taskId,
        requestId: detail.RequestId,
        videos: files.map(file =>
          compactJson({
            url: file.FileUrl,
            // Temporary storage reports an empty FileId.
            fileId: file.FileId || undefined,
            duration: file.MetaData?.Duration ?? usage?.OutputSeconds,
          }),
        ),
        usage:
          usage != null
            ? compactJson({
                inputImageCount: usage.InputImageCount,
                inputSeconds: usage.InputSeconds,
                inputTokens: usage.InputTokens,
                outputSeconds: usage.OutputSeconds,
                thoughtTokens: usage.ThoughtTokens,
                totalSeconds: usage.TotalSeconds,
              })
            : undefined,
      }),
    },
  };
}
