import {
  InvalidArgumentError,
  type Experimental_SpeechTranslationModelV4 as SpeechTranslationModelV4,
  type Experimental_SpeechTranslationModelV4StreamOptions as SpeechTranslationModelV4StreamOptions,
  type Experimental_SpeechTranslationModelV4StreamPart as SpeechTranslationModelV4StreamPart,
  type Experimental_SpeechTranslationModelV4Usage as SpeechTranslationModelV4Usage,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  connectToWebSocket,
  combineHeaders,
  convertBase64ToUint8Array,
  convertToBase64,
  parseProviderOptions,
  safeParseJSON,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  waitForWebSocketBufferDrain,
  type WebSocketConnection,
  type WebSocketConstructor,
  type WebSocketLike,
} from '@ai-sdk/provider-utils';
import { getModelPath } from '../get-model-path';
import { getRealtimeWebSocketURL } from '../get-realtime-base-url';
import {
  googleSpeechTranslationModelOptions,
  type GoogleSpeechTranslationModelId,
  type GoogleSpeechTranslationModelOptions,
} from './google-speech-translation-model-options';

const liveWebSocketPath =
  'google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

/**
 * After the input audio has ended, finish after this much trailing output
 * silence. Live Translation is continuous and does not emit turnComplete.
 */
const defaultFinishGraceMs = 1000;
const googleLiveOutputAudioRate = 24000;
const pcm16SilenceAmplitudeThreshold = 128;

function getLiveWebSocketURL(baseURL: string, apiKey: string): URL {
  const url = getRealtimeWebSocketURL(baseURL, liveWebSocketPath);
  url.searchParams.set('key', apiKey);
  return url;
}

type GoogleLiveTokensDetail = {
  modality?: string;
  tokenCount?: number;
};

type GoogleLiveServerMessage = {
  setupComplete?: unknown;
  serverContent?: {
    modelTurn?: {
      parts?: Array<{
        inlineData?: { data?: string };
      }>;
    };
    outputTranscription?: { text?: string };
    inputTranscription?: { text?: string };
    turnComplete?: boolean;
  };
  inputTranscription?: { text?: string };
  usageMetadata?: {
    promptTokensDetails?: GoogleLiveTokensDetail[];
    responseTokensDetails?: GoogleLiveTokensDetail[];
  };
  error?: { message?: string };
};

export type GoogleSpeechTranslationModelConfig = {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string | undefined>;
  webSocket?: WebSocketConstructor;
  _internal?: {
    currentDate?: () => Date;
    finishGraceMs?: number;
  };
};

export class GoogleSpeechTranslationModel implements SpeechTranslationModelV4 {
  readonly specificationVersion = 'v4';
  readonly modelId: GoogleSpeechTranslationModelId;

  private readonly config: GoogleSpeechTranslationModelConfig;

