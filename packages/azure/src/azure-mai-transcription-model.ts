import {
  InvalidArgumentError,
  UnsupportedFunctionalityError,
  type Experimental_TranscriptionModelV4StreamPart as TranscriptionModelV4StreamPart,
  type SharedV4Warning,
  type TranscriptionModelV4,
} from '@ai-sdk/provider';
import {
  connectToWebSocket,
  convertToBase64,
  safeParseJSON,
  toWebSocketUrl,
  waitForWebSocketBufferDrain,
  type WebSocketConnection,
  type WebSocketConstructor,
  type WebSocketLike,
} from '@ai-sdk/provider-utils';
import type { AzureTranscriptionModelMaiOptions } from './azure-mai-transcription-model-options';

type StreamOptions = Parameters<
  NonNullable<TranscriptionModelV4['doStream']>
>[0];

const SUPPORTED_SAMPLE_RATES = [16000, 24000];
const DEFAULT_SAMPLE_RATE = 24000;

/**
 * MAI streaming transcription over the OpenAI Realtime-compatible
 * `/mai/v1/realtime` WebSocket. The model ID is the Foundry deployment name.
 */
export class AzureMaiTranscriptionModel implements TranscriptionModelV4 {
  readonly specificationVersion = 'v4';
  readonly provider = 'azure.transcription';

  constructor(
    readonly modelId: string,
    private readonly config: {
      url: () => string;
      headers: () =>
        | Record<string, string | undefined>
        | PromiseLike<Record<string, string | undefined>>;
      webSocket?: WebSocketConstructor;
      _internal?: { currentDate?: () => Date };
    },
  ) {}

  async doGenerate(): Promise<
    Awaited<ReturnType<TranscriptionModelV4['doGenerate']>>
  > {
    throw new UnsupportedFunctionalityError({
      functionality: `file transcription with ${this.modelId} (use streaming transcription)`,
    });
  }

  async doStream(
    options: StreamOptions,
    maiOptions: AzureTranscriptionModelMaiOptions = {},
    warnings: SharedV4Warning[] = [],
  ): Promise<
    Awaited<ReturnType<NonNullable<TranscriptionModelV4['doStream']>>>
  > {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { type, rate = DEFAULT_SAMPLE_RATE } = options.inputAudioFormat;
    if (type !== 'audio/pcm' || !SUPPORTED_SAMPLE_RATES.includes(rate)) {
      throw new InvalidArgumentError({
        argument: 'inputAudioFormat',
        message: `MAI streaming transcription requires 16-bit mono PCM (audio/pcm) at 16000 or 24000 Hz, got ${type}${options.inputAudioFormat.rate != null ? ` at ${rate} Hz` : ''}.`,
      });
    }

    const sessionUpdate = {
      type: 'session.update',
      session: {
        type: 'transcription',
        audio: {
          input: {
            format: { type: 'audio/pcm', rate },
            transcription: {
              model: this.modelId,
              ...(maiOptions.language != null
                ? { language: maiOptions.language }
                : {}),
            },
            // MAI supports neither server VAD nor noise reduction; the stream
            // commits once when the input audio ends.
            turn_detection: null,
            noise_reduction: null,
          },
        },
      },
    };

    return {
      request: { body: sessionUpdate },
      response: { timestamp: currentDate, modelId: this.modelId },
      stream: createMaiTranscriptionStream({
        ...getConnection({
          url: toWebSocketUrl(this.config.url()),
          headers: {
            ...(await this.config.headers()),
            ...options.headers,
          },
          supportsHeaders: this.config.webSocket != null,
        }),
        webSocket: this.config.webSocket,
        sessionUpdate,
        bytesPerSecond: rate * 2,
        language: maiOptions.language,
        warnings,
        audio: options.audio,
        abortSignal: options.abortSignal,
        includeRawChunks: options.includeRawChunks,
      }),
    };
  }
}

// Native WebSocket constructors cannot send headers, so the key moves to the
// `api-key` query parameter that MAI also accepts.
function getConnection({
  url,
  headers,
  supportsHeaders,
}: {
  url: URL;
  headers: Record<string, string | undefined>;
  supportsHeaders: boolean;
}) {
  if (supportsHeaders) {
    return { url, headers };
  }
  const remaining: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'api-key') {
      if (value != null) url.searchParams.set('api-key', value);
    } else {
      remaining[key] = value;
    }
  }
  return { url, headers: remaining };
}

