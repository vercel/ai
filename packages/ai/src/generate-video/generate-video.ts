import type {
  Experimental_VideoModelV4,
  Experimental_VideoModelV4CallOptions,
  Experimental_VideoModelV4File,
  Experimental_VideoModelV4Result,
  Experimental_VideoModelV4OperationStatusResult,
  Experimental_VideoModelV4OperationWebhook,
  SharedV4ProviderMetadata,
} from '@ai-sdk/provider';
import {
  convertBase64ToUint8Array,
  delay,
  withUserAgentSuffix,
  type DataContent,
  detectMediaType,
  type ProviderOptions,
} from '@ai-sdk/provider-utils';
import { NoVideoGeneratedError } from '../error/no-video-generated-error';
import {
  DefaultGeneratedFile,
  type GeneratedFile,
} from '../generate-text/generated-file';
import { logWarnings } from '../logger/log-warnings';
import { mergeAbortSignals } from '../util/merge-abort-signals';
import { resolveVideoModel } from '../model/resolve-model';
import type { VideoModel } from '../types/video-model';
import type { VideoModelResponseMetadata } from '../types/video-model-response-metadata';
import type { Warning } from '../types/warning';
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
 * Polling configuration for models that support the asynchronous
 * start/status flow.
 */
export type GenerateVideoPollOptions = {
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
 * Webhook factory for models that support the asynchronous start/status flow.
 *
 * The factory should return a URL for the provider to send notifications to,
 * and a `received` promise that resolves when the notification arrives.
 */
export type GenerateVideoWebhookFactory = () => PromiseLike<{
  url: string;
  received: Promise<Experimental_VideoModelV4OperationWebhook>;
}>;

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
   * Resolution of the videos to generate. Must have the format `{width}x${height}`.
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
  poll?: GenerateVideoPollOptions;

  /**
   * Webhook factory for models that support the asynchronous
   * start/status flow. When provided and the model implements `doStart`
   * and `doStatus`, the SDK will use webhooks instead of polling.
   *
   * The factory should return a URL for the provider to send notifications to,
   * and a `received` promise that resolves when the notification arrives.
   */
  webhook?: GenerateVideoWebhookFactory;
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

  // Determine whether to use the start/status flow:
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
      const callOptions: Experimental_VideoModelV4CallOptions = {
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
        return executeStartStatusFlow({
          model,
          callOptions,
          poll,
          webhook,
          abortSignal,
          headers: headersWithUserAgent,
          retry,
        });
      }

      return retry(() => model.doGenerate!(callOptions));
    }),
  );

  // collect result videos, warnings, and response metadata
  const videos: Array<GeneratedFile> = [];
  const warnings: Array<Warning> = [];
  const responses: Array<VideoModelResponseMetadata> = [];
  let providerMetadata: SharedV4ProviderMetadata = {};

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
              topLevelType: 'video',
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
              topLevelType: 'video',
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

    providerMetadata =
      mergeProviderMetadata(providerMetadata, result.providerMetadata) ?? {};
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
  retry,
}: {
  model: Experimental_VideoModelV4;
  callOptions: Experimental_VideoModelV4CallOptions;
  poll?: GenerateVideoPollOptions;
  webhook?: GenerateVideoWebhookFactory;
  abortSignal?: AbortSignal;
  headers?: Record<string, string | undefined>;
  retry: <OUTPUT>(fn: () => PromiseLike<OUTPUT>) => PromiseLike<OUTPUT>;
}): Promise<Experimental_VideoModelV4Result> {
  // 1. If webhook and provider supports it, set up the webhook
  const earlyWarnings: Experimental_VideoModelV4Result['warnings'] = [];
  let webhookUrl: string | undefined;
  let webhookReceived:
    | Promise<Experimental_VideoModelV4OperationWebhook>
    | undefined;

  if (webhookFactory != null) {
    if (model.handleWebhookOption != null) {
      const result = await model.handleWebhookOption({
        webhook: webhookFactory,
      });
      webhookUrl = result.webhookUrl;
      webhookReceived = result.received;
    } else {
      earlyWarnings.push({
        type: 'unsupported',
        feature: 'webhook',
        details:
          'This model does not support webhooks. Falling back to polling.',
      });
    }
  }

  // 2. Start the generation
  const startResult = await retry(() =>
    model.doStart!({
      ...callOptions,
      webhookUrl,
    }),
  );

  const allWarnings = [...earlyWarnings, ...startResult.warnings];
  let operationProviderMetadata = startResult.providerMetadata;

  let completedResult: Extract<
    Experimental_VideoModelV4OperationStatusResult,
    { status: 'completed' }
  >;

  if (webhookReceived != null) {
    // 3a. Webhook flow: wait for webhook, then get final status
    await waitForWebhook({
      received: webhookReceived,
      timeoutMs: pollConfig?.timeoutMs ?? 600_000,
      abortSignal,
    });

    const statusResult = await retry(() =>
      model.doStatus!({
        operation: startResult.operation,
        abortSignal,
        headers,
      }),
    );

    if (statusResult.status === 'error') {
      throw new Error(statusResult.error);
    }

    if (statusResult.warnings != null) {
      allWarnings.push(...statusResult.warnings);
    }
    operationProviderMetadata = mergeProviderMetadata(
      operationProviderMetadata,
      statusResult.providerMetadata,
    );

    if (statusResult.status !== 'completed') {
      throw new Error(
        'Video generation did not complete after webhook notification.',
      );
    }

    completedResult = statusResult;
  } else {
    // 3b. Polling flow (also used as fallback when webhook not supported)
    const pollResult = await pollUntilComplete({
      model,
      operation: startResult.operation,
      pollConfig,
      abortSignal,
      headers,
      retry,
    });

    completedResult = pollResult.result;
    allWarnings.push(...pollResult.warnings);
    operationProviderMetadata = mergeProviderMetadata(
      operationProviderMetadata,
      pollResult.providerMetadata,
    );
  }

  return {
    videos: completedResult.videos,
    warnings: allWarnings,
    providerMetadata: operationProviderMetadata,
    response: completedResult.response,
  };
}

