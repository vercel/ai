import type {
  JSONObject,
  TranscriptionModelV4TimestampGranularity,
} from '@ai-sdk/provider';
import {
  createIdGenerator,
  detectMediaType,
  getTopLevelMediaType,
  isFullMediaType,
  withUserAgentSuffix,
  type ProviderOptions,
} from '@ai-sdk/provider-utils';
import { NoTranscriptGeneratedError } from '../error/no-transcript-generated-error';
import { logWarnings } from '../logger/log-warnings';
import { resolveTranscriptionModel } from '../model/resolve-model';
import type { DataContent } from '../prompt';
import { convertDataContentToUint8Array } from '../prompt/data-content';
import { createTelemetryDispatcher } from '../telemetry/create-telemetry-dispatcher';
import type { TelemetryOptions } from '../telemetry/telemetry-options';
import type { TranscriptionModel } from '../types/transcription-model';
import type { TranscriptionModelResponseMetadata } from '../types/transcription-model-response-metadata';
import { createDownload } from '../util/download/create-download';
import { notify } from '../util/notify';
import { prepareRetries } from '../util/prepare-retries';
import type { TranscriptionResult } from './transcribe-result';
import { VERSION } from '../version';
import type { Warning } from '../types';
import type {
  TranscriptionEndEvent,
  TranscriptionStartEvent,
} from './transcription-events';

const originalGenerateCallId = createIdGenerator({
  prefix: 'call',
  size: 24,
});
/**
 * Generates transcripts using a transcription model.
 *
 * @param model - The transcription model to use.
 * @param audio - The audio data to transcribe as DataContent (string | Uint8Array | ArrayBuffer | Buffer) or a URL.
 * @param providerOptions - Additional provider-specific options that are passed through to the provider
 * as body parameters.
 * @param maxRetries - Maximum number of retries. Set to 0 to disable retries. Default: 2.
 * @param abortSignal - An optional abort signal that can be used to cancel the call.
 * @param headers - Additional HTTP headers to be sent with the request. Only applicable for HTTP-based providers.
 * @param telemetry - Optional telemetry configuration.
 *
 * @returns A result object that contains the generated transcript.
 */
const defaultDownload = createDownload();

