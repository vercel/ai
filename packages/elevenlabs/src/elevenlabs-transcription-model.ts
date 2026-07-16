import {
  InvalidArgumentError,
  UnsupportedFunctionalityError,
  type Experimental_TranscriptionModelV4StreamOptions as TranscriptionModelV4StreamOptions,
  type SharedV4Warning,
  type TranscriptionModelV4,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  convertToBase64,
  connectToWebSocket,
  createJsonResponseHandler,
  mediaTypeToExtension,
  parseProviderOptions,
  postFormDataToApi,
  safeParseJSON,
  serializeModelOptions,
  toWebSocketUrl,
  waitForWebSocketBufferDrain,
  WORKFLOW_SERIALIZE,
  WORKFLOW_DESERIALIZE,
  type WebSocketConnection,
  type WebSocketLike,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { ElevenLabsConfig } from './elevenlabs-config';
import { elevenlabsFailedResponseHandler } from './elevenlabs-error';
import {
  elevenLabsTranscriptionModelOptionsSchema,
  type ElevenLabsTranscriptionModelOptions,
} from './elevenlabs-transcription-model-options';
import type { ElevenLabsTranscriptionModelId } from './elevenlabs-transcription-options';
import type { ElevenLabsTranscriptionAPITypes } from './elevenlabs-api-types';

type ElevenLabsRealtimeTranscriptionEvent = {
  message_type?: string;
  session_id?: string;
  text?: string;
  language_code?: string | null;
  words?: Array<{
    text?: string;
    start?: number;
    end?: number;
    type?: string;
  }> | null;
  error?: string;
};

const elevenLabsRealtimeErrorTypes = new Set([
  'auth_error',
  'chunk_size_exceeded',
  'commit_throttled',
  'error',
  'input_error',
  'insufficient_audio_activity',
  'queue_overflow',
  'quota_exceeded',
  'rate_limited',
  'resource_exhausted',
  'session_time_limit_exceeded',
  'transcriber_error',
  'unaccepted_terms',
]);

function isRealtimeTranscriptionModelId(modelId: string): boolean {
  return modelId === 'scribe_v2_realtime';
}

interface ElevenLabsTranscriptionModelConfig extends ElevenLabsConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

export class ElevenLabsTranscriptionModel implements TranscriptionModelV4 {
  readonly specificationVersion = 'v4';

  get provider(): string {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: ElevenLabsTranscriptionModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: ElevenLabsTranscriptionModelId;
    config: ElevenLabsTranscriptionModelConfig;
  }) {
    return new ElevenLabsTranscriptionModel(options.modelId, options.config);
  }

  constructor(
    readonly modelId: ElevenLabsTranscriptionModelId,
    private readonly config: ElevenLabsTranscriptionModelConfig,
  ) {}

  private async getArgs({
    audio,
    mediaType,
    providerOptions,
  }: Parameters<TranscriptionModelV4['doGenerate']>[0]) {
    const warnings: SharedV4Warning[] = [];

    // Parse provider options
    const elevenlabsOptions = await parseProviderOptions({
      provider: 'elevenlabs',
      providerOptions,
      schema: elevenLabsTranscriptionModelOptionsSchema,
    });

    // Create form data with base fields
    const formData = new FormData();
    const blob =
      audio instanceof Uint8Array
        ? new Blob([audio])
        : new Blob([convertBase64ToUint8Array(audio)]);

    formData.append('model_id', this.modelId);
    const fileExtension = mediaTypeToExtension(mediaType);
    formData.append(
      'file',
      new File([blob], 'audio', { type: mediaType }),
      `audio.${fileExtension}`,
    );
    formData.append('diarize', 'true');

    // Add provider-specific options
    if (elevenlabsOptions) {
      const transcriptionModelOptions: ElevenLabsTranscriptionAPITypes = {
        language_code: elevenlabsOptions.languageCode ?? undefined,
        tag_audio_events: elevenlabsOptions.tagAudioEvents ?? undefined,
        num_speakers: elevenlabsOptions.numSpeakers ?? undefined,
        timestamps_granularity:
          elevenlabsOptions.timestampsGranularity ?? undefined,
        file_format: elevenlabsOptions.fileFormat ?? undefined,
      };

      if (typeof elevenlabsOptions.diarize === 'boolean') {
        formData.append('diarize', String(elevenlabsOptions.diarize));
      }

      for (const key in transcriptionModelOptions) {
        const value =
          transcriptionModelOptions[
            key as keyof ElevenLabsTranscriptionAPITypes
          ];
        if (value !== undefined) {
          formData.append(key, String(value));
        }
      }
    }

    return {
      formData,
      warnings,
    };
  }

  async doGenerate(
    options: Parameters<TranscriptionModelV4['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<TranscriptionModelV4['doGenerate']>>> {
    if (isRealtimeTranscriptionModelId(this.modelId)) {
      throw new UnsupportedFunctionalityError({
        functionality: `non-streaming transcription with ${this.modelId}`,
      });
    }

    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { formData, warnings } = await this.getArgs(options);

    const {
      value: response,
      responseHeaders,
      rawValue: rawResponse,
    } = await postFormDataToApi({
      url: this.config.url({
        path: '/v1/speech-to-text',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers?.(), options.headers),
      formData,
      failedResponseHandler: elevenlabsFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        elevenlabsTranscriptionResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    return {
      text: response.text,
      segments:
        response.words?.map(word => ({
          text: word.text,
          startSecond: word.start ?? 0,
          endSecond: word.end ?? 0,
        })) ?? [],
      language: response.language_code,
      durationInSeconds: response.words?.at(-1)?.end ?? undefined,
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
        body: rawResponse,
      },
    };
  }

  async doStream(
    options: TranscriptionModelV4StreamOptions,
  ): Promise<
    Awaited<ReturnType<NonNullable<TranscriptionModelV4['doStream']>>>
  > {
    if (!isRealtimeTranscriptionModelId(this.modelId)) {
      throw new UnsupportedFunctionalityError({
        functionality: `streaming transcription with ${this.modelId}`,
      });
    }

    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const elevenLabsOptions = await parseProviderOptions({
      provider: 'elevenlabs',
      providerOptions: options.providerOptions,
      schema: elevenLabsTranscriptionModelOptionsSchema,
    });
    const streamingOptions = elevenLabsOptions?.streaming;
    const warnings: SharedV4Warning[] = [];

    const rawElevenLabsOptions = options.providerOptions?.elevenlabs ?? {};
    for (const option of [
      'diarize',
      'fileFormat',
      'numSpeakers',
      'tagAudioEvents',
      'timestampsGranularity',
    ]) {
      if (
        rawElevenLabsOptions[option as keyof typeof rawElevenLabsOptions] !=
        null
      ) {
        warnings.push({
          type: 'unsupported',
          feature: `providerOptions.elevenlabs.${option}`,
          details: `ElevenLabs realtime transcription does not support ${option}.`,
        });
      }
    }

    if (
      streamingOptions?.filterBackgroundAudio === true &&
      streamingOptions.includeTimestamps === true
    ) {
      throw new InvalidArgumentError({
        argument: 'providerOptions',
        message:
          'providerOptions.elevenlabs.streaming.filterBackgroundAudio cannot be combined with includeTimestamps',
      });
    }

    const inputFormat = getElevenLabsRealtimeAudioFormat(
      options.inputAudioFormat,
    );
    const url = buildElevenLabsRealtimeTranscriptionUrl({
      baseUrl: toWebSocketUrl(
        this.config.url({
          path: '/v1/speech-to-text/realtime',
          modelId: this.modelId,
        }),
      ),
      inputFormat: inputFormat.audioFormat,
      languageCode: elevenLabsOptions?.languageCode ?? undefined,
      modelId: this.modelId,
      streamingOptions,
    });

    return {
      request: { body: url.toString() },
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
      },
      stream: createElevenLabsRealtimeTranscriptionStream({
        abortSignal: options.abortSignal,
        audio: options.audio,
        headers: combineHeaders(this.config.headers?.(), options.headers),
        includeRawChunks: options.includeRawChunks,
        includeTimestamps: streamingOptions?.includeTimestamps === true,
        language: elevenLabsOptions?.languageCode ?? undefined,
        previousText: streamingOptions?.previousText ?? undefined,
        sampleRate: inputFormat.sampleRate,
        url,
        warnings,
        webSocket: this.config.webSocket,
      }),
    };
  }
}

function getElevenLabsRealtimeAudioFormat(
  inputAudioFormat: TranscriptionModelV4StreamOptions['inputAudioFormat'],
): { audioFormat: string; sampleRate: number } {
  const type = inputAudioFormat.type.toLowerCase();
  const rate = inputAudioFormat.rate;

  if (type === 'audio/pcmu') {
    if (rate != null && rate !== 8000) {
      throw new InvalidArgumentError({
        argument: 'inputAudioFormat',
        message: 'ElevenLabs only supports audio/pcmu at 8000 Hz',
      });
    }
    return { audioFormat: 'ulaw_8000', sampleRate: 8000 };
  }

  const supportedPcmRates = [8000, 16000, 22050, 24000, 44100, 48000];
  const pcmRate = rate ?? 16000;
  if (type !== 'audio/pcm' || !supportedPcmRates.includes(pcmRate)) {
    throw new InvalidArgumentError({
      argument: 'inputAudioFormat',
      message:
        'ElevenLabs realtime transcription supports audio/pcm at 8000, 16000, 22050, 24000, 44100, or 48000 Hz, and audio/pcmu at 8000 Hz',
    });
  }

  return { audioFormat: `pcm_${pcmRate}`, sampleRate: pcmRate };
}

function buildElevenLabsRealtimeTranscriptionUrl({
  baseUrl,
  inputFormat,
  languageCode,
  modelId,
  streamingOptions,
}: {
  baseUrl: URL;
  inputFormat: string;
  languageCode: string | undefined;
  modelId: string;
  streamingOptions:
    | NonNullable<ElevenLabsTranscriptionModelOptions['streaming']>
    | null
    | undefined;
}): URL {
  const url = new URL(baseUrl);
  url.searchParams.set('model_id', modelId);
  url.searchParams.set('audio_format', inputFormat);

  const parameters = {
    commit_strategy: streamingOptions?.commitStrategy,
    enable_logging: streamingOptions?.enableLogging,
    filter_background_audio: streamingOptions?.filterBackgroundAudio,
    include_language_detection: streamingOptions?.includeLanguageDetection,
    include_timestamps: streamingOptions?.includeTimestamps,
    language_code: languageCode,
    min_silence_duration_ms: streamingOptions?.minSilenceDurationMs,
    min_speech_duration_ms: streamingOptions?.minSpeechDurationMs,
    no_verbatim: streamingOptions?.noVerbatim,
    vad_silence_threshold_secs: streamingOptions?.vadSilenceThresholdSecs,
    vad_threshold: streamingOptions?.vadThreshold,
  };
  for (const [key, value] of Object.entries(parameters)) {
    if (value != null) {
      url.searchParams.set(key, String(value));
    }
  }
  for (const keyterm of streamingOptions?.keyterms ?? []) {
    url.searchParams.append('keyterms', keyterm);
  }

  return url;
}

function createElevenLabsRealtimeTranscriptionStream({
  abortSignal,
  audio,
  headers,
  includeRawChunks,
  includeTimestamps,
  language,
  previousText,
  sampleRate,
  url,
  warnings,
  webSocket,
}: {
  abortSignal: AbortSignal | undefined;
  audio: ReadableStream<Uint8Array | string>;
  headers: Record<string, string | undefined>;
  includeRawChunks: boolean | undefined;
  includeTimestamps: boolean;
  language: string | undefined;
  previousText: string | undefined;
  sampleRate: number;
  url: URL;
  warnings: SharedV4Warning[];
  webSocket: ElevenLabsConfig['webSocket'];
}) {
  let finished = false;
  let cleanup: (closeCode?: number) => void = () => {};

  return new ReadableStream({
    start: controller => {
      let audioReader:
        | ReadableStreamDefaultReader<Uint8Array | string>
        | undefined;
      let connection: WebSocketConnection | undefined;
      let detectedLanguage = language;
      let endOfInput = false;
      let segmentIndex = 0;
      let sessionId: string | undefined;
      let committedEventCount = 0;
      let committedEventsAtEndOfInput = 0;
      let finalCommitEventCount: number | undefined;
      let timestampedCommitCount = 0;
      const finalSegments: Array<{
        text: string;
        startSecond: number;
        endSecond: number;
      }> = [];
      const finalTexts: string[] = [];

      cleanup = (closeCode?: number) => {
        if (audioReader != null) {
          void audioReader.cancel().catch(() => {});
        } else {
          void audio.cancel().catch(() => {});
        }
        connection?.close(closeCode);
      };

      const finishWithError = (error: unknown) => {
        if (finished) return;
        finished = true;
        cleanup();
        controller.error(error);
      };

      const finish = () => {
        if (finished) return;
        finished = true;
        controller.enqueue({
          type: 'finish',
          text: finalTexts.join(' ').trim(),
          segments: finalSegments,
          language: detectedLanguage,
          durationInSeconds: finalSegments.at(-1)?.endSecond,
        });
        controller.close();
        cleanup(1000);
      };

      const sendAudio = async (socket: WebSocketLike) => {
        audioReader = audio.getReader();
        let firstChunk = true;
        try {
          while (true) {
            const { done, value } = await audioReader.read();
            if (done || finished) break;
            socket.send(
              JSON.stringify({
                message_type: 'input_audio_chunk',
                audio_base_64: convertToBase64(value),
                commit: false,
                sample_rate: sampleRate,
                ...(firstChunk && previousText != null
                  ? { previous_text: previousText }
                  : {}),
              }),
            );
            firstChunk = false;
            await waitForWebSocketBufferDrain(socket);
          }
        } finally {
          audioReader.releaseLock();
          audioReader = undefined;
        }
        if (!finished) {
          committedEventsAtEndOfInput = committedEventCount;
          endOfInput = true;
          socket.send(
            JSON.stringify({
              message_type: 'input_audio_chunk',
              audio_base_64: '',
              commit: true,
              sample_rate: sampleRate,
            }),
          );
        }
      };

      connection = connectToWebSocket({
        abortSignal,
        headers,
        onAbort: finishWithError,
        onClose: () => {
          if (finished) return;
          if (endOfInput && finalCommitEventCount != null) {
            finish();
            return;
          }
          finishWithError(
            new Error(
              'ElevenLabs realtime transcription stream closed before completion.',
            ),
          );
        },
        onMessageText: async text => {
          const parsed = await safeParseJSON({ text });
          if (!parsed.success) return;
          const raw = parsed.value as ElevenLabsRealtimeTranscriptionEvent;

          if (includeRawChunks) {
            controller.enqueue({ type: 'raw', rawValue: raw });
          }

          if (
            raw.message_type != null &&
            elevenLabsRealtimeErrorTypes.has(raw.message_type)
          ) {
            finishWithError(
              new Error(raw.error ?? 'ElevenLabs realtime transcription error'),
            );
            return;
          }

          switch (raw.message_type) {
            case 'session_started': {
              sessionId = raw.session_id;
              controller.enqueue({ type: 'stream-start', warnings });
              const socket = connection?.socket;
              if (socket == null) {
                finishWithError(new Error('WebSocket is not connected.'));
                break;
              }
              void sendAudio(socket).catch(finishWithError);
              break;
            }
            case 'partial_transcript': {
              controller.enqueue({
                type: 'transcript-partial',
                id: sessionId,
                text: raw.text ?? '',
              });
              break;
            }
            case 'committed_transcript': {
              committedEventCount++;
              const text = raw.text ?? '';
              const id = `${sessionId ?? 'session'}:${segmentIndex++}`;

              if (text.length > 0) {
                finalTexts.push(text);
                controller.enqueue({
                  type: 'transcript-final',
                  id,
                  text,
                });
              }

              // When timestamps are requested, ElevenLabs follows this event
              // with committed_transcript_with_timestamps for the same commit.
              if (
                endOfInput &&
                committedEventCount > committedEventsAtEndOfInput
              ) {
                finalCommitEventCount = committedEventCount;
                if (!includeTimestamps) finish();
              }
              break;
            }
            case 'committed_transcript_with_timestamps': {
              const text = raw.text ?? '';
              const words = raw.words ?? [];
              const timestampedWords = words.filter(
                (word): word is typeof word & { start: number; end: number } =>
                  typeof word.start === 'number' &&
                  typeof word.end === 'number',
              );
              detectedLanguage = raw.language_code ?? detectedLanguage;

              // Normally this is paired with the preceding committed_transcript.
              // Still handle a timestamp-only server response defensively.
              if (
                finalTexts[timestampedCommitCount] == null &&
                text.length > 0
              ) {
                const id = `${sessionId ?? 'session'}:${segmentIndex++}`;
                finalTexts.push(text);
                controller.enqueue({
                  type: 'transcript-final',
                  id,
                  text,
                  startSecond: timestampedWords[0]?.start,
                  endSecond: timestampedWords.at(-1)?.end,
                });
              }
              timestampedCommitCount++;
              finalSegments.push(
                ...timestampedWords.map(word => ({
                  text: word.text ?? '',
                  startSecond: word.start,
                  endSecond: word.end,
                })),
              );

              if (
                endOfInput &&
                timestampedCommitCount > committedEventsAtEndOfInput &&
                (finalCommitEventCount == null ||
                  timestampedCommitCount >= finalCommitEventCount)
              ) {
                finish();
              }
              break;
            }
          }
        },
        onProcessingError: finishWithError,
        onSocketError: () => {
          finishWithError(new Error('ElevenLabs realtime transcription error'));
        },
        url,
        webSocket,
      });
    },

    cancel: () => {
      if (finished) return;
      finished = true;
      cleanup();
    },
  });
}

const elevenlabsTranscriptionResponseSchema = z.object({
  language_code: z.string(),
  language_probability: z.number(),
  text: z.string(),
  words: z
    .array(
      z.object({
        text: z.string(),
        type: z.enum(['word', 'spacing', 'audio_event']),
        start: z.number().nullish(),
        end: z.number().nullish(),
        speaker_id: z.string().nullish(),
        characters: z
          .array(
            z.object({
              text: z.string(),
              start: z.number().nullish(),
              end: z.number().nullish(),
            }),
          )
          .nullish(),
      }),
    )
    .nullish(),
});
