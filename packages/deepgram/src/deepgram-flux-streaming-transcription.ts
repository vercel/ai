import {
  InvalidArgumentError,
  type Experimental_TranscriptionModelV4StreamPart as TranscriptionModelV4StreamPart,
  type SharedV4Warning,
  type TranscriptionModelV4,
} from '@ai-sdk/provider';
import {
  connectToWebSocket,
  convertBase64ToUint8Array,
  lazySchema,
  safeParseJSON,
  parseProviderOptions,
  toWebSocketUrl,
  validateTypes,
  waitForWebSocketBufferDrain,
  zodSchema,
  type WebSocketConnection,
  type WebSocketLike,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { DeepgramConfig } from './deepgram-config';
import { getDeepgramTranscriptionModelEntry } from './deepgram-model-catalog';
import { deepgramTranscriptionModelOptionsSchema } from './deepgram-transcription-model-options';
import { resolveDeepgramWebSocketAuth } from './deepgram-websocket-auth';

type StreamOptions = Parameters<
  NonNullable<TranscriptionModelV4['doStream']>
>[0];

/**
 * Flux models are served only by the turn-based `/v2/listen` WebSocket; the
 * `/v1/listen` batch and live endpoints reject them.
 */
export function isDeepgramFluxTranscriptionModelId(modelId: string): boolean {
  return getDeepgramTranscriptionModelEntry(modelId).requestConfig.transcription
    .flux;
}

/**
 * Milliseconds without audio after which a keepalive is sent, ahead of the
 * server's 60 s inactivity timeout.
 */
export const KEEPALIVE_INTERVAL_MS = 30_000;

// Flux always punctuates and transcribes filler words, so turning these off
// has no effect.
const ALWAYS_ON_OPTIONS = new Set(['punctuate', 'fillerWords']);

type FluxTurn = {
  text: string;
  startSecond: number;
  endSecond: number;
  words: Array<{ text: string; startSecond: number; endSecond: number }>;
  isFinal: boolean;
  providerMetadata: { deepgram: Record<string, string | number | string[]> };
};

// https://developers.deepgram.com/reference/speech-to-text/listen-flux
export async function streamDeepgramFluxTranscription(
  modelId: string,
  config: DeepgramConfig & { _internal?: { currentDate?: () => Date } },
  options: StreamOptions,
): Promise<Awaited<ReturnType<NonNullable<TranscriptionModelV4['doStream']>>>> {
  // Raw single-channel formats, so the audio duration follows from the bytes.
  // `silence` is one sample of silence in the encoding.
  const encodings = new Map([
    [
      'audio/pcm',
      { encoding: 'linear16', bytesPerSample: 2, silence: [0x00, 0x00] },
    ],
    ['audio/pcmu', { encoding: 'mulaw', bytesPerSample: 1, silence: [0xff] }],
    ['audio/pcma', { encoding: 'alaw', bytesPerSample: 1, silence: [0xd5] }],
  ]);
  const inputFormat = encodings.get(options.inputAudioFormat.type);
  const rate = options.inputAudioFormat.rate;
  if (
    inputFormat == null ||
    rate == null ||
    !Number.isInteger(rate) ||
    rate <= 0
  ) {
    throw new InvalidArgumentError({
      argument: 'inputAudioFormat',
      message:
        'Deepgram streaming requires audio/pcm (16-bit little-endian), audio/pcmu, or audio/pcma and a positive integer sample rate.',
    });
  }

  const providerOptions = await parseProviderOptions({
    provider: 'deepgram',
    providerOptions: options.providerOptions,
    schema: deepgramTranscriptionModelOptionsSchema,
  });
  const warnings: SharedV4Warning[] = [];
  const url = toWebSocketUrl(config.url({ path: '/v2/listen', modelId }));
  url.searchParams.set('model', modelId);
  url.searchParams.set('encoding', inputFormat.encoding);
  url.searchParams.set('sample_rate', String(rate));

  const mappings = { redact: 'redact', keyterm: 'keyterm' } as const;
  for (const [key, value] of Object.entries(providerOptions ?? {})) {
    if (value == null || key === 'streaming' || key === 'language') continue;
    const parameter = mappings[key as keyof typeof mappings];
    if (parameter == null) {
      // Disabling a feature that Flux does not have needs no warning.
      if (value === false && !ALWAYS_ON_OPTIONS.has(key)) continue;
      warnings.push({
        type: 'unsupported',
        feature: `providerOptions.deepgram.${key}`,
        details:
          value === false
            ? 'Deepgram Flux always applies this and it cannot be turned off.'
            : 'This option is not supported for Deepgram Flux streaming transcription.',
      });
      continue;
    }
    for (const entry of Array.isArray(value) ? value : [value]) {
      url.searchParams.append(parameter, String(entry));
    }
  }

  const streaming = providerOptions?.streaming;
  const streamingMappings = {
    eotThreshold: 'eot_threshold',
    eagerEotThreshold: 'eager_eot_threshold',
    eotTimeoutMs: 'eot_timeout_ms',
  } as const;
  for (const [key, value] of Object.entries(streaming ?? {})) {
    if (value == null || key === 'languageHints') continue;
    const parameter = streamingMappings[key as keyof typeof streamingMappings];
    if (parameter == null) {
      warnings.push({
        type: 'unsupported',
        feature: `providerOptions.deepgram.streaming.${key}`,
        details:
          'This option is not supported for Deepgram Flux streaming transcription.',
      });
      continue;
    }
    url.searchParams.set(parameter, String(value));
  }

  // A single `language` acts as one hint; Flux has no `language` parameter.
  const languageHints =
    streaming?.languageHints ??
    (providerOptions?.language != null ? [providerOptions.language] : []);
  if (languageHints.length > 0) {
    if (modelId.startsWith('flux-general-multi')) {
      for (const hint of languageHints) {
        url.searchParams.append('language_hint', hint);
      }
    } else {
      // Deepgram rejects the connection when a hint reaches another model.
      warnings.push({
        type: 'unsupported',
        feature:
          streaming?.languageHints != null
            ? 'providerOptions.deepgram.streaming.languageHints'
            : 'providerOptions.deepgram.language',
        details: `Language hints are only supported by flux-general-multi and were ignored for ${modelId}.`,
      });
    }
  }

  const { headers, protocols } = await resolveDeepgramWebSocketAuth({
    config,
    headers: options.headers,
  });
  const timestamp = config._internal?.currentDate?.() ?? new Date();
  let finished = false;
  let cleanup: () => void = () => {};

  return {
    request: { body: url.toString() },
    response: { timestamp, modelId },
    stream: new ReadableStream<TranscriptionModelV4StreamPart>({
      start(controller) {
        let connection: WebSocketConnection | undefined;
        let reader:
          | ReadableStreamDefaultReader<Uint8Array | string>
          | undefined;
        let keepaliveTimer: ReturnType<typeof setTimeout> | undefined;
        let inputEnded = false;
        let sentBytes = 0;
        let language = modelId.startsWith('flux-general-en') ? 'en' : undefined;
        const turns = new Map<number, FluxTurn>();

        cleanup = () => {
          clearTimeout(keepaliveTimer);
          void (
            reader != null ? reader.cancel() : options.audio.cancel()
          ).catch(() => {});
          connection?.close(1000);
        };
        const fail = (error: unknown) => {
          if (finished) return;
          finished = true;
          controller.error(error);
          cleanup();
        };
        const enqueueFinal = (turn: FluxTurn) => {
          turn.isFinal = true;
          controller.enqueue({
            type: 'transcript-final',
            text: turn.text,
            startSecond: turn.startSecond,
            endSecond: turn.endSecond,
            providerMetadata: turn.providerMetadata,
          });
        };
        const finish = () => {
          if (finished) return;
          finished = true;
          const orderedTurns = [...turns.entries()]
            .sort(([a], [b]) => a - b)
            .map(([, turn]) => turn);
          // `CloseStream` does not finalize the active turn: no `EndOfTurn`
          // follows, so its latest transcript is the final one.
          for (const turn of orderedTurns) {
            if (!turn.isFinal && turn.text.length > 0) enqueueFinal(turn);
          }
          controller.enqueue({
            type: 'finish',
            text: orderedTurns
              .map(turn => turn.text)
              .filter(text => text.length > 0)
              .join(' '),
            segments: orderedTurns.flatMap(turn => turn.words),
            language,
            // Flux reports no audio duration or usage summary.
            durationInSeconds: sentBytes / (rate * inputFormat.bytesPerSample),
          });
          controller.close();
          cleanup();
        };
        // Flux closes a connection that receives no audio for 60 s. Only
        // audio or a WebSocket ping resets that timer (`Configure` does not),
        // and native WebSockets cannot send pings, so one sample of silence
        // keeps the connection open while the audio producer is paused, e.g.
        // a muted microphone. It is not counted as sent audio.
        const scheduleKeepalive = (socket: WebSocketLike) => {
          clearTimeout(keepaliveTimer);
          if (finished || inputEnded) return;
          keepaliveTimer = setTimeout(() => {
            if (finished || inputEnded) return;
            try {
              socket.send(new Uint8Array(inputFormat.silence));
              scheduleKeepalive(socket);
            } catch (error) {
              fail(error);
            }
          }, KEEPALIVE_INTERVAL_MS);
        };
        const sendAudio = async (socket: WebSocketLike) => {
          reader = options.audio.getReader();
          try {
            while (true) {
              if (finished) break;
              const { done, value } = await reader.read();
              if (done || finished) break;
              const bytes =
                typeof value === 'string'
                  ? convertBase64ToUint8Array(value)
                  : value;
              if (bytes.byteLength === 0) continue;
              socket.send(bytes);
              sentBytes += bytes.byteLength;
              scheduleKeepalive(socket);
              await waitForWebSocketBufferDrain(socket, {
                abortSignal: options.abortSignal,
              });
            }
          } finally {
            reader.releaseLock();
            reader = undefined;
          }
          if (!finished) {
            inputEnded = true;
            clearTimeout(keepaliveTimer);
            socket.send(JSON.stringify({ type: 'CloseStream' }));
          }
        };

        connection = connectToWebSocket({
          url,
          headers,
          protocols,
          webSocket: config.webSocket,
          abortSignal: options.abortSignal,
          onAbort: fail,
          onProcessingError: fail,
          onOpen(socket) {
            controller.enqueue({ type: 'stream-start', warnings });
            scheduleKeepalive(socket);
            void sendAudio(socket).catch(fail);
          },
          async onMessageText(text) {
            if (finished) return;
            const parsed = await safeParseJSON({
              text,
              schema: fluxEventTypeSchema,
            });
            if (!parsed.success) throw parsed.error;
            if (finished) return;
            if (options.includeRawChunks) {
              controller.enqueue({
                type: 'raw',
                rawValue: parsed.rawValue,
              });
            }
            if (parsed.value.type === 'Error') {
              const event = await validateTypes({
                value: parsed.rawValue,
                schema: fluxErrorSchema,
              });
              fail(
                new Error(
                  event.description ??
                    event.code ??
                    'Deepgram Flux streaming transcription failed.',
                ),
              );
            } else if (parsed.value.type === 'Connected') {
              controller.enqueue({
                type: 'response-metadata',
                timestamp,
                modelId,
                body: parsed.rawValue,
              });
            } else if (parsed.value.type === 'TurnInfo') {
              const event = await validateTypes({
                value: parsed.rawValue,
                schema: fluxTurnInfoSchema,
              });
              language = event.languages?.[0] ?? language;
              const turn: FluxTurn = {
                text: event.transcript,
                startSecond: event.audio_window_start,
                endSecond: event.audio_window_end,
                words:
                  event.words?.flatMap(word =>
                    word.start != null && word.end != null
                      ? [
                          {
                            text: word.word,
                            startSecond: word.start,
                            endSecond: word.end,
                          },
                        ]
                      : [],
                  ) ?? [],
                isFinal: false,
                providerMetadata: {
                  deepgram: {
                    event: event.event,
                    turnIndex: event.turn_index,
                    ...(event.end_of_turn_confidence != null && {
                      endOfTurnConfidence: event.end_of_turn_confidence,
                    }),
                    ...(event.trigger != null && { trigger: event.trigger }),
                    ...(event.languages != null && {
                      languages: event.languages,
                    }),
                  },
                },
              };
              turns.set(event.turn_index, turn);
              if (event.event === 'EndOfTurn') {
                enqueueFinal(turn);
              } else {
                controller.enqueue({
                  type: 'transcript-partial',
                  text: turn.text,
                  startSecond: turn.startSecond,
                  durationInSeconds: turn.endSecond - turn.startSecond,
                  providerMetadata: turn.providerMetadata,
                });
              }
            }
          },
          onSocketError: () =>
            fail(new Error('Deepgram streaming WebSocket error.')),
          onClose({ code, reason }) {
            if (finished) return;
            // After `CloseStream`, Flux closes the socket without a status
            // code (1005) and sends no closing summary message.
            if (
              !inputEnded ||
              (code != null && code !== 1000 && code !== 1005)
            ) {
              fail(
                new Error(
                  `Deepgram streaming connection closed unexpectedly${code != null ? ` (${code})` : ''}${reason ? `: ${reason}` : '.'}`,
                ),
              );
            } else finish();
          },
        });
      },
      cancel() {
        if (finished) return;
        finished = true;
        cleanup();
      },
    }),
  };
}

const fluxEventTypeSchema = lazySchema(() =>
  zodSchema(z.object({ type: z.string() })),
);

const fluxErrorSchema = lazySchema(() =>
  zodSchema(
    z.object({
      code: z.string().nullish(),
      description: z.string().nullish(),
    }),
  ),
);

const fluxTurnInfoSchema = lazySchema(() =>
  zodSchema(
    z.object({
      event: z.string(),
      turn_index: z.number(),
      audio_window_start: z.number(),
      audio_window_end: z.number(),
      transcript: z.string(),
      words: z
        .array(
          z.object({
            word: z.string(),
            start: z.number().nullish(),
            end: z.number().nullish(),
          }),
        )
        .nullish(),
      end_of_turn_confidence: z.number().nullish(),
      trigger: z.string().nullish(),
      languages: z.array(z.string()).nullish(),
    }),
  ),
);
