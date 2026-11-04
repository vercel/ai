import type {
  Experimental_VideoModelV4CallOptions,
  Experimental_VideoModelV4FrameType,
  JSONValue,
} from '@ai-sdk/provider';
import {
  generateId,
  withUserAgentSuffix,
  type DataContent,
  type ProviderOptions,
} from '@ai-sdk/provider-utils';
import { resolveVideoModel } from '../model/resolve-model';
import type {
  VideoModel,
  VideoModelProviderMetadata,
} from '../types/video-model';
import type { VideoModelResponseMetadata } from '../types/video-model-response-metadata';
import type { Warning } from '../types/warning';
import { prepareRetries } from '../util/prepare-retries';
import { VERSION } from '../version';
import {
  normalizeVideoCallInputs,
  type GenerateVideoPrompt,
} from './generate-video';

/**
 * The result of an `experimental_startVideo` call.
 */
export interface StartVideoResult {
  /**
   * JSON-serializable opaque reference to the started generation.
   * Persist it and pass it to `experimental_getVideoStatus` to retrieve the
   * status and result later — from any process.
   */
  readonly operation: JSONValue;

  /**
   * Warnings for the call, e.g. unsupported settings.
   */
  readonly warnings: Array<Warning>;

  /**
   * Provider-specific metadata passed through from the provider.
   * Carries the provider's own job identifiers (e.g. the AI Gateway's
   * `providerMetadata.gateway.asyncJob.jobId` and, when `webhookUrl` was
   * given, its `webhookSigningSecret`).
   */
  readonly providerMetadata?: VideoModelProviderMetadata;

  /**
   * Response metadata from the provider.
   */
  readonly response: VideoModelResponseMetadata;
}

/**
 * Starts an asynchronous video generation and returns immediately with an
 * opaque `operation` reference — without waiting for the video to finish.
 *
 * This is the fire-and-forget counterpart to `experimental_generateVideo`:
 * use it to fan out many jobs, to submit from a process that will not stay
 * alive, or together with `webhookUrl` so the provider notifies your endpoint
 * at the terminal state. Check the outcome with `experimental_getVideoStatus`,
 * or let your webhook receiver fetch the result.
 *
 * @param model - The video model to use. Must implement `doStart`.
 * @param prompt - The prompt that should be used to generate the video.
 * @param n - Number of videos to generate. Default: 1. Must not exceed the
 * model's `maxVideosPerCall` — fan out with multiple `startVideo` calls.
 * @param aspectRatio - Aspect ratio of the videos to generate. Must have the format `{width}:{height}`, or `'adaptive'`.
 * @param resolution - Resolution of the videos to generate. Must have the format `{width}x${height}`.
 * @param duration - Duration of the video in seconds.
 * @param fps - Frames per second for the video.
 * @param seed - Seed for the video generation.
 * @param frameImages - Role-tagged image inputs for image-to-video and first-last-frame generation.
 * @param inputReferences - Reference image or video inputs for reference-to-video generation.
 * @param generateAudio - Whether the model should generate audio alongside the video.
 * @param providerOptions - Additional provider-specific options that are passed through to the provider
 * as body parameters.
 * @param maxRetries - Maximum number of retries for the start call. Set to 0 to disable retries. Default: 2.
 * @param abortSignal - An optional abort signal that can be used to cancel the call.
 * @param headers - Additional HTTP headers to be sent with the request. Only applicable for HTTP-based providers.
 * @param webhookUrl - A URL the provider should notify when the generation
 * reaches a terminal state.
 *
 * @returns A result object that contains the opaque `operation` reference,
 * warnings, provider metadata (including the provider's job id), and response
 * metadata.
 */
export async function experimental_startVideo({
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
  webhookUrl,
}: {
  model: VideoModel;
  prompt: GenerateVideoPrompt;
  n?: number;
  maxVideosPerCall?: number;
  aspectRatio?: `${number}:${number}` | 'adaptive';
  resolution?: `${number}x${number}`;
  duration?: number;
  fps?: number;
  seed?: number;
  frameImages?: Array<{
    image: DataContent;
    frameType: Experimental_VideoModelV4FrameType;
  }>;
  inputReferences?: Array<
    DataContent | { data: DataContent; mediaType?: string }
  >;
  generateAudio?: boolean;
  providerOptions?: ProviderOptions;
  maxRetries?: number;
  abortSignal?: AbortSignal;
  headers?: Record<string, string>;
  webhookUrl?: string;
}): Promise<StartVideoResult> {
  const model = resolveVideoModel(modelArg);

  if (model.doStart == null) {
    throw new Error(
      `Video model ${model.modelId} does not implement doStart. ` +
        'Use generateVideo for models without an asynchronous start/status flow.',
    );
  }

  if (!Number.isInteger(n) || n < 1) {
    throw new Error(
      `Invalid n: expected a positive integer, received ${JSON.stringify(n)}.`,
    );
  }

  // A start yields one operation covering all n videos: refuse to silently
  // exceed a known per-call limit instead of splitting into several starts.
  const knownMaxVideosPerCall =
    maxVideosPerCall ??
    (typeof model.maxVideosPerCall === 'function'
      ? await model.maxVideosPerCall({ modelId: model.modelId })
      : model.maxVideosPerCall);
  if (knownMaxVideosPerCall != null && n > knownMaxVideosPerCall) {
    throw new Error(
      `Video model ${model.modelId} supports at most ${knownMaxVideosPerCall} video(s) per call, ` +
        `but ${n} were requested. Split the batch across multiple startVideo calls.`,
    );
  }

  const {
    prompt,
    resolvedImage,
    normalizedFrameImages,
    effectiveInputReferences,
    warnings,
  } = normalizeVideoCallInputs({ promptArg, frameImages, inputReferences });

  const { retry } = prepareRetries({
    maxRetries: maxRetriesArg,
    abortSignal,
  });

  // `doStart` is billable: mint one idempotency token per logical start,
  // outside the retry closure; a caller-supplied key wins.
  const callerIdempotencyKey = Object.entries(headers ?? {}).find(
    ([key, value]) =>
      key.toLowerCase() === 'idempotency-key' && value !== undefined,
  );

  const callOptions: Experimental_VideoModelV4CallOptions & {
    webhookUrl?: string;
  } = {
    prompt,
    n,
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
    headers: {
      ...withUserAgentSuffix(headers ?? {}, `ai/${VERSION}`),
      ...(callerIdempotencyKey
        ? {}
        : { 'idempotency-key': `aisdk_vid_${generateId()}` }),
    },
    abortSignal,
    webhookUrl,
  };

  const startResult = await retry(() => model.doStart!(callOptions));

  return {
    operation: startResult.operation,
    warnings: [...warnings, ...startResult.warnings],
    providerMetadata: startResult.providerMetadata,
    response: startResult.response,
  };
}