async function waitForWebhook({
  received,
  timeoutMs,
  abortSignal,
}: {
  received: Promise<Experimental_VideoModelV4OperationWebhook>;
  timeoutMs: number;
  abortSignal?: AbortSignal;
}) {
  // Cancel the timeout delay once the webhook arrives (or we abort/time out),
  // so its timer does not keep the event loop alive on the success path.
  const timeoutController = new AbortController();
  try {
    await Promise.race([
      received,
      delay(timeoutMs, {
        abortSignal: mergeAbortSignals(abortSignal, timeoutController.signal),
      }).then(() => {
        throw new Error(`Video generation timed out after ${timeoutMs}ms.`);
      }),
    ]);
  } finally {
    timeoutController.abort();
  }
}

function mergeProviderMetadata(
  ...metadataList: Array<SharedV4ProviderMetadata | undefined>
): SharedV4ProviderMetadata | undefined {
  let merged: SharedV4ProviderMetadata | undefined;

  for (const metadata of metadataList) {
    if (metadata == null) {
      continue;
    }

    merged ??= {};

    for (const [providerName, metadataValue] of Object.entries(metadata)) {
      const existingMetadata = merged[providerName];
      if (
        existingMetadata != null &&
        typeof existingMetadata === 'object' &&
        metadataValue != null &&
        typeof metadataValue === 'object'
      ) {
        merged[providerName] = {
          ...existingMetadata,
          ...metadataValue,
        };

        if (
          'videos' in existingMetadata &&
          Array.isArray(existingMetadata.videos) &&
          'videos' in metadataValue &&
          Array.isArray(metadataValue.videos)
        ) {
          (merged[providerName] as { videos: unknown[] }).videos = [
            ...existingMetadata.videos,
            ...metadataValue.videos,
          ];
        }
      } else {
        merged[providerName] = metadataValue;
      }
    }
  }

  return merged;
}

async function pollUntilComplete({
  model,
  operation,
  pollConfig,
  abortSignal,
  headers,
  retry,
}: {
  model: Experimental_VideoModelV4;
  operation: unknown;
  pollConfig?: GenerateVideoPollOptions;
  abortSignal?: AbortSignal;
  headers?: Record<string, string | undefined>;
  retry: <OUTPUT>(fn: () => PromiseLike<OUTPUT>) => PromiseLike<OUTPUT>;
}): Promise<{
  result: Extract<
    Experimental_VideoModelV4OperationStatusResult,
    { status: 'completed' }
  >;
  warnings: Experimental_VideoModelV4Result['warnings'];
  providerMetadata?: SharedV4ProviderMetadata;
}> {
  const baseInterval = pollConfig?.intervalMs ?? 5000;
  const backoff = pollConfig?.backoff ?? 'none';
  const timeoutMs = pollConfig?.timeoutMs ?? 600_000;
  const onAttempt = pollConfig?.onAttempt;

  const warnings: Experimental_VideoModelV4Result['warnings'] = [];
  let providerMetadata: SharedV4ProviderMetadata | undefined;
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

    await delay(Math.min(intervalMs, timeoutMs - elapsedMs), { abortSignal });

    if (Date.now() - startTime >= timeoutMs) {
      throw new Error(`Video generation timed out after ${timeoutMs}ms.`);
    }

    attempt++;

    if (onAttempt != null) {
      await onAttempt({ attempt, elapsedMs: Date.now() - startTime });
    }

    const statusResult = await retry(() =>
      model.doStatus!({
        operation,
        abortSignal,
        headers,
      }),
    );

    if (statusResult.status === 'error') {
      throw new Error(statusResult.error);
    }

    if (statusResult.warnings != null) {
      warnings.push(...statusResult.warnings);
    }
    providerMetadata = mergeProviderMetadata(
      providerMetadata,
      statusResult.providerMetadata,
    );

    if (statusResult.status === 'completed') {
      return {
        result: statusResult,
        warnings,
        providerMetadata,
      };
    }
  }
}

function normalizePrompt(promptArg: GenerateVideoPrompt): {
  prompt: string | undefined;
  image: Experimental_VideoModelV4File | undefined;
} {
  if (typeof promptArg === 'string') {
    return {
      prompt: promptArg,
      image: undefined,
    };
  }

  let image: Experimental_VideoModelV4File | undefined;

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
            topLevelType: 'image',
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
          topLevelType: 'image',
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

async function invokeModelMaxVideosPerCall(model: Experimental_VideoModelV4) {
  if (typeof model.maxVideosPerCall === 'function') {
    return await model.maxVideosPerCall({ modelId: model.modelId });
  }

  return model.maxVideosPerCall;
}
