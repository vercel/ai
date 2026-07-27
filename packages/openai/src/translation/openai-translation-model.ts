import {
  InvalidArgumentError,
  type Experimental_SpeechTranslationModelV4 as SpeechTranslationModelV4,
  type Experimental_SpeechTranslationModelV4StreamOptions as SpeechTranslationModelV4StreamOptions,
  type Experimental_SpeechTranslationModelV4StreamPart as SpeechTranslationModelV4StreamPart,
  type Experimental_SpeechTranslationModelV4Usage as SpeechTranslationModelV4Usage,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  connectToWebSocket,
  convertToBase64,
  parseProviderOptions,
  safeParseJSON,
  serializeModelOptions,
  toWebSocketUrl,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  waitForWebSocketBufferDrain,
  type WebSocketConnection,
  type WebSocketLike,
} from '@ai-sdk/provider-utils';
import type { OpenAIConfig } from '../openai-config';
import {
  openAITranslationModelOptions,
  type OpenAITranslationModelId,
  type OpenAITranslationModelOptions,
} from './openai-translation-model-options';

export type OpenAITranslationStreamOptions = Omit<
  SpeechTranslationModelV4StreamOptions,
  'providerOptions'
> & {
  providerOptions?: {
    openai?: OpenAITranslationModelOptions;
  };
};

type OpenAIRealtimeTranslationEvent = {
  type?: string;
  item_id?: string;
  delta?: string;
  transcript?: string;
  response?: {
    usage?: {
      input_token_details?: {
        audio_tokens?: number;
        text_tokens?: number;
      };
      output_token_details?: {
        audio_tokens?: number;
        text_tokens?: number;
      };
    };
  };
  error?: { message?: string };
};

interface OpenAITranslationModelConfig extends OpenAIConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

export class OpenAITranslationModel implements SpeechTranslationModelV4 {
  readonly specificationVersion = 'v4';

  static [WORKFLOW_SERIALIZE](model: OpenAITranslationModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: OpenAITranslationModelId;
    config: OpenAITranslationModelConfig;
  }) {
    return new OpenAITranslationModel(options.modelId, options.config);
  }

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: OpenAITranslationModelId,
    private readonly config: OpenAITranslationModelConfig,
  ) {}

  async doStream(
    options: OpenAITranslationStreamOptions,
  ): Promise<Awaited<ReturnType<SpeechTranslationModelV4['doStream']>>> {
    if (options.targetLanguage == null) {
      throw new InvalidArgumentError({
        argument: 'targetLanguage',
        message: `targetLanguage is required for translation model '${this.modelId}'.`,
      });
    }

    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const openAIOptions = await parseProviderOptions({
      provider: 'openai',
      providerOptions: options.providerOptions,
      schema: openAITranslationModelOptions,
    });
    const warnings: SharedV4Warning[] = [];

    const headers = combineHeaders(this.config.headers?.(), options.headers);
    const sessionUpdate = buildOpenAIRealtimeTranslationSession({
      modelId: this.modelId,
      inputAudioFormat: options.inputAudioFormat,
      outputAudioFormat: options.outputAudioFormat,
      targetLanguage: options.targetLanguage,
      sourceLanguage: options.sourceLanguage,
      providerOptions: openAIOptions,
    });

    return {
      request: { body: sessionUpdate },
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
      },
      stream: createOpenAIRealtimeTranslationStream({
        webSocket: this.config.webSocket,
        url: toWebSocketUrl(
          this.config.url({
            path: `/realtime/translations?model=${encodeURIComponent(this.modelId)}`,
            modelId: this.modelId,
          }),
        ),
        headers,
        sessionUpdate,
        warnings,
        audio: options.audio,
        abortSignal: options.abortSignal,
        includeRawChunks: options.includeRawChunks,
      }),
    };
  }
}

