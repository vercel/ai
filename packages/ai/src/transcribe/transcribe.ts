import type { JSONObject } from '@ai-sdk/provider';
import {
  createIdGenerator,
  detectMediaType,
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
  let audioData: Uint8Array;
  let downloadedMediaType: string | undefined;

  try {
    if (audio instanceof URL) {
      const downloadResult = await downloadFn({ url: audio, abortSignal });
      audioData = downloadResult.data;
      downloadedMediaType = downloadResult.mediaType;
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

  const mediaType =
    downloadedMediaType ??
    detectMediaType({
      data: audioData,
      topLevelType: 'audio',
    }) ??
    'audio/wav';
  const startEvent = createStartEvent({
    byteLength: audioData.byteLength,
    mediaType,
  });

  try {
    return await executeWithStartEvent({
      startEvent,
      execute: async () => {
        const result = await retry(() =>
          resolvedModel.doGenerate({
            audio: audioData,
            abortSignal,
            headers: headersWithUserAgent,
            providerOptions,
            mediaType,
          }),
        );

        logWarnings({
          warnings: result.warnings,
          provider: resolvedModel.provider,
          model: resolvedModel.modelId,
        });

        if (!result.text) {
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
            byteLength: audioData.byteLength,
            mediaType,
          },
          text: result.text,
          segments: result.segments,
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

class DefaultTranscriptionResult implements TranscriptionResult {
  readonly text: string;
  readonly segments: Array<{
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
    language: string | undefined;
    durationInSeconds: number | undefined;
    warnings: Array<Warning>;
    responses: Array<TranscriptionModelResponseMetadata>;
    providerMetadata: Record<string, JSONObject> | undefined;
  }) {
    this.text = options.text;
    this.segments = options.segments;
    this.language = options.language;
    this.durationInSeconds = options.durationInSeconds;
    this.warnings = options.warnings;
    this.responses = options.responses;
    this.providerMetadata = options.providerMetadata ?? {};
  }
}
