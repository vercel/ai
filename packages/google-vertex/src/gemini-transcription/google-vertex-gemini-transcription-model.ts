import {
  InvalidArgumentError,
  type Experimental_TranscriptionModelV4StreamOptions as TranscriptionModelV4StreamOptions,
  type Experimental_TranscriptionModelV4StreamPart as TranscriptionModelV4StreamPart,
  type JSONObject,
  type SharedV4Warning,
  type TranscriptionModelV4,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  connectToWebSocket,
  convertToBase64,
  createJsonResponseHandler,
  parseProviderOptions,
  postJsonToApi,
  resolve,
  safeParseJSON,
  serializeModelOptions,
  waitForWebSocketBufferDrain,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  type FetchFunction,
  type Resolvable,
  type WebSocketConnection,
  type WebSocketConstructor,
  type WebSocketLike,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { googleVertexFailedResponseHandler } from '../google-vertex-error';
import {
  googleVertexGeminiTranscriptionModelOptions,
  type GoogleVertexGeminiTranscriptionModelId,
  type GoogleVertexTranscriptionModelGeminiOptions,
} from './google-vertex-gemini-transcription-model-options';

const liveWebSocketPath =
  'google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent';

/**
 * After the input audio has ended, finish when no terminal signal
 * (`turnComplete` / idle `interactionStatus`) arrives within this window.
 * Trailing transcripts reset the timer.
 */
const defaultFinishGraceMs = 3000;

/** Live transcription is only supported by `*-live` model variants. */
function isLiveTranscriptionModelId(modelId: string): boolean {
  return modelId.includes('-live');
}

/** Regional Vertex hostname (mirrors the provider's base-URL host rules). */
function vertexHost(location: string): string {
  if (location === 'global') return 'aiplatform.googleapis.com';
  if (location === 'eu' || location === 'us') {
    return `aiplatform.${location}.rep.googleapis.com`;
  }
  return `${location}-aiplatform.googleapis.com`;
}

type GoogleLiveWordInfo = {
  text?: string;
  word?: string;
  startOffset?: string;
  endOffset?: string;
};

type GoogleLiveTranscription = {
  text?: string;
  finished?: boolean;
  languageCode?: string;
  speakerLabel?: string;
  words?: GoogleLiveWordInfo[];
};

type GoogleLiveServerMessage = {
  setupComplete?: unknown;
  serverContent?: {
    inputTranscription?: GoogleLiveTranscription;
    interimInputTranscription?: GoogleLiveTranscription;
    turnComplete?: boolean;
    generationComplete?: boolean;
    interactionStatus?: string;
  };
  inputTranscription?: GoogleLiveTranscription;
  usageMetadata?: JSONObject;
  error?: { message?: string };
};

interface GoogleVertexGeminiTranscriptionModelConfig {
  provider: string;
  /** Regional base URL ending in `/publishers/google`. */
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  webSocket?: WebSocketConstructor;
  project: string;
  location: string;
  _internal?: {
    currentDate?: () => Date;
    finishGraceMs?: number;
  };
}

/**
 * Gemini transcription on Vertex AI. Unary variants transcribe via
 * `generateContent`; live variants stream over the Vertex Live API WebSocket
 * (`LlmBidiService/BidiGenerateContent`) with OAuth Bearer authentication
 * from the provider's resolved headers.
 */
export class GoogleVertexGeminiTranscriptionModel implements TranscriptionModelV4 {
  readonly specificationVersion = 'v4';

  static [WORKFLOW_SERIALIZE](model: GoogleVertexGeminiTranscriptionModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: GoogleVertexGeminiTranscriptionModelId;
    config: GoogleVertexGeminiTranscriptionModelConfig;
  }) {
    return new GoogleVertexGeminiTranscriptionModel(
      options.modelId,
      options.config,
    );
  }

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: GoogleVertexGeminiTranscriptionModelId,
    private readonly config: GoogleVertexGeminiTranscriptionModelConfig,
  ) {}

  private async parseOptions(
    providerOptions: Record<string, unknown> | undefined,
  ): Promise<GoogleVertexTranscriptionModelGeminiOptions | undefined> {
    // The Vertex provider exposes options under `googleVertex`/`vertex`;
    // accept `google` as a cross-namespace fallback (e.g. via the AI Gateway).
    for (const provider of ['googleVertex', 'vertex', 'google'] as const) {
      const parsed = await parseProviderOptions({
        provider,
        providerOptions,
        schema: googleVertexGeminiTranscriptionModelOptions,
      });
      if (parsed != null) return parsed;
    }
    return undefined;
  }

  async doGenerate(
    options: Parameters<TranscriptionModelV4['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<TranscriptionModelV4['doGenerate']>>> {
    if (isLiveTranscriptionModelId(this.modelId)) {
      throw new InvalidArgumentError({
        argument: 'modelId',
        message:
          `Model '${this.modelId}' only supports streaming transcription. ` +
          `Use experimental_streamTranscribe, or a unary model such as 'gemini-3.5-transcribe'.`,
      });
    }

    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const warnings: SharedV4Warning[] = [];
    const googleOptions = await this.parseOptions(options.providerOptions);
    const audioTranscriptionConfig =
      buildAudioTranscriptionConfig(googleOptions);

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: options.mediaType,
                data: convertToBase64(options.audio),
              },
            },
          ],
        },
      ],
      ...(audioTranscriptionConfig != null
        ? { generationConfig: { audioTranscriptionConfig } }
        : {}),
    };

    const {
      value: response,
      responseHeaders,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: `${this.config.baseURL}/models/${this.modelId}:generateContent`,
      headers: combineHeaders(
        this.config.headers ? await resolve(this.config.headers) : undefined,
        options.headers,
      ),
      body: requestBody,
      failedResponseHandler: googleVertexFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        googleVertexGeminiTranscriptionResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const plainText = parts.map(part => part.text ?? '').join('');
    const transcriptionText = parts
      .map(part => part.audioTranscription?.text ?? '')
      .join('');
    const text = plainText !== '' ? plainText : transcriptionText;

    let language: string | undefined;
    const segments: Array<{
      text: string;
      startSecond: number;
      endSecond: number;
    }> = [];
    for (const part of parts) {
      const transcription = part.audioTranscription;
      if (transcription == null) continue;
      language ??= transcription.languageCode ?? undefined;
      for (const word of transcription.words ?? []) {
        const startSecond = parseOffsetSeconds(word.startOffset);
        const endSecond = parseOffsetSeconds(word.endOffset);
        if (word.word == null || startSecond == null || endSecond == null) {
          continue;
        }
        segments.push({ text: word.word, startSecond, endSecond });
      }
    }

    return {
      text,
      segments,
      language,
      durationInSeconds: undefined,
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
        body: rawResponse,
      },
      ...(response.usageMetadata != null
        ? {
            providerMetadata: {
              google: { usageMetadata: response.usageMetadata as JSONObject },
            },
          }
        : {}),
    };
  }

  async doStream(
    options: TranscriptionModelV4StreamOptions,
  ): Promise<
    Awaited<ReturnType<NonNullable<TranscriptionModelV4['doStream']>>>
  > {
    if (!isLiveTranscriptionModelId(this.modelId)) {
      throw new InvalidArgumentError({
        argument: 'modelId',
        message:
          `Model '${this.modelId}' does not support streaming transcription. ` +
          `Use a live model such as 'gemini-3.5-transcribe-live'.`,
      });
    }

    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const warnings: SharedV4Warning[] = [];
    const googleOptions = await this.parseOptions(options.providerOptions);

    validateLiveInputAudioFormat(options.inputAudioFormat);

    // Vertex Live authenticates with the same OAuth Bearer header the HTTP
    // surface uses; a header-capable WebSocket implementation (e.g. `ws`) is
    // required to send it.
    const headers = combineHeaders(
      this.config.headers ? await resolve(this.config.headers) : undefined,
      options.headers,
    );

    const { project, location } = this.config;
    const modelResource = `projects/${project}/locations/${location}/publishers/google/models/${this.modelId}`;
    const url = new URL(
      `wss://${vertexHost(location)}/ws/${liveWebSocketPath}`,
    );

    // NOTE: mirrors the Developer API model — Google's documented setup shape
    // includes `generationConfig.responseModalities: ['TEXT']`, but sending it
    // suppresses the final `inputTranscription` segments; omit generationConfig.
    const setup = {
      model: modelResource,
      inputAudioTranscription:
        buildAudioTranscriptionConfig(googleOptions) ?? {},
    };

    return {
      request: { body: setup },
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
      },
      stream: createVertexLiveTranscriptionStream({
        webSocket: this.config.webSocket,
        url,
        headers,
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

function createVertexLiveTranscriptionStream({
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

  return new ReadableStream<TranscriptionModelV4StreamPart>({
    start: controller => {
      let audioReader:
        | ReadableStreamDefaultReader<Uint8Array | string>
        | undefined;
      let connection: WebSocketConnection | undefined;

      // The Live API contract requires waiting for the `setupComplete`
      // server message before sending realtime input: the audio send loop
      // is gated on this promise.
      let resolveSetupComplete!: () => void;
      const setupComplete = new Promise<void>(resolvePromise => {
        resolveSetupComplete = resolvePromise;
      });

      // Google Live messages carry no response/item IDs; a segment counter
      // generates consistent synthetic IDs. Transcription fragments arrive
      // incrementally and are accumulated per segment; a `finished: true`
      // transcription or `turnComplete` finalizes the current segment.
      let segmentCounter = 0;
      let segmentBuffer = '';
      let fullText = '';
      // Latest revisable interim text: the fallback final when the server
      // never delivers a finished `inputTranscription` segment.
      let latestInterim = '';
      let language: string | undefined;
      let audioEnded = false;
      let usageMetadata: JSONObject | undefined;
      let finishTimer: ReturnType<typeof setTimeout> | undefined;

      const segmentId = () => `google-segment-${segmentCounter}`;

      const cancelPendingFinish = () => {
        if (finishTimer != null) {
          clearTimeout(finishTimer);
          finishTimer = undefined;
        }
      };

      // Trailing transcripts can arrive after audioStreamEnd; without a
      // terminal signal, finish after a quiet grace window. Transcript
      // activity reschedules the timer.
      const schedulePendingFinish = () => {
        if (finished || !audioEnded) return;
        cancelPendingFinish();
        finishTimer = setTimeout(() => {
          finishTimer = undefined;
          finish();
        }, finishGraceMs);
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

      const completeSegment = () => {
        // A finished segment supersedes any interim text it revises.
        if (segmentBuffer === '') {
          if (latestInterim === '') return;
          segmentBuffer = latestInterim;
        }
        latestInterim = '';
        controller.enqueue({
          type: 'transcript-final',
          id: segmentId(),
          text: segmentBuffer,
        });
        fullText += fullText === '' ? segmentBuffer : ` ${segmentBuffer}`;
        segmentBuffer = '';
        segmentCounter++;
      };

      const finish = () => {
        if (finished) return;
        completeSegment();
        finished = true;
        controller.enqueue({
          type: 'finish',
          text: fullText,
          segments: [],
          language,
          durationInSeconds: undefined,
          ...(usageMetadata != null
            ? { providerMetadata: { google: { usageMetadata } } }
            : {}),
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
          schedulePendingFinish();
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
            usageMetadata = message.usageMetadata;
          }

          if (message.error != null) {
            finishWithError(
              new Error(message.error.message ?? 'Vertex Live API error'),
            );
            return;
          }

          const serverContent = message.serverContent;

          // Low-latency revisable transcription while the user is speaking.
          const interim = serverContent?.interimInputTranscription;
          if (interim?.text) {
            schedulePendingFinish();
            latestInterim = interim.text;
            controller.enqueue({
              type: 'transcript-partial',
              id: segmentId(),
              text: interim.text,
            });
          }

          const transcription =
            serverContent?.inputTranscription ?? message.inputTranscription;
          if (transcription != null) {
            if (transcription.languageCode != null) {
              language = transcription.languageCode;
            }
            if (transcription.text) {
              schedulePendingFinish();
              // A real transcription delta supersedes interim fallback text.
              latestInterim = '';
              segmentBuffer += transcription.text;
              controller.enqueue({
                type: 'transcript-delta',
                id: segmentId(),
                delta: transcription.text,
              });
            }
            if (transcription.finished === true) {
              completeSegment();
            }
          }

          if (serverContent?.turnComplete) {
            completeSegment();
          }

          // `interactionStatus` idle (REQUIRES_ACTION in the EAP builds) is
          // the definitive all-processing-complete signal: finish as soon as
          // the input audio has ended.
          const interactionStatus = serverContent?.interactionStatus;
          if (
            audioEnded &&
            (interactionStatus === 'IDLE' ||
              interactionStatus === 'REQUIRES_ACTION' ||
              (serverContent?.turnComplete === true &&
                interactionStatus == null))
          ) {
            finish();
          }
        },
        onSocketError: () => {
          finishWithError(
            new Error(
              'Vertex Live transcription error.' +
                (webSocket == null
                  ? ' Note: the native WebSocket implementation cannot send' +
                    ' the Authorization header required by Vertex. Pass a' +
                    " header-capable WebSocket implementation (e.g. the 'ws'" +
                    ' package) via createVertex({ webSocket }).'
                  : ''),
            ),
          );
        },
        onClose: ({ code, reason }) => {
          if (finished) return;
          // a close after the input audio ended means the server delivered
          // everything it will deliver: finish with the accumulated text
          if (audioEnded) {
            finish();
            return;
          }
          finishWithError(
            new Error(
              `Vertex Live transcription WebSocket closed unexpectedly before finishing` +
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

/**
 * Builds Google's `AudioTranscriptionConfig` from provider options; returns
 * undefined when no options are set.
 */
function buildAudioTranscriptionConfig(
  options: GoogleVertexTranscriptionModelGeminiOptions | undefined,
): Record<string, unknown> | undefined {
  if (options == null) return undefined;
  const config: Record<string, unknown> = {};
  if (options.languageCodes != null) {
    config.languageCodes = options.languageCodes;
  }
  if (options.customVocabulary != null) {
    config.customVocabulary = options.customVocabulary;
  }
  if (options.wordTimestamp != null) {
    config.wordTimestamp = options.wordTimestamp;
  }
  if (options.diarization != null) {
    config.diarization = options.diarization;
  }
  if (options.mode != null) {
    config.mode = options.mode;
  }
  return Object.keys(config).length > 0 ? config : undefined;
}

function validateLiveInputAudioFormat(
  inputAudioFormat: TranscriptionModelV4StreamOptions['inputAudioFormat'],
) {
  if (
    inputAudioFormat.type !== 'audio/pcm' ||
    (inputAudioFormat.rate != null && inputAudioFormat.rate !== 16000)
  ) {
    throw new InvalidArgumentError({
      argument: 'inputAudioFormat',
      message:
        'The Gemini Live transcription API only supports 16kHz 16-bit PCM input audio.',
    });
  }
}

/** Parses a Google duration offset such as `"1s"` or `"9.400s"` to seconds. */
function parseOffsetSeconds(
  offset: string | undefined | null,
): number | undefined {
  if (offset == null) return undefined;
  const parsed = Number.parseFloat(offset);
  return Number.isFinite(parsed) ? parsed : undefined;
}

const googleVertexGeminiTranscriptionWordSchema = z.object({
  word: z.string().nullish(),
  startOffset: z.string().nullish(),
  endOffset: z.string().nullish(),
});

const googleVertexGeminiTranscriptionResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z
              .array(
                z.object({
                  text: z.string().nullish(),
                  audioTranscription: z
                    .object({
                      text: z.string().nullish(),
                      languageCode: z.string().nullish(),
                      speakerLabel: z.string().nullish(),
                      words: z
                        .array(googleVertexGeminiTranscriptionWordSchema)
                        .nullish(),
                    })
                    .nullish(),
                }),
              )
              .nullish(),
          })
          .nullish(),
      }),
    )
    .nullish(),
  usageMetadata: z.record(z.string(), z.unknown()).nullish(),
});