type MaiRealtimeEvent = {
  type?: string;
  item_id?: string;
  delta?: string;
  intermediate?: string;
  transcript?: string;
  error?: { message?: string; code?: string };
};

function createMaiTranscriptionStream({
  url,
  headers,
  webSocket,
  sessionUpdate,
  bytesPerSecond,
  language,
  warnings,
  audio,
  abortSignal,
  includeRawChunks,
}: {
  url: URL;
  headers: Record<string, string | undefined>;
  webSocket: WebSocketConstructor | undefined;
  sessionUpdate: unknown;
  bytesPerSecond: number;
  language: string | undefined;
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
      let audioStarted = false;
      let committed = false;
      let audioBytes = 0;
      let deltas = '';

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

      const finish = (text: string) => {
        if (finished) return;
        finished = true;
        controller.enqueue({
          type: 'finish',
          text,
          segments: [],
          language,
          ...(audioBytes > 0
            ? { durationInSeconds: audioBytes / bytesPerSecond }
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
            const base64 = convertToBase64(value);
            if (base64.length === 0) continue;
            audioBytes +=
              typeof value === 'string'
                ? base64ByteLength(base64)
                : value.byteLength;
            socket.send(
              JSON.stringify({
                type: 'input_audio_buffer.append',
                audio: base64,
              }),
            );
            await waitForWebSocketBufferDrain(socket);
          }
        } finally {
          audioReader.releaseLock();
          audioReader = undefined;
        }
        if (finished) return;
        if (audioBytes === 0) {
          finish('');
          return;
        }
        committed = true;
        socket.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
      };

      connection = connectToWebSocket({
        url,
        headers,
        webSocket,
        abortSignal,
        onAbort: finishWithError,
        onProcessingError: finishWithError,
        onOpen: () => {
          controller.enqueue({ type: 'stream-start', warnings });
        },
        onMessageText: async text => {
          const parsed = await safeParseJSON({ text });
          if (!parsed.success) return;
          const event = parsed.value as MaiRealtimeEvent;
          const socket = connection?.socket;

          if (includeRawChunks) {
            controller.enqueue({ type: 'raw', rawValue: event });
          }

          switch (event.type) {
            case 'session.created': {
              socket?.send(JSON.stringify(sessionUpdate));
              break;
            }

            // Settings are locked after the first append, so audio waits for
            // the server to acknowledge the session configuration.
            case 'session.updated': {
              if (audioStarted || socket == null) break;
              audioStarted = true;
              void sendAudio(socket).catch(finishWithError);
              break;
            }

            case 'conversation.item.input_audio_transcription.delta': {
              deltas += event.delta ?? '';
              controller.enqueue({
                type: 'transcript-delta',
                id: event.item_id,
                delta: event.delta ?? '',
              });
              break;
            }

            // MAI-specific: the provisional text after the latest delta.
            case 'conversation.item.input_audio_transcription.intermediate': {
              controller.enqueue({
                type: 'transcript-partial',
                id: event.item_id,
                text: event.intermediate ?? '',
              });
              break;
            }

            case 'conversation.item.input_audio_transcription.completed': {
              const transcript = event.transcript ?? deltas;
              controller.enqueue({
                type: 'transcript-final',
                id: event.item_id,
                text: transcript,
              });
              if (committed) finish(transcript);
              break;
            }

            case 'conversation.item.input_audio_transcription.failed':
            case 'error': {
              finishWithError(
                new Error(
                  `Azure MAI transcription error${event.error?.code != null ? ` (${event.error.code})` : ''}: ${event.error?.message ?? 'unknown error'}`,
                ),
              );
              break;
            }
          }
        },
        onSocketError: () => {
          finishWithError(new Error('Azure MAI transcription WebSocket error'));
        },
        onClose: ({ code, reason }) => {
          finishWithError(
            new Error(
              `Azure MAI transcription connection closed before the transcript completed${code != null ? ` (code ${code}${reason ? `: ${reason}` : ''})` : ''}`,
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

function base64ByteLength(base64: string) {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return (base64.length * 3) / 4 - padding;
}
