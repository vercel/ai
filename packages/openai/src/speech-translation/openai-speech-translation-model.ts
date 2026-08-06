import {
  InvalidArgumentError,
  type Experimental_SpeechTranslationModelV4 as SpeechTranslationModelV4,
  type Experimental_SpeechTranslationModelV4StreamOptions as SpeechTranslationModelV4StreamOptions,
  type Experimental_SpeechTranslationModelV4StreamPart as SpeechTranslationModelV4StreamPart,
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
  openAISpeechTranslationModelOptions,
  type OpenAISpeechTranslationModelId,
} from './openai-speech-translation-model-options';

type OpenAIRealtimeSpeechTranslationEvent = {
  type?: string;
  delta?: string;
  error?: { message?: string };
};

interface OpenAISpeechTranslationModelConfig extends OpenAIConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

export class OpenAISpeechTranslationModel implements SpeechTranslationModelV4 {
  readonly specificationVersion = 'v4';

  static [WORKFLOW_SERIALIZE](model: OpenAISpeechTranslationModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: OpenAISpeechTranslationModelId;
    config: OpenAISpeechTranslationModelConfig;
  }) {
    return new OpenAISpeechTranslationModel(options.modelId, options.config);
  }

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: OpenAISpeechTranslationModelId,
    private readonly config: OpenAISpeechTranslationModelConfig,
  ) {}

  async doStream(
    options: SpeechTranslationModelV4StreamOptions,
  ): Promise<Awaited<ReturnType<SpeechTranslationModelV4['doStream']>>> {
    if (options.targetLanguage == null) {
      throw new InvalidArgumentError({
        argument: 'targetLanguage',
        message: `targetLanguage is required for translation model '${this.modelId}'.`,
      });
    }

    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    await parseProviderOptions({
      provider: 'openai',
      providerOptions: options.providerOptions,
      schema: openAISpeechTranslationModelOptions,
    });
    const warnings: SharedV4Warning[] = [];

    validateOpenAISpeechTranslationInputAudioFormat(options.inputAudioFormat);

    if (options.sourceLanguage != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'sourceLanguage',
        details:
          'The OpenAI Realtime translation API auto-detects the source language and does not accept a source language.',
      });
    }

    if (options.outputAudioFormat != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'outputAudioFormat',
        details:
          'The OpenAI Realtime translation API always outputs 24kHz 16-bit PCM audio and does not accept an output audio format.',
      });
    }

    const headers = combineHeaders(this.config.headers?.(), options.headers);
    const sessionUpdate = buildOpenAIRealtimeSpeechTranslationSession({
      targetLanguage: options.targetLanguage,
    });

    return {
      request: { body: sessionUpdate },
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
      },
      stream: createOpenAIRealtimeSpeechTranslationStream({
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

function createOpenAIRealtimeSpeechTranslationStream({
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

      let sourceText = '';
      let translationText = '';

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

      const finish = () => {
        if (finished) return;
        finished = true;
        if (sourceText !== '') {
          controller.enqueue({
            type: 'source-transcript-final',
            text: sourceText,
          });
        }
        if (translationText !== '') {
          controller.enqueue({
            type: 'output-text-final',
            text: translationText,
          });
        }
        controller.enqueue({
          type: 'finish',
          sourceText,
          outputText: translationText,
          usage: undefined,
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
                type: 'session.input_audio_buffer.append',
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
          socket.send(JSON.stringify({ type: 'session.close' }));
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
          const raw = parsed.value as OpenAIRealtimeSpeechTranslationEvent;

          if (includeRawChunks) {
            controller.enqueue({ type: 'raw', rawValue: raw });
          }

          switch (raw.type) {
            case 'session.output_audio.delta': {
              // skip empty deltas: an empty `audio` part carries no data
              if (raw.delta) {
                controller.enqueue({
                  type: 'audio',
                  audio: raw.delta,
                });
              }
              break;
            }

            case 'session.output_transcript.delta': {
              translationText += raw.delta ?? '';
              controller.enqueue({
                type: 'output-text-delta',
                delta: raw.delta ?? '',
              });
              break;
            }

            case 'session.input_transcript.delta': {
              sourceText += raw.delta ?? '';
              controller.enqueue({
                type: 'source-transcript-delta',
                delta: raw.delta ?? '',
              });
              break;
            }

            case 'session.closed': {
              finish();
              break;
            }

            case 'error': {
              controller.enqueue({
                type: 'error',
                error: new Error(raw.error?.message ?? 'OpenAI realtime error'),
              });
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

function buildOpenAIRealtimeSpeechTranslationSession({
  targetLanguage,
}: {
  targetLanguage: string;
}) {
  return {
    type: 'session.update',
    session: {
      audio: {
        input: {
          transcription: {
            model: 'gpt-realtime-whisper',
          },
          noise_reduction: null,
        },
        output: {
          language: targetLanguage,
        },
      },
    },
  };
}

function validateOpenAISpeechTranslationInputAudioFormat(
  inputAudioFormat: SpeechTranslationModelV4StreamOptions['inputAudioFormat'],
) {
  if (
    inputAudioFormat.type !== 'audio/pcm' ||
    (inputAudioFormat.rate != null && inputAudioFormat.rate !== 24000)
  ) {
    throw new InvalidArgumentError({
      argument: 'inputAudioFormat',
      message:
        'The OpenAI Realtime translation API only supports 24kHz 16-bit PCM input audio.',
    });
  }
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
