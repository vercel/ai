import {
  InvalidArgumentError,
  type Experimental_TranscriptionModelV4StreamOptions as TranscriptionModelV4StreamOptions,
  type SharedV4Warning,
  type TranscriptionModelV4,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  createJsonResponseHandler,
  connectToWebSocket,
  mediaTypeToExtension,
  parseProviderOptions,
  postFormDataToApi,
  safeParseJSON,
  serializeModelOptions,
  toWebSocketUrl,
  waitForWebSocketBufferDrain,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  type FetchFunction,
  type WebSocketConnection,
  type WebSocketConstructor,
  type WebSocketLike,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { xaiFailedResponseHandler } from './xai-error';
import {
  xaiTranscriptionModelOptionsSchema,
  type XaiTranscriptionModelId,
  type XaiTranscriptionModelOptions,
} from './xai-transcription-model-options';

interface XaiTranscriptionModelConfig {
  provider: string;
  baseURL: string | undefined;
  headers?: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
  webSocket?: WebSocketConstructor;
  _internal?: {
    currentDate?: () => Date;
  };
}

type XaiStreamingTranscriptionEvent = {
  type?: string;
  text?: string;
  words?: Array<{ text?: string; start?: number; end?: number }>;
  is_final?: boolean;
  speech_final?: boolean;
  start?: number;
  duration?: number;
  channel_index?: number;
  message?: string;
};

export class XaiTranscriptionModel implements TranscriptionModelV4 {
  readonly specificationVersion = 'v4';

  static [WORKFLOW_SERIALIZE](model: XaiTranscriptionModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: XaiTranscriptionModelId;
    config: XaiTranscriptionModelConfig;
  }) {
    return new XaiTranscriptionModel(options.modelId, options.config);
  }

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: XaiTranscriptionModelId,
    private readonly config: XaiTranscriptionModelConfig,
  ) {}

  private async getArgs({
    audio,
    mediaType,
    providerOptions,
  }: Parameters<TranscriptionModelV4['doGenerate']>[0]) {
    const warnings: SharedV4Warning[] = [];
    const xaiOptions = await parseProviderOptions({
      provider: 'xai',
      providerOptions,
      schema: xaiTranscriptionModelOptionsSchema,
    });

    const formData = new FormData();
    appendXaiSttParams(formData, {
      ...getXaiSttParams(this.modelId, xaiOptions),
      audio_format: xaiOptions?.audioFormat,
      format: xaiOptions?.format,
    });

    const blob =
      audio instanceof Uint8Array
        ? new Blob([audio as Uint8Array<ArrayBuffer>])
        : new Blob([convertBase64ToUint8Array(audio)]);
    const fileExtension = mediaTypeToExtension(mediaType);

    // xAI requires `file` to be the final multipart field.
    formData.append(
      'file',
      new File([blob], 'audio', { type: mediaType }),
      `audio.${fileExtension}`,
    );

    return { formData, warnings };
  }

  async doGenerate(
    options: Parameters<TranscriptionModelV4['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<TranscriptionModelV4['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { formData, warnings } = await this.getArgs(options);

    const {
      value: response,
      responseHeaders,
      rawValue: rawResponse,
    } = await postFormDataToApi({
      url: `${this.config.baseURL ?? 'https://api.x.ai/v1'}/stt`,
      headers: combineHeaders(this.config.headers?.(), options.headers),
      formData,
      failedResponseHandler: xaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        xaiTranscriptionResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    return {
      text: response.text,
      segments:
        response.words?.map(word => ({
          text: word.text,
          startSecond: word.start,
          endSecond: word.end,
        })) ?? [],
      language: response.language || undefined,
      durationInSeconds: response.duration ?? undefined,
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
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const warnings: SharedV4Warning[] = [];
    const xaiOptions = await parseProviderOptions({
      provider: 'xai',
      providerOptions: options.providerOptions,
      schema: xaiTranscriptionModelOptionsSchema,
    });

    if (xaiOptions?.multichannel === true && xaiOptions.channels == null) {
      throw new InvalidArgumentError({
        argument: 'providerOptions',
        message:
          'providerOptions.xai.channels is required when providerOptions.xai.multichannel is true',
      });
    }

    if (xaiOptions?.format != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'providerOptions.xai.format',
        details: 'xAI streaming transcription does not support format.',
      });
    }

    if (
      xaiOptions?.audioFormat == null &&
      !inputAudioFormatEncodings.has(options.inputAudioFormat.type)
    ) {
      warnings.push({
        type: 'other',
        message:
          `Unrecognized inputAudioFormat.type "${options.inputAudioFormat.type}"; ` +
          `falling back to raw PCM encoding. ` +
          `Use ${[...inputAudioFormatEncodings.keys()].join(', ')}, ` +
          `or set providerOptions.xai.audioFormat explicitly.`,
      });
    }

    const url = buildXaiStreamingTranscriptionUrl({
      baseURL: this.config.baseURL ?? 'https://api.x.ai/v1',
      modelId: this.modelId,
      inputAudioFormat: options.inputAudioFormat,
      providerOptions: xaiOptions,
    });
    const headers = combineHeaders(this.config.headers?.(), options.headers);

    return {
      request: { body: url.toString() },
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
      },
      stream: createXaiStreamingTranscriptionStream({
        webSocket: this.config.webSocket,
        url,
        headers,
        warnings,
        language: xaiOptions?.language ?? undefined,
        expectedDoneCount:
          xaiOptions?.multichannel === true ? xaiOptions.channels! : 1,
        audio: options.audio,
        abortSignal: options.abortSignal,
        includeRawChunks: options.includeRawChunks,
      }),
    };
  }
}

