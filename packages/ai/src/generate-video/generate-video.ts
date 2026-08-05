import type {
  Experimental_VideoModelV4,
  Experimental_VideoModelV4CallOptions,
  Experimental_VideoModelV4File,
  Experimental_VideoModelV4Result,
  Experimental_VideoModelV4OperationWebhook,
  Experimental_VideoModelV4FrameImage,
  Experimental_VideoModelV4FrameType,
  SharedV4ProviderMetadata,
} from '@ai-sdk/provider';
import {
  convertBase64ToUint8Array,
  delay as defaultDelay,
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
 *
 * When used with `webhook`, `timeoutMs` also limits how long the SDK waits for
 * the webhook notification. If the model does not support webhooks, these
 * options configure the automatic polling fallback.
 */
export type GenerateVideoPollOptions = {
  /**
   * Interval between status checks in milliseconds.
   *
   * @default 5000
   */
  intervalMs?: number;

  /**
   * Maximum time to wait for completion in milliseconds.
   *
   * @default 600000 (10 minutes)
   */
  timeoutMs?: number;

  /**
   * Custom delay implementation for polling intervals and webhook timeouts.
   * This can be used with durable workflow sleep functions.
   *
   * @default the built-in timer-based delay
   */
  delay?: (
    delayInMs: number,
    options?: { abortSignal?: AbortSignal },
  ) => PromiseLike<void>;
};

/**
 * Webhook factory for models that support the asynchronous start/status flow.
 *
 * The factory should return a URL for the provider to send notifications to,
 * and a `received` promise that resolves when the notification arrives.
 */
export type GenerateVideoWebhookFactory = () => PromiseLike<{
  url: string;
  received: PromiseLike<Experimental_VideoModelV4OperationWebhook>;
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
 * @param frameImages - Role-tagged image inputs for image-to-video and first-last-frame generation.
 * @param inputReferences - Reference image or video inputs for reference-to-video generation.
 * @param generateAudio - Whether the model should generate audio alongside the video.
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
  frameImages,
  inputReferences,
  generateAudio,
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
   * Role-tagged image inputs for image-to-video and first-last-frame generation.
   */
  frameImages?: Array<{
    /**
     * The image for this frame.
     */
    image: DataContent;

    /**
     * Which frame this image represents.
     */
    frameType: Experimental_VideoModelV4FrameType;
  }>;

  /**
   * Reference inputs for reference-to-video generation.
   *
   * Each entry may be a plain image/video ({@link DataContent}), or an object
   * form that carries an explicit `mediaType`.
   */
  inputReferences?: Array<
    | DataContent
    | {
        /**
         * The reference image or video.
         */
        data: DataContent;

        /**
         * The media type of the reference (e.g. 'image/png',
         * 'video/mp4').
         */
        mediaType?: string;
      }
  >;

  /**
   * Whether the model should generate audio alongside the video.
   */
  generateAudio?: boolean;

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
   *
   * This option can be combined with `webhook`: `timeoutMs` limits the webhook
   * wait, and the polling settings apply if the model does not support
   * webhooks.
   */
  poll?: GenerateVideoPollOptions;

  /**
   * Webhook factory for models that support the asynchronous
   * start/status flow. When provided and the model implements `doStart`
   * and `doStatus`, the SDK will use webhooks instead of polling.
   *
   * The factory should return a URL for the provider to send notifications to,
   * and a `received` promise that resolves when the notification arrives.
   * `poll` can also be provided to configure the webhook timeout and polling
   * fallback.
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

  const normalizedFrameImages:
    | Array<Experimental_VideoModelV4FrameImage>
    | undefined = frameImages?.flatMap(frame => {
    const normalizedImage = normalizeImageData(frame.image);
    return normalizedImage != null
      ? [{ image: normalizedImage, frameType: frame.frameType }]
      : [];
  });

  const normalizedInputReferences:
    | Array<Experimental_VideoModelV4File>
    | undefined = inputReferences?.flatMap(reference => {
    const normalized = normalizeReferenceData(reference);
    return normalized != null ? [normalized] : [];
  });

  const effectiveInputReferences =
    normalizedFrameImages != null && normalizedFrameImages.length > 0
      ? undefined
      : normalizedInputReferences;

  const warnings: Array<Warning> = [];

  if (
    normalizedFrameImages != null &&
    normalizedFrameImages.length > 0 &&
    normalizedInputReferences != null &&
    normalizedInputReferences.length > 0
  ) {
    warnings.push({
      type: 'other',
      message:
        'inputReferences were ignored because frameImages were provided; ' +
        'frameImages and inputReferences cannot be combined.',
    });
  }

  const firstFrameImage = normalizedFrameImages?.find(
    frame => frame.frameType === 'first_frame',
  )?.image;

  if (image != null && firstFrameImage != null) {
    warnings.push({
      type: 'other',
      message:
        'prompt.image was ignored because a first_frame frameImage was provided; ' +
        'the first_frame frameImage takes precedence as the start image.',
    });
  }

  const resolvedImage = firstFrameImage ?? image;

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
        image: resolvedImage,
        frameImages: normalizedFrameImages,
        inputReferences: effectiveInputReferences,
        generateAudio,
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
          retry,
        });
      }

      return retry(() => model.doGenerate!(callOptions));
    }),
  );

  // collect result videos, warnings, and response metadata
  const videos: Array<GeneratedFile> = [];
  const responses: Array<VideoModelResponseMetadata> = [];
  const providerMetadata: SharedV4ProviderMetadata = {};

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

    if (result.providerMetadata != null) {
      mergeProviderMetadata(providerMetadata, result.providerMetadata);
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
  retry,
}: {
  model: Experimental_VideoModelV4;
  callOptions: Experimental_VideoModelV4CallOptions;
  poll?: GenerateVideoPollOptions;
  webhook?: GenerateVideoWebhookFactory;
  retry: <OUTPUT>(fn: () => PromiseLike<OUTPUT>) => PromiseLike<OUTPUT>;
}): Promise<Experimental_VideoModelV4Result> {
  // 1. If webhook and provider supports it, set up the webhook
  const earlyWarnings: Experimental_VideoModelV4Result['warnings'] = [];
  let webhookUrl: string | undefined;
  let webhookReceived:
    | PromiseLike<Experimental_VideoModelV4OperationWebhook>
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
  let operationProviderMetadata =
    startResult.providerMetadata == null
      ? undefined
      : { ...startResult.providerMetadata };
  const intervalMs = pollConfig?.intervalMs ?? 5000;
  const timeoutMs = pollConfig?.timeoutMs ?? 600_000;
  const delay = pollConfig?.delay ?? defaultDelay;
  const startTime = Date.now();

  if (webhookReceived != null) {
    // 3a. Webhook flow: wait for webhook, then get final status
    await waitForWebhook({
      received: webhookReceived,
      timeoutMs,
      abortSignal: callOptions.abortSignal,
      delay,
    });
  }

  while (true) {
    if (webhookReceived == null) {
      // 3b. Polling flow (also used when webhooks are not supported)
      const elapsedMs = Date.now() - startTime;
      if (elapsedMs >= timeoutMs) {
        throw new Error(`Video generation timed out after ${timeoutMs}ms.`);
      }
      await delay(Math.min(intervalMs, timeoutMs - elapsedMs), {
        abortSignal: callOptions.abortSignal,
      });
      if (Date.now() - startTime >= timeoutMs) {
        throw new Error(`Video generation timed out after ${timeoutMs}ms.`);
      }
    }

    const statusResult = await retry(() =>
      model.doStatus!({
        operation: startResult.operation,
        abortSignal: callOptions.abortSignal,
        headers: callOptions.headers,
      }),
    );

    if (statusResult.status === 'error') {
      throw new Error(statusResult.error);
    }

    if (statusResult.warnings != null) {
      allWarnings.push(...statusResult.warnings);
    }
    if (statusResult.providerMetadata != null) {
      operationProviderMetadata ??= {};
      mergeProviderMetadata(
        operationProviderMetadata,
        statusResult.providerMetadata,
      );
    }

    if (statusResult.status === 'completed') {
      return {
        videos: statusResult.videos,
        warnings: allWarnings,
        providerMetadata: operationProviderMetadata,
        response: statusResult.response,
      };
    }

    if (webhookReceived != null) {
      throw new Error(
        'Video generation did not complete after webhook notification.',
      );
    }
  }
}

async function waitForWebhook({
  received,
  timeoutMs,
  abortSignal,
  delay,
}: {
  received: PromiseLike<Experimental_VideoModelV4OperationWebhook>;
  timeoutMs: number;
  abortSignal?: AbortSignal;
  delay: (
    delayInMs: number,
    options?: { abortSignal?: AbortSignal },
  ) => PromiseLike<void>;
}) {
  // Cancel the timeout delay once the webhook arrives (or we abort/time out),
  // so its timer does not keep the event loop alive on the success path.
  const timeoutController =
    typeof globalThis.AbortController === 'function'
      ? new globalThis.AbortController()
      : undefined;
  try {
    await Promise.race([
      received,
      delay(timeoutMs, {
        abortSignal:
          timeoutController == null
            ? abortSignal
            : mergeAbortSignals(abortSignal, timeoutController.signal),
      }).then(() => {
        throw new Error(`Video generation timed out after ${timeoutMs}ms.`);
      }),
    ]);
  } finally {
    timeoutController?.abort();
  }
}

function mergeProviderMetadata(
  target: SharedV4ProviderMetadata,
  source: SharedV4ProviderMetadata,
): void {
  for (const [providerName, metadataValue] of Object.entries(source)) {
    const existingMetadata = target[providerName];
    if (
      existingMetadata != null &&
      typeof existingMetadata === 'object' &&
      metadataValue != null &&
      typeof metadataValue === 'object'
    ) {
      target[providerName] = {
        ...existingMetadata,
        ...metadataValue,
      };

      if (
        'videos' in existingMetadata &&
        Array.isArray(existingMetadata.videos) &&
        'videos' in metadataValue &&
        Array.isArray(metadataValue.videos)
      ) {
        (target[providerName] as { videos: unknown[] }).videos = [
          ...existingMetadata.videos,
          ...metadataValue.videos,
        ];
      }
    } else {
      target[providerName] = metadataValue;
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

  return {
    prompt: promptArg.text,
    image:
      promptArg.image != null ? normalizeImageData(promptArg.image) : undefined,
  };
}

function detectFileMediaType(
  data: Uint8Array,
  restrictToImages: boolean,
): string {
  const detected = restrictToImages
    ? detectMediaType({ data, topLevelType: 'image' })
    : detectMediaType({ data });
  return detected ?? 'image/png';
}

/**
 * Normalizes a {@link DataContent} image into a {@link Experimental_VideoModelV4File}.
 * Accepts a URL string, a data URL, a base64 string, or binary image data.
 */
function normalizeImageData(
  dataContent: DataContent,
  { restrictToImages = true }: { restrictToImages?: boolean } = {},
): Experimental_VideoModelV4File | undefined {
  if (typeof dataContent === 'string') {
    if (
      dataContent.startsWith('http://') ||
      dataContent.startsWith('https://')
    ) {
      return {
        type: 'url',
        url: dataContent,
      };
    }

    if (dataContent.startsWith('data:')) {
      const { mediaType, base64Content } = splitDataUrl(dataContent);
      const data = convertBase64ToUint8Array(base64Content ?? '');
      return {
        type: 'file',
        mediaType: mediaType ?? detectFileMediaType(data, restrictToImages),
        data,
      };
    }

    const bytes = convertBase64ToUint8Array(dataContent);
    return {
      type: 'file',
      mediaType: detectFileMediaType(bytes, restrictToImages),
      data: bytes,
    };
  }

  if (dataContent instanceof Uint8Array || dataContent instanceof ArrayBuffer) {
    const bytes =
      dataContent instanceof Uint8Array
        ? dataContent
        : new Uint8Array(dataContent);
    return {
      type: 'file',
      mediaType: detectFileMediaType(bytes, restrictToImages),
      data: bytes,
    };
  }

  return undefined;
}

/**
 * Normalizes a reference input into a {@link Experimental_VideoModelV4File},
 * accepting either a plain {@link DataContent} or the object form that carries
 * an explicit `mediaType`.
 */
function normalizeReferenceData(
  reference:
    | DataContent
    | {
        data: DataContent;
        mediaType?: string;
      },
): Experimental_VideoModelV4File | undefined {
  const isObjectForm =
    typeof reference === 'object' &&
    reference != null &&
    !(reference instanceof Uint8Array) &&
    !(reference instanceof ArrayBuffer) &&
    'data' in reference;

  if (!isObjectForm) {
    return normalizeImageData(reference as DataContent, {
      restrictToImages: false,
    });
  }

  const normalized = normalizeImageData(reference.data, {
    restrictToImages: false,
  });
  if (normalized == null) {
    return normalized;
  }

  return {
    ...normalized,
    ...(reference.mediaType != null ? { mediaType: reference.mediaType } : {}),
  };
}

async function invokeModelMaxVideosPerCall(model: Experimental_VideoModelV4) {
  if (typeof model.maxVideosPerCall === 'function') {
    return await model.maxVideosPerCall({ modelId: model.modelId });
  }

  return model.maxVideosPerCall;
}