export async function transcribe({
  model,
  audio,
  providerOptions = {},
  timestampGranularities,
  maxRetries: maxRetriesArg,
  abortSignal,
  headers,
  telemetry,
  download: downloadFn = defaultDownload,
  _internal: { generateCallId = originalGenerateCallId } = {},
}: {
  /**
   * The transcription model to use.
   */
  model: TranscriptionModel;

  /**
   * The audio data to transcribe.
   */
  audio: DataContent | URL;

  /**
   * Additional provider-specific options that are passed through to the provider
   * as body parameters.
   *
   * The outer record is keyed by the provider name, and the inner
   * record is keyed by the provider-specific metadata key.
   * ```ts
   * {
   *   "openai": {
   *     "temperature": 0
   *   }
   * }
   * ```
   */
  providerOptions?: ProviderOptions;

  /**
   * Word and segment timings to request.
   *
   * Supported adapters map this onto the provider's native control when the
   * matching provider option is omitted. An explicit provider option wins.
   * Supported adapters warn when they cannot return a requested granularity.
   * An empty array requests no shared timing granularity; provider defaults may vary.
   */
  timestampGranularities?: Array<TranscriptionModelV4TimestampGranularity>;

  /**
   * Maximum number of retries per transcript model call. Set to 0 to disable retries.
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
   * Optional telemetry configuration.
   */
  telemetry?: TelemetryOptions;

  /**
   * Custom download function for fetching audio from URLs.
   * Providing this option forces local downloading even when the provider
   * supports native URL transcription.
   * Use `createDownload()` from `ai` to create a download function with custom size limits.
   *
   * @default createDownload() (2 GiB limit)
   */
  download?: (options: {
    url: URL;
    abortSignal?: AbortSignal;
  }) => Promise<{ data: Uint8Array; mediaType: string | undefined }>;

  /**
   * Internal. For test use only. May change without notice.
   */
  _internal?: {
    generateCallId?: () => string;
  };
}): Promise<TranscriptionResult> {
  const resolvedModel = resolveTranscriptionModel(model);
  if (!resolvedModel) {
    throw new Error('Model could not be resolved');
  }

  const { maxRetries, retry } = prepareRetries({
    maxRetries: maxRetriesArg,
    abortSignal,
  });

  const headersWithUserAgent = withUserAgentSuffix(
    headers ?? {},
    `ai/${VERSION}`,
  );

  const callId = generateCallId();
  const telemetryDispatcher = createTelemetryDispatcher({ telemetry });
  const runInTracingChannelSpan =
    telemetryDispatcher.runInTracingChannelSpan ??
    (async <T>({ execute }: { execute: () => PromiseLike<T> }) =>
      await execute());

  const createStartEvent = ({
    byteLength,
    mediaType,
  }: {
    byteLength: number | undefined;
    mediaType: string | undefined;
  }): TranscriptionStartEvent => ({
    callId,
    operationId: 'ai.transcribe',
    provider: resolvedModel.provider,
    modelId: resolvedModel.modelId,
    audio: {
      byteLength,
      mediaType,
    },
    inputAudioFormat: undefined,
    maxRetries,
    headers,
    providerOptions,
    timestampGranularities,
  });

  const executeWithStartEvent = async <T>({
    startEvent,
    execute,
  }: {
    startEvent: TranscriptionStartEvent;
    execute: () => PromiseLike<T>;
  }) =>
    await runInTracingChannelSpan({
      type: 'transcribe',
      event: startEvent,
      execute: async () => {
        await notify({
          event: startEvent,
          callbacks: [telemetryDispatcher.onStart],
        });

        return await execute();
      },
    });

  let preparationError: unknown;
  let preparationFailed = false;
  let audioData: Uint8Array | URL;
  let downloadedMediaType: string | undefined;

  try {
    if (audio instanceof URL) {
      if (
        resolvedModel.doGenerateFromUrl != null &&
        downloadFn === defaultDownload &&
        (audio.protocol === 'https:' || audio.protocol === 'http:')
      ) {
        audioData = audio;
      } else {
        const downloadResult = await downloadFn({ url: audio, abortSignal });
        audioData = downloadResult.data;
        downloadedMediaType = downloadResult.mediaType;
      }
    } else {
      audioData = convertDataContentToUint8Array(audio);
    }
  } catch (error) {
    preparationFailed = true;
    preparationError = error;
    audioData = new Uint8Array();
  }

  if (preparationFailed) {
    const startEvent = createStartEvent({
      byteLength: undefined,
      mediaType: undefined,
    });

    try {
      return await executeWithStartEvent({
        startEvent,
        execute: () => {
          throw preparationError;
        },
      });
    } catch (error) {
      await telemetryDispatcher.onError?.({ callId, error });
      throw error;
    }
  }

  let mediaType =
    audioData instanceof URL
      ? undefined
      : (getAudioMediaType(downloadedMediaType) ??
        detectMediaType({
          data: audioData,
          topLevelType: 'audio',
        }) ??
        'audio/wav');
  let byteLength = audioData instanceof URL ? undefined : audioData.byteLength;
  const startEvent = createStartEvent({
    byteLength,
    mediaType,
  });

  try {
    return await executeWithStartEvent({
      startEvent,
      execute: async () => {
        const result = await retry(async () => {
          const callOptions = {
            abortSignal,
            headers: headersWithUserAgent,
            providerOptions,
            ...(timestampGranularities != null
              ? { timestampGranularities }
              : {}),
          };
          if (audioData instanceof URL) {
            const nativeResult = await resolvedModel.doGenerateFromUrl?.({
              ...callOptions,
              audio: audioData,
            });
            if (nativeResult != null) return nativeResult;

            // A capable provider can decline an unsupported URL (for example,
            // a redirect). Keep the existing secure download and file path.
            const downloaded = await downloadFn({
              url: audioData,
              abortSignal,
            });
            audioData = downloaded.data;
            mediaType =
              getAudioMediaType(downloaded.mediaType) ??
              detectMediaType({ data: audioData, topLevelType: 'audio' }) ??
              'audio/wav';
            byteLength = audioData.byteLength;
          }
          return resolvedModel.doGenerate({
            ...callOptions,
            audio: audioData,
            mediaType: mediaType ?? 'audio/wav',
          });
        });

        logWarnings({
          warnings: result.warnings,
          provider: resolvedModel.provider,
          model: resolvedModel.modelId,
        });

        if (result.text == null) {
          throw new NoTranscriptGeneratedError({
            responses: [result.response],
          });
        }

        const endEvent: TranscriptionEndEvent = {
          callId,
          operationId: 'ai.transcribe',
          provider: resolvedModel.provider,
          modelId: resolvedModel.modelId,
          audio: {
            byteLength,
            mediaType,
          },
          text: result.text,
          segments: result.segments,
          words: result.words,
          language: result.language,
          durationInSeconds: result.durationInSeconds,
          usage: result.usage,
          warnings: result.warnings,
          providerMetadata: result.providerMetadata,
          response: result.response,
        };

        await notify({
          event: endEvent,
          callbacks: [telemetryDispatcher.onEnd],
        });

        return new DefaultTranscriptionResult({
          text: result.text,
          segments: result.segments,
          words: result.words,
          language: result.language,
          durationInSeconds: result.durationInSeconds,
          warnings: result.warnings,
          responses: [result.response],
          providerMetadata: result.providerMetadata,
        });
      },
    });
  } catch (error) {
    await telemetryDispatcher.onError?.({ callId, error });
    throw error;
  }
}