function createXaiStreamingTranscriptionStream({
  webSocket,
  url,
  headers,
  warnings,
  language,
  expectedDoneCount,
  audio,
  abortSignal,
  includeRawChunks,
}: {
  webSocket: WebSocketConstructor | undefined;
  url: URL;
  headers: Record<string, string | undefined>;
  warnings: SharedV4Warning[];
  language: string | undefined;
  expectedDoneCount: number;
  audio: ReadableStream<Uint8Array | string>;
  abortSignal: AbortSignal | undefined;
  includeRawChunks: boolean | undefined;
}) {
  let finished = false;
  let cleanup: (closeCode?: number) => void = () => {};

  return new ReadableStream({
    start: controller => {
      const doneTexts = new Map<number, string>();
      // per-channel finalized utterances + latest revisable text, used to
      // reconstruct the finish text (xAI's `transcript.done` has empty text):
      const finalizedTexts = new Map<number, string[]>();
      const pendingTexts = new Map<number, string>();
      let doneDuration: number | undefined;
      let audioReader:
        | ReadableStreamDefaultReader<Uint8Array | string>
        | undefined;
      let connection: WebSocketConnection | undefined;

      cleanup = (closeCode?: number) => {
        if (audioReader != null) {
          void audioReader.cancel().catch(() => {});
        } else {
          // pre-open failure or abort: cancel the caller's audio stream so an
          // upstream producer piping into it does not hang:
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

      const maybeFinish = () => {
        if (finished || doneTexts.size < expectedDoneCount) return;
        finished = true;
        const text = [...doneTexts.entries()]
          .sort(([a], [b]) => a - b)
          .map(([, value]) => value)
          .join('\n');
        controller.enqueue({
          type: 'finish',
          text,
          segments: [],
          language,
          durationInSeconds: doneDuration,
        });
        controller.close();
        cleanup(1000);
      };

      const sendAudio = async (socket: WebSocketLike) => {
        audioReader = audio.getReader();
        try {
          while (true) {
            const { done, value } = await audioReader.read();
            if (done || finished) break;
            socket.send(
              value instanceof Uint8Array
                ? value
                : convertBase64ToUint8Array(value),
            );
            // backpressure: pause reads while the socket buffer is full
            await waitForWebSocketBufferDrain(socket);
          }
        } finally {
          audioReader.releaseLock();
          // unlocked again: cleanup must cancel `audio`, not the reader
          audioReader = undefined;
        }
        if (!finished) {
          socket.send(JSON.stringify({ type: 'audio.done' }));
        }
      };

      connection = connectToWebSocket({
        url,
        headers,
        webSocket,
        abortSignal,
        onAbort: finishWithError,
        onProcessingError: finishWithError,
        onMessageText: async text => {
          const parsed = await safeParseJSON({ text });
          if (!parsed.success) return;
          const raw = parsed.value as XaiStreamingTranscriptionEvent;

          if (includeRawChunks) {
            controller.enqueue({ type: 'raw', rawValue: raw });
          }

          switch (raw.type) {
            case 'transcript.created': {
              controller.enqueue({ type: 'stream-start', warnings });
              const socket = connection?.socket;
              if (socket == null) {
                finishWithError(new Error('WebSocket is not connected.'));
                break;
              }
              void sendAudio(socket).catch(finishWithError);
              break;
            }

            case 'transcript.partial': {
              const id = channelId(raw.channel_index);
              const channelIndex = raw.channel_index ?? 0;
              // only `speech_final` completes an utterance; `is_final`
              // fragments are re-sent/revised later, so they stay partials:
              if (raw.is_final && raw.speech_final) {
                const timing = timingFromXaiEvent(raw);
                if (raw.text) {
                  finalizedTexts.set(channelIndex, [
                    ...(finalizedTexts.get(channelIndex) ?? []),
                    raw.text,
                  ]);
                }
                pendingTexts.delete(channelIndex);
                controller.enqueue({
                  type: 'transcript-final',
                  id,
                  text: raw.text ?? '',
                  ...timing,
                  channelIndex: raw.channel_index,
                });
              } else {
                pendingTexts.set(channelIndex, raw.text ?? '');
                controller.enqueue({
                  type: 'transcript-partial',
                  id,
                  text: raw.text ?? '',
                  startSecond: raw.start,
                  durationInSeconds: raw.duration,
                  channelIndex: raw.channel_index,
                });
              }
              break;
            }

            case 'transcript.done': {
              const channelIndex = raw.channel_index ?? 0;
              // `transcript.done` text is empty; fall back to the
              // accumulated utterances plus any trailing unfinalized text:
              const accumulated = [
                ...(finalizedTexts.get(channelIndex) ?? []),
                ...(pendingTexts.get(channelIndex)
                  ? [pendingTexts.get(channelIndex) as string]
                  : []),
              ].join(' ');
              doneTexts.set(channelIndex, raw.text || accumulated);
              doneDuration = raw.duration ?? doneDuration;
              maybeFinish();
              break;
            }

            case 'error': {
              // xAI STT errors are terminal: surface the server message
              // instead of letting the socket close mask it.
              finishWithError(new Error(raw.message ?? 'xAI STT error'));
              break;
            }
          }
        },
        onSocketError: () => {
          finishWithError(
            new Error(
              'xAI streaming transcription error.' +
                (webSocket == null
                  ? ' Note: the native WebSocket implementation in browsers,' +
                    ' Node.js, Deno, and Bun cannot send the Authorization' +
                    ' header required by xAI. Pass a header-capable WebSocket' +
                    " implementation (e.g. the 'ws' package) via" +
                    ' createXai({ webSocket }).'
                  : ''),
            ),
          );
        },
        onClose: () => {
          if (finished) return;
          finished = true;
          cleanup();
          controller.close();
        },
      });
    },

    cancel: () => {
      if (finished) return;
      finished = true;
      cleanup();
    },
  });
}

function buildXaiStreamingTranscriptionUrl({
  baseURL,
  modelId,
  inputAudioFormat,
  providerOptions,
}: {
  baseURL: string;
  modelId: XaiTranscriptionModelId;
  inputAudioFormat: TranscriptionModelV4StreamOptions['inputAudioFormat'];
  providerOptions: XaiTranscriptionModelOptions | undefined;
}) {
  const url = toWebSocketUrl(`${baseURL}/stt`);
  const params = getXaiSttParams(modelId, providerOptions);

  appendXaiSttParams(url.searchParams, {
    ...params,
    sample_rate: params.sample_rate ?? inputAudioFormat.rate,
    encoding:
      providerOptions?.audioFormat ??
      inputAudioFormatEncodings.get(inputAudioFormat.type) ??
      'pcm',
    interim_results: providerOptions?.streaming?.interimResults,
    endpointing: providerOptions?.streaming?.endpointing,
    smart_turn: providerOptions?.streaming?.smartTurn,
    smart_turn_timeout: providerOptions?.streaming?.smartTurnTimeout,
  });

  return url;
}

function getXaiSttParams(
  modelId: XaiTranscriptionModelId,
  options: XaiTranscriptionModelOptions | undefined,
) {
  return {
    model: modelId || undefined,
    sample_rate: options?.sampleRate,
    language: options?.language,
    multichannel: options?.multichannel,
    channels: options?.channels,
    diarize: options?.diarize,
    filler_words: options?.fillerWords,
    vad_threshold: options?.vadThreshold,
    keyterm: options?.keyterm,
  };
}

function appendXaiSttParams(
  target: { append(name: string, value: string): void },
  params: Record<
    string,
    string | number | boolean | string[] | null | undefined
  >,
) {
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item != null) {
        target.append(key, String(item));
      }
    }
  }
}

const inputAudioFormatEncodings = new Map<
  string,
  NonNullable<XaiTranscriptionModelOptions['audioFormat']>
>([
  ['audio/pcm', 'pcm'],
  ['audio/pcmu', 'mulaw'],
  ['audio/pcma', 'alaw'],
  ['audio/opus', 'opus'],
]);

function channelId(channelIndex: number | undefined): string | undefined {
  return channelIndex == null ? undefined : `channel-${channelIndex}`;
}

function timingFromXaiEvent(event: XaiStreamingTranscriptionEvent) {
  return {
    ...(event.start != null ? { startSecond: event.start } : {}),
    ...(event.start != null && event.duration != null
      ? { endSecond: event.start + event.duration }
      : {}),
  };
}

const xaiTranscriptionResponseSchema = z.object({
  text: z.string(),
  language: z.string().nullish(),
  duration: z.number().nullish(),
  words: z
    .array(
      z.object({
        text: z.string(),
        start: z.number(),
        end: z.number(),
      }),
    )
    .nullish(),
});
