import {
  InvalidArgumentError,
  type Experimental_TranscriptionModelV4StreamOptions as TranscriptionModelV4StreamOptions,
  type Experimental_TranscriptionModelV4StreamPart as TranscriptionModelV4StreamPart,
  type SharedV4Warning,
  type TranscriptionModelV4,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  connectToWebSocket,
  convertBase64ToUint8Array,
  createJsonResponseHandler,
  parseProviderOptions,
  postToApi,
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
import type { DeepgramTranscriptionAPITypes } from './deepgram-api-types';
import type { DeepgramConfig } from './deepgram-config';
import { deepgramFailedResponseHandler } from './deepgram-error';
import { deepgramTranscriptionModelOptionsSchema } from './deepgram-transcription-model-options';
import type { DeepgramTranscriptionModelId } from './deepgram-transcription-options';

interface DeepgramTranscriptionModelConfig extends DeepgramConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

type DeepgramStreamingTranscriptionEvent = {
  type?: string;
  start: number;
  duration: number;
  is_final?: boolean;
  channel?: {
    alternatives?: Array<{
      transcript?: string;
      words?: Array<{ word: string; start: number; end: number }>;
    }>;
  };
  description?: string;
};

// https://developers.deepgram.com/reference/speech-to-text/listen-streaming
const STREAMING_ENCODINGS: Record<
  string,
  { encoding: string; defaultSampleRate: number }
> = {
  'audio/pcm': { encoding: 'linear16', defaultSampleRate: 16000 },
  'audio/pcmu': { encoding: 'mulaw', defaultSampleRate: 8000 },
  'audio/pcma': { encoding: 'alaw', defaultSampleRate: 8000 },
};

// Options that Deepgram only supports for pre-recorded audio, keyed by
// provider option name, with their query parameter:
const PRE_RECORDED_ONLY_OPTIONS = {
  detectLanguage: 'detect_language',
  paragraphs: 'paragraphs',
  summarize: 'summarize',
  topics: 'topics',
  intents: 'intents',
  sentiment: 'sentiment',
  utterances: 'utterances',
  uttSplit: 'utt_split',
} as const;

export class DeepgramTranscriptionModel implements TranscriptionModelV4 {
  readonly specificationVersion = 'v4';

  get provider(): string {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: DeepgramTranscriptionModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: DeepgramTranscriptionModelId;
    config: DeepgramTranscriptionModelConfig;
  }) {
    return new DeepgramTranscriptionModel(options.modelId, options.config);
  }

  constructor(
    readonly modelId: DeepgramTranscriptionModelId,
    private readonly config: DeepgramTranscriptionModelConfig,
  ) {}

  private async getArgs({
    providerOptions,
  }: Pick<
    Parameters<TranscriptionModelV4['doGenerate']>[0],
    'providerOptions'
  >) {
    const warnings: SharedV4Warning[] = [];

    // Parse provider options
    const deepgramOptions = await parseProviderOptions({
      provider: 'deepgram',
      providerOptions,
      schema: deepgramTranscriptionModelOptionsSchema,
    });

    const body: DeepgramTranscriptionAPITypes = {
      model: this.modelId,
    };

    // Add provider-specific options
    if (deepgramOptions) {
      body.detect_entities = deepgramOptions.detectEntities ?? undefined;
      body.detect_language = deepgramOptions.detectLanguage ?? undefined;
      body.diarize = deepgramOptions.diarize ?? undefined;
      body.filler_words = deepgramOptions.fillerWords ?? undefined;
      body.intents = deepgramOptions.intents ?? undefined;
      body.keyterm = deepgramOptions.keyterm ?? undefined;
      body.language = deepgramOptions.language ?? undefined;
      body.paragraphs = deepgramOptions.paragraphs ?? undefined;
      body.punctuate = deepgramOptions.punctuate ?? undefined;
      body.redact = deepgramOptions.redact ?? undefined;
      body.replace = deepgramOptions.replace ?? undefined;
      body.search = deepgramOptions.search ?? undefined;
      body.sentiment = deepgramOptions.sentiment ?? undefined;
      body.smart_format = deepgramOptions.smartFormat ?? undefined;
      body.summarize = deepgramOptions.summarize ?? undefined;
      body.topics = deepgramOptions.topics ?? undefined;
      body.utterances = deepgramOptions.utterances ?? undefined;
      body.utt_split = deepgramOptions.uttSplit ?? undefined;
    }

    // Convert body to URL query parameters
    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(body)) {
      if (value !== undefined) {
        queryParams.append(key, String(value));
      }
    }

    return {
      queryParams,
      deepgramOptions,
      warnings,
    };
  }

  async doGenerate(
    options: Parameters<TranscriptionModelV4['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<TranscriptionModelV4['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { queryParams, warnings } = await this.getArgs(options);

    const {
      value: response,
      responseHeaders,
      rawValue: rawResponse,
    } = await postToApi({
      url:
        this.config.url({
          path: '/v1/listen',
          modelId: this.modelId,
        }) +
        '?' +
        queryParams.toString(),
      headers: {
        ...combineHeaders(this.config.headers?.(), options.headers),
        'Content-Type': options.mediaType,
      },
      body: {
        content: options.audio,
        values: options.audio,
      },
      failedResponseHandler: deepgramFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        deepgramTranscriptionResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });
    const durationInSeconds = response.metadata?.duration ?? undefined;

    return {
      text:
        response.results?.channels.at(0)?.alternatives.at(0)?.transcript ?? '',
      segments:
        response.results?.channels[0].alternatives[0].words?.map(word => ({
          text: word.word,
          startSecond: word.start,
          endSecond: word.end,
        })) ?? [],
      language:
        response.results?.channels.at(0)?.detected_language ?? undefined,
      durationInSeconds,
      ...(durationInSeconds != null
        ? { usage: { seconds: durationInSeconds } }
        : {}),
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
    const { queryParams, deepgramOptions, warnings } =
      await this.getArgs(options);

    for (const [option, parameter] of Object.entries(
      PRE_RECORDED_ONLY_OPTIONS,
    )) {
      const value = queryParams.get(parameter);
      queryParams.delete(parameter);
      if (value != null && value !== 'false') {
        warnings.push({
          type: 'unsupported',
          feature: `providerOptions.deepgram.${option}`,
          details: `Deepgram streaming transcription does not support ${option}.`,
        });
      }
    }

    const format = STREAMING_ENCODINGS[options.inputAudioFormat.type];
    if (format == null) {
      throw new InvalidArgumentError({
        argument: 'inputAudioFormat',
        message: `Unsupported Deepgram streaming audio format: ${options.inputAudioFormat.type}. Use audio/pcm, audio/pcmu, or audio/pcma.`,
      });
    }

    const streaming = deepgramOptions?.streaming;
    queryParams.set('encoding', format.encoding);
    queryParams.set(
      'sample_rate',
      String(options.inputAudioFormat.rate ?? format.defaultSampleRate),
    );
    queryParams.set(
      'interim_results',
      String(streaming?.interimResults ?? true),
    );
    if (streaming?.endpointing != null) {
      queryParams.set('endpointing', String(streaming.endpointing));
    }

    const url = toWebSocketUrl(
      this.config.url({ path: '/v1/listen', modelId: this.modelId }) +
        '?' +
        queryParams.toString(),
    );

    return {
      request: { body: url.toString() },
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
      },
      stream: createDeepgramStreamingTranscriptionStream({
        webSocket: this.config.webSocket,
        url,
        headers: combineHeaders(this.config.headers?.(), options.headers),
        warnings,
        language: deepgramOptions?.language ?? undefined,
        audio: options.audio,
        abortSignal: options.abortSignal,
        includeRawChunks: options.includeRawChunks,
      }),
    };
  }
}

