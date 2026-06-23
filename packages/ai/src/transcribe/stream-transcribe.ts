import {
  UnsupportedFunctionalityError,
  type JSONObject,
} from '@ai-sdk/provider';
import {
  DelayedPromise,
  withUserAgentSuffix,
  type ProviderOptions,
} from '@ai-sdk/provider-utils';
import { NoTranscriptGeneratedError } from '../error/no-transcript-generated-error';
import { logWarnings } from '../logger/log-warnings';
import { resolveTranscriptionModel } from '../model/resolve-model';
import type { TranscriptionModel } from '../types/transcription-model';
import type { TranscriptionModelResponseMetadata } from '../types/transcription-model-response-metadata';
import type { Warning } from '../types/warning';
import { createAsyncIterableStream } from '../util/async-iterable-stream';
import { VERSION } from '../version';
import type {
  StreamTranscriptionResult,
  TranscriptionStreamPart,
} from './stream-transcribe-result';

type TranscriptSegment = {
  text: string;
  startSecond: number;
  endSecond: number;
};

/**
 * Streams transcripts using a transcription model.
 *
 * @param model - The transcription model to use.
 * @param audio - Raw audio chunks to transcribe.
 * @param inputAudioFormat - The input audio format for the raw audio chunks.
 * @param providerOptions - Additional provider-specific options.
 * @param abortSignal - An optional abort signal that can be used to cancel the call.
 * @param headers - Additional HTTP/WebSocket headers to send when supported by the provider.
 *
 * @returns A result object that contains the streaming transcript and final transcript metadata.
 */
export function experimental_streamTranscribe({
  model,
  audio,
  inputAudioFormat,
  providerOptions = {},
  abortSignal,
  headers,
  includeRawChunks,
  _internal: { currentDate = () => new Date() } = {},
}: {
  /**
   * The transcription model to use.
   */
  model: TranscriptionModel;

  /**
   * Raw audio chunks to transcribe.
   */
  audio: ReadableStream<Uint8Array | string>;

  /**
   * The input audio format for the raw audio chunks.
   */
  inputAudioFormat: {
    /**
     * Audio format type, e.g. `audio/pcm`, `audio/pcmu`, or `audio/pcma`.
     */
    type: string;

    /**
     * Sample rate in Hz. Only applicable for formats that require a rate.
     */
    rate?: number;
  };

  /**
   * Additional provider-specific options.
   */
  providerOptions?: ProviderOptions;

  /**
   * Abort signal.
   */
  abortSignal?: AbortSignal;

  /**
   * Additional headers to include in the request, if supported by the provider.
   */
  headers?: Record<string, string>;

  /**
   * When true, providers should include raw provider chunks in the stream.
   */
  includeRawChunks?: boolean;

  /**
   * Internal test hooks.
   */
  _internal?: {
    currentDate?: () => Date;
  };
}): StreamTranscriptionResult {
  const resolvedModel = resolveTranscriptionModel(model);
  if (!resolvedModel) {
    throw new Error('Model could not be resolved');
  }

  if (resolvedModel.doStream == null) {
    throw new UnsupportedFunctionalityError({
      functionality: 'streaming transcription',
    });
  }

  const headersWithUserAgent = withUserAgentSuffix(
    headers ?? {},
    `ai/${VERSION}`,
  );

  const textPromise = new DelayedPromise<string>();
  const segmentsPromise = new DelayedPromise<Array<TranscriptSegment>>();
  const warningsPromise = new DelayedPromise<Array<Warning>>();
  const responsesPromise = new DelayedPromise<
    Array<TranscriptionModelResponseMetadata>
  >();
  const providerMetadataPromise = new DelayedPromise<
    Record<string, JSONObject>
  >();

  const stream = createAsyncIterableStream(
    new ReadableStream<TranscriptionStreamPart>({
      async start(controller) {
        const startedAt = currentDate();
        let warnings: Array<Warning> | undefined;
        let response: TranscriptionModelResponseMetadata | undefined;

        const rejectPromises = (error: unknown) => {
          textPromise.reject(error);
          segmentsPromise.reject(error);
          warningsPromise.reject(error);
          responsesPromise.reject(error);
          providerMetadataPromise.reject(error);
        };

        try {
          const result = await resolvedModel.doStream!({
            audio,
            inputAudioFormat,
            providerOptions,
            abortSignal,
            headers: headersWithUserAgent,
            includeRawChunks,
          });

          response = {
            timestamp: result.response?.timestamp ?? startedAt,
            modelId: result.response?.modelId ?? resolvedModel.modelId,
            headers: result.response?.headers,
          };

          const reader = result.stream.getReader();

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              switch (value.type) {
                case 'stream-start': {
                  const streamWarnings = value.warnings;
                  warnings = streamWarnings;
                  warningsPromise.resolve(streamWarnings);
                  logWarnings({
                    warnings: streamWarnings,
                    provider: resolvedModel.provider,
                    model: resolvedModel.modelId,
                  });
                  break;
                }

                case 'response-metadata': {
                  response = {
                    timestamp:
                      value.timestamp ?? response?.timestamp ?? startedAt,
                    modelId:
                      value.modelId ??
                      response?.modelId ??
                      resolvedModel.modelId,
                    headers: value.headers ?? response?.headers,
                  };
                  break;
                }

                case 'transcript-delta':
                case 'transcript-partial':
                case 'transcript-final':
                case 'raw':
                case 'error': {
                  controller.enqueue(value);
                  break;
                }

                case 'finish': {
                  const responseMetadata = response ?? {
                    timestamp: startedAt,
                    modelId: resolvedModel.modelId,
                  };

                  if (!warningsPromise.isResolved()) {
                    warnings = [];
                    warningsPromise.resolve(warnings);
                    logWarnings({
                      warnings,
                      provider: resolvedModel.provider,
                      model: resolvedModel.modelId,
                    });
                  }

                  if (!value.text) {
                    throw new NoTranscriptGeneratedError({
                      responses: [responseMetadata],
                    });
                  }

                  textPromise.resolve(value.text);
                  segmentsPromise.resolve(value.segments);
                  responsesPromise.resolve([responseMetadata]);
                  providerMetadataPromise.resolve(value.providerMetadata ?? {});
                  break;
                }
              }
            }
          } finally {
            reader.releaseLock();
          }

          if (textPromise.isPending()) {
            throw new NoTranscriptGeneratedError({
              responses: [
                response ?? {
                  timestamp: startedAt,
                  modelId: resolvedModel.modelId,
                },
              ],
            });
          }

          controller.close();
        } catch (error) {
          rejectPromises(error);
          controller.error(error);
        }
      },
    }),
  );

  return {
    get text() {
      return textPromise.promise;
    },
    get segments() {
      return segmentsPromise.promise;
    },
    get warnings() {
      return warningsPromise.promise;
    },
    get responses() {
      return responsesPromise.promise;
    },
    get providerMetadata() {
      return providerMetadataPromise.promise;
    },
    fullStream: stream,
  };
}