function createOpenAIRealtimeTranslationStream({
  webSocket,
  url,
  headers,
  sessionUpdate,
  warnings,
  audio,
  abortSignal,
  includeRawChunks,
}: {
  webSocket: OpenAIConfig['webSocket'];
  url: URL;
  headers: Record<string, string | undefined>;
  sessionUpdate: unknown;
  warnings: SharedV4Warning[];
  audio: ReadableStream<Uint8Array | string>;
  abortSignal: AbortSignal | undefined;
  includeRawChunks: boolean | undefined;
}) {
  let finished = false;
  let cleanup: (closeCode?: number) => void = () => {};

  return new ReadableStream<SpeechTranslationModelV4StreamPart>({
    start: controller => {
      const realtimeConnection = getOpenAIRealtimeConnection(headers);
      let audioReader:
        | ReadableStreamDefaultReader<Uint8Array | string>
        | undefined;
      let connection: WebSocketConnection | undefined;

      // Final text accumulation: `done`/`completed` events carry the full
      // segment text; deltas are a fallback when no terminal event arrives
      // for a segment before the response finishes.
      let sourceText = '';
      let sourceDeltaBuffer = '';
      let translationText = '';
      let translationDeltaBuffer = '';

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

      const finish = (usage: SpeechTranslationModelV4Usage | undefined) => {
        if (finished) return;
        finished = true;
        controller.enqueue({
          type: 'finish',
          // concatenate so trailing un-finalized delta buffers are included
          // (buffers are reset on each terminal event, so no double-count):
          sourceText: sourceText + sourceDeltaBuffer,
          outputText: translationText + translationDeltaBuffer,
          usage,
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
              JSON.stringify({
                type: 'input_audio_buffer.append',
                audio: convertToBase64(value),
              }),
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
          socket.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
        }
      };

      connection = connectToWebSocket({
        url,
        protocols: realtimeConnection.protocols,
        headers: realtimeConnection.headers,
        webSocket,
        abortSignal,
        onAbort: finishWithError,
        onProcessingError: finishWithError,
        onOpen: socket => {
          controller.enqueue({ type: 'stream-start', warnings });
          socket.send(JSON.stringify(sessionUpdate));
          void sendAudio(socket).catch(finishWithError);
        },
        onMessageText: async text => {
          if (finished) return;
          const parsed = await safeParseJSON({ text });
          if (!parsed.success) return;
          const raw = parsed.value as OpenAIRealtimeTranslationEvent;

          if (includeRawChunks) {
            controller.enqueue({ type: 'raw', rawValue: raw });
          }

          switch (raw.type) {
            case 'response.output_audio.delta': {
              // skip empty deltas: an empty `audio` part carries no data
              if (raw.delta) {
                controller.enqueue({
                  type: 'audio',
                  id: raw.item_id,
                  audio: raw.delta,
                });
              }
              break;
            }

            case 'response.output_audio_transcript.delta': {
              translationDeltaBuffer += raw.delta ?? '';
              controller.enqueue({
                type: 'output-text-delta',
                id: raw.item_id,
                delta: raw.delta ?? '',
              });
              break;
            }

            case 'response.output_audio_transcript.done': {
              const text = raw.transcript ?? translationDeltaBuffer;
              translationText += text;
              translationDeltaBuffer = '';
              controller.enqueue({
                type: 'output-text-final',
                id: raw.item_id,
                text,
              });
              break;
            }

            case 'conversation.item.input_audio_transcription.delta': {
              sourceDeltaBuffer += raw.delta ?? '';
              controller.enqueue({
                type: 'source-transcript-delta',
                id: raw.item_id,
                delta: raw.delta ?? '',
              });
              break;
            }

            case 'conversation.item.input_audio_transcription.completed': {
              const text = raw.transcript ?? sourceDeltaBuffer;
              sourceText += text;
              sourceDeltaBuffer = '';
              controller.enqueue({
                type: 'source-transcript-final',
                id: raw.item_id,
                text,
              });
              break;
            }

            case 'response.done': {
              finish(extractOpenAIRealtimeUsage(raw));
              break;
            }

            case 'error': {
              finishWithError(
                new Error(raw.error?.message ?? 'OpenAI realtime error'),
              );
              break;
            }
          }
        },
        onSocketError: () => {
          finishWithError(new Error('OpenAI realtime translation error'));
        },
        onClose: ({ code, reason }) => {
          if (finished) return;
          // a close before the finish event is an abnormal termination:
          // surface the close diagnostics instead of silently closing
          finishWithError(
            new Error(
              `OpenAI realtime translation WebSocket closed unexpectedly before finishing` +
                ` (code ${code ?? 'unknown'}${reason ? `, reason: ${reason}` : ''}).`,
            ),
          );
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

function extractOpenAIRealtimeUsage(
  event: OpenAIRealtimeTranslationEvent,
): SpeechTranslationModelV4Usage | undefined {
  const usage = event.response?.usage;
  if (usage == null) {
    return undefined;
  }

  return {
    ...(usage.input_token_details?.audio_tokens != null
      ? { inputAudioTokens: usage.input_token_details.audio_tokens }
      : {}),
    ...(usage.input_token_details?.text_tokens != null
      ? { inputTextTokens: usage.input_token_details.text_tokens }
      : {}),
    ...(usage.output_token_details?.audio_tokens != null
      ? { outputAudioTokens: usage.output_token_details.audio_tokens }
      : {}),
    ...(usage.output_token_details?.text_tokens != null
      ? { outputTextTokens: usage.output_token_details.text_tokens }
      : {}),
  };
}

function buildOpenAIRealtimeTranslationSession({
  modelId,
  inputAudioFormat,
  outputAudioFormat,
  targetLanguage,
  sourceLanguage,
  providerOptions,
}: {
  modelId: string;
  inputAudioFormat: SpeechTranslationModelV4StreamOptions['inputAudioFormat'];
  outputAudioFormat: SpeechTranslationModelV4StreamOptions['outputAudioFormat'];
  targetLanguage: string;
  sourceLanguage: string | undefined;
  providerOptions: OpenAITranslationModelOptions | undefined;
}) {
  return {
    type: 'session.update',
    session: {
      type: 'translation',
      audio: {
        input: {
          format: {
            type: inputAudioFormat.type,
            ...(inputAudioFormat.rate != null
              ? { rate: inputAudioFormat.rate }
              : {}),
          },
          turn_detection: null,
        },
        ...(outputAudioFormat != null || providerOptions?.voice != null
          ? {
              output: {
                ...(outputAudioFormat != null
                  ? {
                      format: {
                        type: outputAudioFormat.type,
                        ...(outputAudioFormat.rate != null
                          ? { rate: outputAudioFormat.rate }
                          : {}),
                      },
                    }
                  : {}),
                ...(providerOptions?.voice != null
                  ? { voice: providerOptions.voice }
                  : {}),
              },
            }
          : {}),
      },
      translation: {
        model: modelId,
        target_language: targetLanguage,
        ...(sourceLanguage != null ? { source_language: sourceLanguage } : {}),
      },
    },
  };
}

// The bearer token rides the `openai-insecure-api-key` subprotocol (native
// `WebSocket` cannot send headers) and the Authorization header is stripped:
// OpenAI rejects handshakes that send both auth channels.
function getOpenAIRealtimeConnection(
  headers: Record<string, string | undefined>,
): {
  protocols: string[];
  headers: Record<string, string | undefined>;
} {
  // last case-variant wins: combineHeaders keeps case-distinct keys and
  // spreads per-call headers after configuration headers
  let authorization: string | undefined;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'authorization' && value != null) {
      authorization = value;
    }
  }
  // the HTTP auth scheme is case-insensitive
  const token = authorization?.match(/^bearer\s+(.+)$/i)?.[1];

  if (token == null) {
    return { protocols: ['realtime'], headers };
  }

  return {
    protocols: ['realtime', `openai-insecure-api-key.${token}`],
    headers: Object.fromEntries(
      Object.entries(headers).filter(
        ([key]) => key.toLowerCase() !== 'authorization',
      ),
    ),
  };
}
