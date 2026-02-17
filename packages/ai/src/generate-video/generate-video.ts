import type {
  Experimental_VideoModelV3,
  Experimental_VideoModelV3CallOptions,
  Experimental_VideoModelV3File,
  Experimental_VideoModelV3StatusResult,
  Experimental_VideoModelV3Webhook,
  SharedV3ProviderMetadata,
} from '@ai-sdk/provider';
import {
  convertBase64ToUint8Array,
  delay,
  type DataContent,
  type ProviderOptions,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { NoVideoGeneratedError } from '../error/no-video-generated-error';
import {
  DefaultGeneratedFile,
  type GeneratedFile,
} from '../generate-text/generated-file';
import { logWarnings } from '../logger/log-warnings';
import { resolveVideoModel } from '../model/resolve-model';
import type { VideoModel } from '../types/video-model';
import type { VideoModelResponseMetadata } from '../types/video-model-response-metadata';
import type { Warning } from '../types/warning';
import {
  detectMediaType,
  imageMediaTypeSignatures,
  videoMediaTypeSignatures,
} from '../util/detect-media-type';
import { createDownload } from '../util/download/create-download';
import { prepareRetries } from '../util/prepare-retries';
import { VERSION } from '../version';
import type { GenerateVideoResult } from './generate-video-result';
import { splitDataUrl } from '../prompt/split-data-url';

export type GenerateVideoPrompt =
  | string
  | {
      image: DataContent;
      text?: string;
    };

/**
 * Generates videos using a video model.
 *
 * @param model - The video model to use.
 * @param prompt - The prompt that should be used to generate the video.
 * @param n - Number of videos to generate. Default: 1.
 * @param aspectRatio - Aspect ratio of the videos to generate. Must have the format `{width}:{height}`.
 * @param resolution - Resolution of the videos to generate. Must have the format `{width}x{height}`.
 * @param duration - Duration of the video in seconds.
 * @param fps - Frames per second for the video.
 * @param seed - Seed for the video generation.
 * @param providerOptions - Additional provider-specific options that are passed through to the provider
 * as body parameters.
 * @param maxRetries - Maximum number of retries. Set to 0 to disable retries. Default: 2.
 * @param abortSignal - An optional abort signal that can be used to cancel the call.
 * @param headers - Additional HTTP headers to be sent with the request. Only applicable for HTTP-based providers.
 * @param poll - Polling configuration for models that support the start/status flow.
 * @param webhook - Webhook factory for models that support the start/status flow.
 *
 * @returns A result object that contains the generated videos.
 */
const defaultDownload = createDownload();

export async function experimental_generateVideo({
  model: modelArg,
  prompt: promptArg,
  n = 1,
  maxVideosPerCall,
  aspectRatio,
  resolution,
  duration,
  fps,
  seed,
  providerOptions,
  maxRetries: maxRetriesArg,
  abortSignal,
  headers,
  download: downloadFn = defaultDownload,
  poll,
  webhook,
}: {
  /**
   * The video model to use.
   */
  model: VideoModel;

  /**
   * The prompt that should be used to generate the video.
   */
  prompt: GenerateVideoPrompt;

  /**
   * Number of videos to generate.
   */
  n?: number;

  /**
   * Maximum number of videos per API call. If not provided, the model's default will be used.
   */
  maxVideosPerCall?: number;

  /**
   * Aspect ratio of the videos to generate. Must have the format `{width}:{height}`.
   */
  aspectRatio?: `${number}:${number}`;

  /**
   * Resolution of the videos to generate. Must have the format `{width}x${number}`.
   */
  resolution?: `${number}x${number}`;

  /**
   * Duration of the video in seconds.
   */
  duration?: number;

  /**
   * Frames per second for the video.
   */
  fps?: number;

  /**
   * Seed for the video generation.
   */
  seed?: number;

  /**
   * Additional provider-specific options that are passed through to the provider
   * as body parameters.
   */
  providerOptions?: ProviderOptions;

  /**
   * Maximum number of retries per video model call. Set to 0 to disable retries.
   *
   * @default 2
   */
  maxRetries?: number;

  /**
   * Abort signal.
   */
  abortSignal?: AbortSignal;

  /**
   * Additional headers to include in the request.
   * Only applicable for HTTP-based providers.
   */
  headers?: Record<string, string>;

  /**
   * Custom download function for fetching videos from URLs.
   * Use `createDownload()` from `ai` to create a download function with custom size limits.
   *
   * @default createDownload() (2 GiB limit)
   */
  download?: (options: {
    url: URL;
    abortSignal?: AbortSignal;
  }) => Promise<{ data: Uint8Array; mediaType: string | undefined }>;

  /**
   * Polling configuration for models that support the asynchronous
   * start/status flow. When provided and the model implements `doStart`
   * and `doStatus`, the SDK will orchestrate polling automatically.
   */
  poll?: {
    /**
     * Interval between status checks in milliseconds.
     *
     * @default 5000
     */
    intervalMs?: number;

    /**
     * Backoff strategy for polling.
     * - `'none'`: Fixed interval between polls.
     * - `'exponential'`: Doubles the interval after each poll, capped at 60 seconds.
     *
     * @default 'none'
     */
    backoff?: 'none' | 'exponential';

    /**
     * Maximum time to wait for completion in milliseconds.
     *
     * @default 600000 (10 minutes)
     */
    timeoutMs?: number;

    /**
     * Callback invoked before each poll attempt.
     */
    onAttempt?: (event: {
      attempt: number;
      elapsedMs: number;
    }) => void | PromiseLike<void>;
  };

  /**
   * Webhook factory for models that support the asynchronous
   * start/status flow. When provided and the model implements `doStart`
   * and `doStatus`, the SDK will use webhooks instead of polling.
   *
   * The factory should return a URL for the provider to send notifications to,
   * and a `received` promise that resolves when the notification arrives.
   */
  webhook?: () => PromiseLike<{
    url: string;
    received: Promise<Experimental_VideoModelV3Webhook>;
  }>;
}): Promise<GenerateVideoResult> {
  const model = resolveVideoModel(modelArg);

  const headersWithUserAgent = withUserAgentSuffix(
    headers ?? {},
    `ai/${VERSION}`,
  );

  const { retry } = prepareRetries({
    maxRetries: maxRetriesArg,
    abortSignal,
  });

  const { prompt, image } = normalizePrompt(promptArg);

  const maxVideosPerCallWithDefault =
    maxVideosPerCall ?? (await invokeModelMaxVideosPerCall(model)) ?? 1;

  // Determine whether to use start/status flow:
  const hasStartStatus = model.doStart != null && model.doStatus != null;
  const useStartStatus =
    hasStartStatus &&
    (poll != null || webhook != null || model.doGenerate == null);

  // Validate model capabilities
  if (model.doGenerate == null && !hasStartStatus) {
    throw new Error(
      `Video model ${model.modelId} does not implement doGenerate or doStart/doStatus.`,
    );
  }

  // Warn if poll/webhook provided but model doesn't support start/status
  if ((poll != null || webhook != null) && !hasStartStatus) {
    logWarnings({
      warnings: [
        {
          type: 'other',
          message:
            'poll/webhook options were provided but the model does not support doStart/doStatus. Falling back to doGenerate.',
        },
      ],
      provider: model.provider,
      model: model.modelId,
    });
  }

  // parallelize calls to the model:
  const callCount = Math.ceil(n / maxVideosPerCallWithDefault);
  const callVideoCounts = Array.from({ length: callCount }, (_, index) => {
    const remaining = n - index * maxVideosPerCallWithDefault;
    return Math.min(remaining, maxVideosPerCallWithDefault);
  });

  const results = await Promise.all(
    callVideoCounts.map(async callVideoCount => {
      const callOptions: Experimental_VideoModelV3CallOptions = {
        prompt,
        n: callVideoCount,
        aspectRatio,
        resolution,
        duration,
        fps,
        seed,
        image,
        providerOptions: providerOptions ?? {},
        headers: headersWithUserAgent,
        abortSignal,
      };

      if (useStartStatus) {
        return retry(() =>
          executeStartStatusFlow({
            model,
            callOptions,
            poll,
            webhook,
            abortSignal,
            headers: headersWithUserAgent,
          }),
        );
      }

      return retry(() => model.doGenerate!(callOptions));
    }),
  );

  // collect result videos, warnings, and response metadata
  const videos: Array<GeneratedFile> = [];
  const warnings: Array<Warning> = [];
  const responses: Array<VideoModelResponseMetadata> = [];
  const providerMetadata: SharedV3ProviderMetadata = {};

  for (const result of results) {
    for (const videoData of result.videos) {
      switch (videoData.type) {
        case 'url': {
          const { data, mediaType: downloadedMediaType } = await downloadFn({
            url: new URL(videoData.url),
            abortSignal,
          });

          // Filter out generic/unknown media types that should fall through to detection
          const isUsableMediaType = (type: string | undefined): boolean =>
            !!type && type !== 'application/octet-stream';

          const mediaType =
            (isUsableMediaType(videoData.mediaType) && videoData.mediaType) ||
            (isUsableMediaType(downloadedMediaType) && downloadedMediaType) ||
            detectMediaType({
              data,
              signatures: videoMediaTypeSignatures,
            }) ||
            'video/mp4';

          videos.push(
            new DefaultGeneratedFile({
              data,
              mediaType,
            }),
          );
          break;
        }

        case 'base64': {
          videos.push(
            new DefaultGeneratedFile({
              data: videoData.data,
              mediaType: videoData.mediaType || 'video/mp4',
            }),
          );
          break;
        }

        case 'binary': {
          const mediaType =
            videoData.mediaType ||
            detectMediaType({
              data: videoData.data,
              signatures: videoMediaTypeSignatures,
            }) ||
            'video/mp4';

          videos.push(
            new DefaultGeneratedFile({
              data: videoData.data,
              mediaType,
            }),
          );
          break;
        }
      }
    }

    warnings.push(...result.warnings);

    responses.push({
      timestamp: result.response.timestamp,
      modelId: result.response.modelId,
      headers: result.response.headers,
      providerMetadata: result.providerMetadata,
    });

    if (result.providerMetadata != null) {
      for (const [providerName, metadata] of Object.entries(
        result.providerMetadata,
      )) {
        const existingMetadata = providerMetadata[providerName];
        if (existingMetadata != null && typeof existingMetadata === 'object') {
          providerMetadata[providerName] = {
            ...existingMetadata,
            ...metadata,
          };

          // Merge videos arrays if both exist
          if (
            'videos' in existingMetadata &&
            Array.isArray(existingMetadata.videos) &&
            'videos' in metadata &&
            Array.isArray(metadata.videos)
          ) {
            (providerMetadata[providerName] as { videos: unknown[] }).videos = [
              ...existingMetadata.videos,
              ...metadata.videos,
            ];
          }
        } else {
          providerMetadata[providerName] = metadata;
        }
      }
    }
  }

  if (videos.length === 0) {
    throw new NoVideoGeneratedError({ responses });
  }

  if (warnings.length > 0) {
    logWarnings({
      warnings,
      provider: model.provider,
      model: model.modelId,
    });
  }

  return {
    video: videos[0],
    videos,
    warnings,
    responses,
    providerMetadata,
  };
}

async function executeStartStatusFlow({
  model,
  callOptions,
  poll: pollConfig,
  webhook: webhookFactory,
  abortSignal,
  headers,
}: {
  model: Experimental_VideoModelV3;
  callOptions: Experimental_VideoModelV3CallOptions;
  poll?: {
    intervalMs?: number;
    backoff?: 'none' | 'exponential';
    timeoutMs?: number;
    onAttempt?: (event: {
      attempt: number;
      elapsedMs: number;
    }) => void | PromiseLike<void>;
  };
  webhook?: () => PromiseLike<{
    url: string;
    received: Promise<Experimental_VideoModelV3Webhook>;
  }>;
  abortSignal?: AbortSignal;
  headers?: Record<string, string | undefined>;
}): Promise<{
  videos: Awaited<
    ReturnType<NonNullable<Experimental_VideoModelV3['doGenerate']>>
  >['videos'];
  warnings: Awaited<
    ReturnType<NonNullable<Experimental_VideoModelV3['doGenerate']>>
  >['warnings'];
  providerMetadata?: SharedV3ProviderMetadata;
  response: Awaited<
    ReturnType<NonNullable<Experimental_VideoModelV3['doGenerate']>>
  >['response'];
}> {
  // 1. If webhook, get the webhook URL and received promise
  let webhookUrl: string | undefined;
  let webhookReceived: Promise<Experimental_VideoModelV3Webhook> | undefined;

  if (webhookFactory != null) {
    const { url, received } = await webhookFactory();
    webhookUrl = url;
    webhookReceived = received;
  }

  // 2. Start the generation
  const startResult = await model.doStart!({
    ...callOptions,
    webhookUrl,
  });

  const allWarnings = [...startResult.warnings];

  let completedResult: Extract<
    Experimental_VideoModelV3StatusResult,
    { status: 'completed' }
  >;

  if (webhookReceived != null) {
    // 3a. Webhook flow: wait for webhook, then get final status
    await webhookReceived;

    const statusResult = await model.doStatus!({
      operation: startResult.operation,
      abortSignal,
      headers,
    });

    if (statusResult.status !== 'completed') {
      throw new Error(
        'Video generation did not complete after webhook notification.',
      );
    }

    completedResult = statusResult;
  } else {
    // 3b. Polling flow
    completedResult = await pollUntilComplete({
      model,
      operation: startResult.operation,
      pollConfig,
      abortSignal,
      headers,
    });
  }

  if (completedResult.warnings != null) {
    allWarnings.push(...completedResult.warnings);
  }

  return {
    videos: completedResult.videos,
    warnings: allWarnings,
    providerMetadata: completedResult.providerMetadata,
    response: completedResult.response,
  };
}

async function pollUntilComplete({
  model,
  operation,
  pollConfig,
  abortSignal,
  headers,
}: {
  model: Experimental_VideoModelV3;
  operation: unknown;
  pollConfig?: {
    intervalMs?: number;
    backoff?: 'none' | 'exponential';
    timeoutMs?: number;
    onAttempt?: (event: {
      attempt: number;
      elapsedMs: number;
    }) => void | PromiseLike<void>;
  };
  abortSignal?: AbortSignal;
  headers?: Record<string, string | undefined>;
}): Promise<
  Extract<Experimental_VideoModelV3StatusResult, { status: 'completed' }>
> {
  const baseInterval = pollConfig?.intervalMs ?? 5000;
  const backoff = pollConfig?.backoff ?? 'none';
  const timeoutMs = pollConfig?.timeoutMs ?? 600_000;
  const onAttempt = pollConfig?.onAttempt;

  const startTime = Date.now();
  let attempt = 0;

  while (true) {
    const elapsedMs = Date.now() - startTime;

    if (elapsedMs >= timeoutMs) {
      throw new Error(`Video generation timed out after ${timeoutMs}ms.`);
    }

    // Calculate delay for this attempt
    const intervalMs =
      backoff === 'exponential'
        ? Math.min(baseInterval * Math.pow(2, attempt), 60_000)
        : baseInterval;

    await delay(intervalMs, { abortSignal });

    attempt++;

    if (onAttempt != null) {
      await onAttempt({ attempt, elapsedMs: Date.now() - startTime });
    }

    const statusResult = await model.doStatus!({
      operation,
      abortSignal,
      headers,
    });

    if (statusResult.status === 'completed') {
      return statusResult;
    }
  }
}

function normalizePrompt(promptArg: GenerateVideoPrompt): {
  prompt: string | undefined;
  image: Experimental_VideoModelV3File | undefined;
} {
  if (typeof promptArg === 'string') {
    return {
      prompt: promptArg,
      image: undefined,
    };
  }

  let image: Experimental_VideoModelV3File | undefined;

  if (promptArg.image != null) {
    const dataContent = promptArg.image;

    if (typeof dataContent === 'string') {
      if (
        dataContent.startsWith('http://') ||
        dataContent.startsWith('https://')
      ) {
        image = {
          type: 'url',
          url: dataContent,
        };
      } else if (dataContent.startsWith('data:')) {
        const { mediaType, base64Content } = splitDataUrl(dataContent);
        image = {
          type: 'file',
          mediaType: mediaType ?? 'image/png',
          data: convertBase64ToUint8Array(base64Content ?? ''),
        };
      } else {
        const bytes = convertBase64ToUint8Array(dataContent);
        const mediaType =
          detectMediaType({
            data: bytes,
            signatures: imageMediaTypeSignatures,
          }) ?? 'image/png';

        image = {
          type: 'file',
          mediaType,
          data: bytes,
        };
      }
    } else if (dataContent instanceof Uint8Array) {
      const mediaType =
        detectMediaType({
          data: dataContent,
          signatures: imageMediaTypeSignatures,
        }) ?? 'image/png';

      image = {
        type: 'file',
        mediaType,
        data: dataContent,
      };
    }
  }

  return {
    prompt: promptArg.text,
    image,
  };
}

async function invokeModelMaxVideosPerCall(model: Experimental_VideoModelV3) {
  if (typeof model.maxVideosPerCall === 'function') {
    return await model.maxVideosPerCall({ modelId: model.modelId });
  }

  return model.maxVideosPerCall;
}