  static [WORKFLOW_SERIALIZE](model: GoogleSpeechTranslationModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: GoogleSpeechTranslationModelId;
    config: GoogleSpeechTranslationModelConfig;
  }) {
    return new GoogleSpeechTranslationModel(options.modelId, options.config);
  }

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    modelId: GoogleSpeechTranslationModelId,
    config: GoogleSpeechTranslationModelConfig,
  ) {
    this.modelId = modelId;
    this.config = config;
  }

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
    const googleOptions = await parseProviderOptions({
      provider: 'google',
      providerOptions: options.providerOptions,
      schema: googleSpeechTranslationModelOptions,
    });
    const warnings: SharedV4Warning[] = [];

    validateGoogleSpeechTranslationInputAudioFormat(options.inputAudioFormat);

    if (options.sourceLanguage != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'sourceLanguage',
        details:
          'The Gemini Live translation API auto-detects the source language and does not accept a source language.',
      });
    }

    if (options.outputAudioFormat != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'outputAudioFormat',
        details:
          'The Gemini Live API always outputs 24kHz 16-bit PCM audio and does not accept an output audio format.',
      });
    }

    const headers = combineHeaders(this.config.headers(), options.headers);
    // last case-variant wins: combineHeaders keeps case-distinct keys and
    // spreads per-call headers after configuration headers
    let apiKey: string | undefined;
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === 'x-goog-api-key' && value != null) {
        apiKey = value;
      }
    }
    if (apiKey == null) {
      throw new Error(
        'Google Generative AI API key is required for streaming translation.',
      );
    }
    const webSocketHeaders = Object.fromEntries(
      Object.entries(headers).filter(
        ([key]) => key.toLowerCase() !== 'x-goog-api-key',
      ),
    );

    const setup = buildGoogleLiveSpeechTranslationSetup({
      modelId: this.modelId,
      targetLanguage: options.targetLanguage,
      providerOptions: googleOptions,
    });

    return {
      request: { body: setup },
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
      },
      stream: createGoogleLiveSpeechTranslationStream({
        webSocket: this.config.webSocket,
        url: getLiveWebSocketURL(this.config.baseURL, apiKey),
        headers: webSocketHeaders,
        setup,
        inputAudioRate: options.inputAudioFormat.rate ?? 16000,
        finishGraceMs:
          this.config._internal?.finishGraceMs ?? defaultFinishGraceMs,
        warnings,
        audio: options.audio,
        abortSignal: options.abortSignal,
        includeRawChunks: options.includeRawChunks,
      }),
    };
  }
}