/**
 * Normalizes a downloaded `Content-Type` header value and returns it only
 * when it is a full `audio/<subtype>` media type. Generic or mislabeled types
 * (e.g. `application/octet-stream`, `binary/octet-stream`, `text/plain`)
 * return `undefined` so that the media type is detected from the audio bytes
 * instead.
 */
function getAudioMediaType(
  contentType: string | undefined,
): string | undefined {
  const mediaType = contentType?.split(';')[0].trim().toLowerCase();
  return mediaType != null &&
    getTopLevelMediaType(mediaType) === 'audio' &&
    isFullMediaType(mediaType)
    ? mediaType
    : undefined;
}

class DefaultTranscriptionResult implements TranscriptionResult {
  readonly text: string;
  readonly segments: Array<{
    text: string;
    startSecond: number;
    endSecond: number;
  }>;
  readonly words?: Array<{
    text: string;
    startSecond: number;
    endSecond: number;
  }>;
  readonly language: string | undefined;
  readonly durationInSeconds: number | undefined;
  readonly warnings: Array<Warning>;
  readonly responses: Array<TranscriptionModelResponseMetadata>;
  readonly providerMetadata: Record<string, JSONObject>;

  constructor(options: {
    text: string;
    segments: Array<{
      text: string;
      startSecond: number;
      endSecond: number;
    }>;
    words?: Array<{
      text: string;
      startSecond: number;
      endSecond: number;
    }>;
    language: string | undefined;
    durationInSeconds: number | undefined;
    warnings: Array<Warning>;
    responses: Array<TranscriptionModelResponseMetadata>;
    providerMetadata: Record<string, JSONObject> | undefined;
  }) {
    this.text = options.text;
    this.segments = options.segments;
    this.words = options.words;
    this.language = options.language;
    this.durationInSeconds = options.durationInSeconds;
    this.warnings = options.warnings;
    this.responses = options.responses;
    this.providerMetadata = options.providerMetadata ?? {};
  }
}