function createDeepgramStreamingTranscriptionStream({
  webSocket,
  url,
  headers,
  warnings,
  language,
  audio,
  abortSignal,
  includeRawChunks,
}: {
  webSocket: DeepgramConfig['webSocket'];
  url: URL;
  headers: Record<string, string | undefined>;
  warnings: SharedV4Warning[];
  language: string | undefined;
  audio: ReadableStream<Uint8Array | string>;
  abortSignal: AbortSignal | undefined;
  includeRawChunks: boolean | undefined;
}): ReadableStream<TranscriptionModelV4StreamPart> {
  let finished = false;
  let cleanup: (closeCode?: number) => void = () => {};

  return new ReadableStream({
    start: controller => {
      const auth = getDeepgramWebSocketAuth(headers);
      const finalTexts: string[] = [];
      const segments: Array<{
        text: string;
        startSecond: number;
        endSecond: number;
      }> = [];
      let endOfInput = false;
      let audioReader:
        | ReadableStreamDefaultReader<Uint8Array | string>
        | undefined;
      let connection: WebSocketConnection | undefined;

      cleanup = (closeCode?: number) => {
        if (audioReader != null) {
          void audioReader.cancel().catch(() => {});
        } else {
          // Pre-open failure or abort: cancel the caller's audio stream so an
          // upstream producer piping into it does not hang.
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

      const finish = (durationInSeconds: number | undefined) => {
        if (finished) return;
        finished = true;
        controller.enqueue({
          type: 'finish',
          text: finalTexts.join(' '),
          segments,
          language,
          ...(durationInSeconds != null
            ? { durationInSeconds, usage: { seconds: durationInSeconds } }
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
              value instanceof Uint8Array
                ? value
                : convertBase64ToUint8Array(value),
            );
            await waitForWebSocketBufferDrain(socket);
          }
        } finally {
          audioReader.releaseLock();
          audioReader = undefined;
        }

        if (!finished) {
          // Deepgram flushes the remaining results, sends `Metadata`, and
          // then closes the socket:
          socket.send(JSON.stringify({ type: 'CloseStream' }));
          endOfInput = true;
        }
      };

      connection = connectToWebSocket({
        url,
        protocols: auth.protocols,
        headers: auth.headers,
        webSocket,
        abortSignal,
        onAbort: finishWithError,
        onProcessingError: finishWithError,
        onOpen: socket => {
          controller.enqueue({ type: 'stream-start', warnings });
          void sendAudio(socket).catch(finishWithError);
        },
        onMessageText: async text => {
          const parsed = await safeParseJSON({ text });
          if (!parsed.success) return;
          const raw = parsed.value as DeepgramStreamingTranscriptionEvent;

          if (includeRawChunks) {
            controller.enqueue({ type: 'raw', rawValue: raw });
          }

          switch (raw.type) {
            case 'Results': {
              const alternative = raw.channel?.alternatives?.[0];
              const transcript = alternative?.transcript ?? '';

              if (raw.is_final !== true) {
                controller.enqueue({
                  type: 'transcript-partial',
                  text: transcript,
                  startSecond: raw.start,
                  durationInSeconds: raw.duration,
                });
                break;
              }

              if (transcript !== '') {
                finalTexts.push(transcript);
              }
              for (const word of alternative?.words ?? []) {
                segments.push({
                  text: word.word,
                  startSecond: word.start,
                  endSecond: word.end,
                });
              }
              controller.enqueue({
                type: 'transcript-final',
                text: transcript,
                startSecond: raw.start,
                endSecond: raw.start + raw.duration,
              });
              break;
            }

            case 'Metadata': {
              if (endOfInput) {
                finish(raw.duration);
              }
              break;
            }

            // Deepgram reports non-fatal errors as messages and closes the
            // socket on fatal ones, so the stream continues:
            case 'Error': {
              controller.enqueue({
                type: 'error',
                error: new Error(
                  raw.description ?? 'Deepgram streaming transcription error',
                ),
              });
              break;
            }
          }
        },
        onSocketError: () => {
          finishWithError(new Error('Deepgram streaming transcription error'));
        },
        onClose: ({ code, reason }) => {
          finishWithError(
            new Error(
              'Deepgram streaming transcription closed before completion' +
                (code != null
                  ? ` (code ${code}${reason ? `: ${reason}` : ''})`
                  : '') +
                '.',
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

// Native `WebSocket` cannot send headers, so the credential moves from the
// `Authorization` header to the `Sec-WebSocket-Protocol` header, which
// Deepgram documents as `token, <api key>`:
function getDeepgramWebSocketAuth(
  headers: Record<string, string | undefined>,
): {
  protocols: string[] | undefined;
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
  const match = authorization?.match(/^token\s+(.+)$/i);

  if (match == null) {
    return { protocols: undefined, headers };
  }

  return {
    protocols: ['token', match[1]],
    headers: Object.fromEntries(
      Object.entries(headers).filter(
        ([key]) => key.toLowerCase() !== 'authorization',
      ),
    ),
  };
}

const deepgramTranscriptionResponseSchema = z.object({
  metadata: z
    .object({
      duration: z.number(),
    })
    .nullish(),
  results: z
    .object({
      channels: z.array(
        z.object({
          detected_language: z.string().nullish(),
          alternatives: z.array(
            z.object({
              transcript: z.string(),
              words: z.array(
                z.object({
                  word: z.string(),
                  start: z.number(),
                  end: z.number(),
                }),
              ),
            }),
          ),
        }),
      ),
    })
    .nullish(),
});