function createGoogleLiveSpeechTranslationStream({
  webSocket,
  url,
  headers,
  setup,
  inputAudioRate,
  finishGraceMs,
  warnings,
  audio,
  abortSignal,
  includeRawChunks,
}: {
  webSocket: WebSocketConstructor | undefined;
  url: URL;
  headers: Record<string, string | undefined>;
  setup: unknown;
  inputAudioRate: number;
  finishGraceMs: number;
  warnings: SharedV4Warning[];
  audio: ReadableStream<Uint8Array | string>;
  abortSignal: AbortSignal | undefined;
  includeRawChunks: boolean | undefined;
}) {
  let finished = false;
  let cleanup: (closeCode?: number) => void = () => {};

  return new ReadableStream<SpeechTranslationModelV4StreamPart>({
    start: controller => {
      let audioReader:
        | ReadableStreamDefaultReader<Uint8Array | string>
        | undefined;
      let connection: WebSocketConnection | undefined;

      // The Live API contract requires waiting for the `setupComplete`
      // server message before sending realtime input: the audio send loop
      // is gated on this promise.
      let resolveSetupComplete!: () => void;
      const setupComplete = new Promise<void>(resolve => {
        resolveSetupComplete = resolve;
      });

      // Google Live messages carry no response/item IDs; a turn counter
      // generates consistent synthetic IDs (like the realtime event mapper).
      let turnCounter = 0;
      // Transcription fragments arrive incrementally and are accumulated per
      // turn; `turnComplete` finalizes the current turn.
      let sourceText = '';
      let sourceTurnBuffer = '';
      let translationText = '';
      let translationTurnBuffer = '';
      let audioEnded = false;
      let usage: SpeechTranslationModelV4Usage | undefined;

      // Live Translation is a continuous pipeline rather than a turn-based
      // model. After audioStreamEnd it keeps sending PCM silence indefinitely
      // and does not emit turnComplete. Drain translated speech, then finish
      // after enough trailing silence. Keep turnComplete handling as a
      // fallback for compatible server implementations and test doubles.
      let openTurn = false;
      let sawTurnComplete = false;
      let trailingSilenceMs = 0;
      let finishTimer: ReturnType<typeof setTimeout> | undefined;

      const itemId = () => `google-item-${turnCounter}`;

      const cancelPendingFinish = () => {
        if (finishTimer != null) {
          clearTimeout(finishTimer);
          finishTimer = undefined;
        }
      };

      const schedulePendingFinish = () => {
        if (finished || finishTimer != null) return;
        finishTimer = setTimeout(() => {
          finishTimer = undefined;
          finish();
        }, finishGraceMs);
      };

      const onTurnActivity = () => {
        openTurn = true;
        trailingSilenceMs = 0;
        cancelPendingFinish();
      };

      cleanup = (closeCode?: number) => {
        cancelPendingFinish();
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
        if (sourceTurnBuffer !== '' || translationTurnBuffer !== '') {
          completeTurn();
        }
        finished = true;
        controller.enqueue({
          type: 'finish',
          sourceText,
          outputText: translationText,
          usage,
        });
        controller.close();
        cleanup(1000);
      };

      const completeTurn = () => {
        if (sourceTurnBuffer !== '') {
          controller.enqueue({
            type: 'source-transcript-final',
            id: itemId(),
            text: sourceTurnBuffer,
          });
          sourceText += sourceTurnBuffer;
          sourceTurnBuffer = '';
        }
        if (translationTurnBuffer !== '') {
          controller.enqueue({
            type: 'output-text-final',
            id: itemId(),
            text: translationTurnBuffer,
          });
          translationText += translationTurnBuffer;
          translationTurnBuffer = '';
        }
        turnCounter++;
      };

      const sendAudio = async (socket: WebSocketLike) => {
        audioReader = audio.getReader();
        try {
          while (true) {
            const { done, value } = await audioReader.read();
            if (done || finished) break;
            socket.send(
              JSON.stringify({
                realtimeInput: {
                  audio: {
                    data: convertToBase64(value),
                    mimeType: `audio/pcm;rate=${inputAudioRate}`,
                  },
                },
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
          socket.send(
            JSON.stringify({ realtimeInput: { audioStreamEnd: true } }),
          );
          audioEnded = true;
          // a turnComplete already received after the final audio chunk
          // satisfies the finish condition:
          if (sawTurnComplete && !openTurn) {
            schedulePendingFinish();
          }
        }
      };

      connection = connectToWebSocket({
        url,
        headers,
        webSocket,
        abortSignal,
        onAbort: finishWithError,
        onProcessingError: finishWithError,
        onOpen: socket => {
          controller.enqueue({ type: 'stream-start', warnings });
          socket.send(JSON.stringify({ setup }));
          // audio may only be sent after the server acknowledged the setup:
          void setupComplete
            .then(() => (finished ? undefined : sendAudio(socket)))
            .catch(finishWithError);
        },
        onMessageText: async text => {
          if (finished) return;
          const parsed = await safeParseJSON({ text });
          if (!parsed.success) return;
          const message = parsed.value as GoogleLiveServerMessage;

          if (includeRawChunks) {
            controller.enqueue({ type: 'raw', rawValue: message });
          }

          if (message.setupComplete != null) {
            resolveSetupComplete();
          }

          if (message.usageMetadata != null) {
            usage = accumulateGoogleLiveUsage(usage, message.usageMetadata);
          }

          if (message.error != null) {
            finishWithError(
              new Error(message.error.message ?? 'Google Live API error'),
            );
            return;
          }

          const inputTranscriptionText =
            message.serverContent?.inputTranscription?.text ??
            message.inputTranscription?.text;
          if (inputTranscriptionText) {
            onTurnActivity();
            sourceTurnBuffer += inputTranscriptionText;
            controller.enqueue({
              type: 'source-transcript-delta',
              id: itemId(),
              delta: inputTranscriptionText,
            });
          }

          const serverContent = message.serverContent;
          if (serverContent == null) {
            return;
          }

          for (const part of serverContent.modelTurn?.parts ?? []) {
            if (part.inlineData?.data) {
              controller.enqueue({
                type: 'audio',
                id: itemId(),
                audio: part.inlineData.data,
              });

              const silenceDurationMs = getPcm16SilenceDurationMs(
                part.inlineData.data,
              );
              if (audioEnded && silenceDurationMs != null) {
                trailingSilenceMs += silenceDurationMs;
                if (trailingSilenceMs >= finishGraceMs) {
                  finish();
                  return;
                }
              } else {
                onTurnActivity();
              }
            }
          }

          if (serverContent.outputTranscription?.text) {
            onTurnActivity();
            translationTurnBuffer += serverContent.outputTranscription.text;
            controller.enqueue({
              type: 'output-text-delta',
              id: itemId(),
              delta: serverContent.outputTranscription.text,
            });
          }

          if (serverContent.turnComplete) {
            completeTurn();
            openTurn = false;
            sawTurnComplete = true;
            if (audioEnded) {
              schedulePendingFinish();
            }
          }
        },
        onSocketError: () => {
          finishWithError(new Error('Google Live translation error'));
        },
        onClose: ({ code, reason }) => {
          if (finished) return;
          // a close while a finish is pending confirms that no further turn
          // activity follows:
          if (finishTimer != null) {
            finish();
            return;
          }
          // a close before the finish condition was reached is an abnormal
          // termination: surface the close diagnostics
          finishWithError(
            new Error(
              `Google Live translation WebSocket closed unexpectedly before finishing` +
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

function accumulateGoogleLiveUsage(
  usage: SpeechTranslationModelV4Usage | undefined,
  usageMetadata: {
    promptTokensDetails?: GoogleLiveTokensDetail[];
    responseTokensDetails?: GoogleLiveTokensDetail[];
  },
): SpeechTranslationModelV4Usage | undefined {
  let inputAudioTokens = usage?.inputAudioTokens;
  let outputAudioTokens = usage?.outputAudioTokens;

  // Live Translation emits periodic usage deltas. Its TEXT prompt detail is
  // internal translation context (the public input is audio-only), so only
  // aggregate the billable input/output audio modalities.
  for (const detail of usageMetadata.promptTokensDetails ?? []) {
    if (detail.modality === 'AUDIO' && detail.tokenCount != null) {
      inputAudioTokens = (inputAudioTokens ?? 0) + detail.tokenCount;
    }
  }

  for (const detail of usageMetadata.responseTokensDetails ?? []) {
    if (detail.modality === 'AUDIO' && detail.tokenCount != null) {
      outputAudioTokens = (outputAudioTokens ?? 0) + detail.tokenCount;
    }
  }

  if (inputAudioTokens == null && outputAudioTokens == null) {
    return usage;
  }

  return {
    ...usage,
    ...(inputAudioTokens != null ? { inputAudioTokens } : {}),
    ...(outputAudioTokens != null ? { outputAudioTokens } : {}),
  };
}

function getPcm16SilenceDurationMs(audio: string): number | undefined {
  let bytes: Uint8Array;
  try {
    bytes = convertBase64ToUint8Array(audio);
  } catch {
    return undefined;
  }

  if (bytes.byteLength < 2) {
    return undefined;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sampleCount = Math.floor(bytes.byteLength / 2);
  for (let i = 0; i < sampleCount; i++) {
    if (Math.abs(view.getInt16(i * 2, true)) > pcm16SilenceAmplitudeThreshold) {
      return undefined;
    }
  }

  return (sampleCount / googleLiveOutputAudioRate) * 1000;
}

function buildGoogleLiveSpeechTranslationSetup({
  modelId,
  targetLanguage,
  providerOptions,
}: {
  modelId: string;
  targetLanguage: string;
  providerOptions: GoogleSpeechTranslationModelOptions | undefined;
}) {
  return {
    model: getModelPath(modelId),
    generationConfig: {
      responseModalities: ['AUDIO'],
      translationConfig: {
        targetLanguageCode: targetLanguage,
        ...(providerOptions?.echoTargetLanguage != null
          ? { echoTargetLanguage: providerOptions.echoTargetLanguage }
          : {}),
      },
    },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
  };
}

function validateGoogleSpeechTranslationInputAudioFormat(
  inputAudioFormat: SpeechTranslationModelV4StreamOptions['inputAudioFormat'],
) {
  if (
    inputAudioFormat.type !== 'audio/pcm' ||
    (inputAudioFormat.rate != null && inputAudioFormat.rate !== 16000)
  ) {
    throw new InvalidArgumentError({
      argument: 'inputAudioFormat',
      message:
        'The Gemini Live translation API only supports 16kHz 16-bit PCM input audio.',
    });
  }
}
