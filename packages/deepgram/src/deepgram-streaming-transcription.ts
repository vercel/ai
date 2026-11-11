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
import {
  isDeepgramFluxTranscriptionModelId,
  streamDeepgramFluxTranscription,
} from './deepgram-flux-streaming-transcription';
import { deepgramTranscriptionModelOptionsSchema } from './deepgram-transcription-model-options';
import { resolveDeepgramWebSocketAuth } from './deepgram-websocket-auth';

type StreamOptions = Parameters<
  NonNullable<TranscriptionModelV4['doStream']>
>[0];

export async function streamDeepgramTranscription(
  modelId: string,
  config: DeepgramConfig & { _internal?: { currentDate?: () => Date } },
  options: StreamOptions,
): Promise<Awaited<ReturnType<NonNullable<TranscriptionModelV4['doStream']>>>> {
  if (isDeepgramFluxTranscriptionModelId(modelId)) {
    return streamDeepgramFluxTranscription(modelId, config, options);
  }

  const encodings = new Map([
    ['audio/pcm', 'linear16'],
    ['audio/pcmu', 'mulaw'],
    ['audio/pcma', 'alaw'],
  ]);
  const encoding = encodings.get(options.inputAudioFormat.type);
  const rate = options.inputAudioFormat.rate;
  if (
    encoding == null ||
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
  const url = toWebSocketUrl(config.url({ path: '/v1/listen', modelId }));
  url.searchParams.set('model', modelId);
  url.searchParams.set('encoding', encoding);
  url.searchParams.set('sample_rate', String(rate));

  const mappings = {
    language: 'language',
    smartFormat: 'smart_format',
    punctuate: 'punctuate',
    diarize: 'diarize',
    fillerWords: 'filler_words',
    redact: 'redact',
    replace: 'replace',
    search: 'search',
    keyterm: 'keyterm',
  } as const;
  for (const [key, value] of Object.entries(providerOptions ?? {})) {
    if (value == null || key === 'streaming') continue;
    const parameter = mappings[key as keyof typeof mappings];
    if (parameter == null) {
      if (value === false) continue;
      warnings.push({
        type: 'unsupported',
        feature: `providerOptions.deepgram.${key}`,
        details:
          'This option is not supported for Deepgram streaming transcription.',
      });
      continue;
    }
    for (const entry of Array.isArray(value) ? value : [value]) {
      url.searchParams.append(parameter, String(entry));
    }
  }
  const streaming = providerOptions?.streaming;
  const streamingMappings = {
    interimResults: 'interim_results',
    endpointing: 'endpointing',
    channels: 'channels',
    multichannel: 'multichannel',
    vadEvents: 'vad_events',
    utteranceEndMs: 'utterance_end_ms',
  } as const;
  for (const [key, value] of Object.entries(streaming ?? {})) {
    if (value == null) continue;
    const parameter = streamingMappings[key as keyof typeof streamingMappings];
    if (parameter == null) {
      warnings.push({
        type: 'unsupported',
        feature: `providerOptions.deepgram.streaming.${key}`,
        details:
          'This option is only supported by Deepgram Flux models (/v2/listen).',
      });
      continue;
    }
    url.searchParams.set(parameter, String(value));
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
        let keepAlive: ReturnType<typeof setInterval> | undefined;
        let inputEnded = false;
        let duration: number | undefined;
        let reportedDuration: number | undefined;
        let language = providerOptions?.language ?? undefined;
        const finalTexts: {
          text: string;
          startSecond: number;
          channelIndex: number;
        }[] = [];
        const segments: {
          text: string;
          startSecond: number;
          endSecond: number;
        }[] = [];

        cleanup = () => {
          clearInterval(keepAlive);
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
        const finish = () => {
          if (finished) return;
          finished = true;
          controller.enqueue({
            type: 'finish',
            text: finalTexts
              .sort(
                (a, b) =>
                  a.startSecond - b.startSecond ||
                  a.channelIndex - b.channelIndex,
              )
              .map(segment => segment.text)
              .join(' '),
            segments: segments.sort((a, b) => a.startSecond - b.startSecond),
            language,
            ...(duration != null ? { durationInSeconds: duration } : {}),
            ...(reportedDuration != null
              ? { usage: { seconds: reportedDuration } }
              : {}),
          });
          controller.close();
          cleanup();
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
            clearInterval(keepAlive);
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
            // Deepgram closes idle connections after ten seconds. Keep an open
            // microphone alive even while its producer has no audio to send.
            keepAlive = setInterval(() => {
              if (finished || socket.readyState !== 1) return;
              try {
                socket.send(JSON.stringify({ type: 'KeepAlive' }));
              } catch (error) {
                fail(error);
              }
            }, 4000);
            void sendAudio(socket).catch(fail);
          },
          async onMessageText(text) {
            if (finished) return;
            const parsed = await safeParseJSON({
              text,
              schema: streamingEventTypeSchema,
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
                schema: streamingErrorSchema,
              });
              fail(
                new Error(
                  event.description ??
                    event.message ??
                    'Deepgram streaming transcription failed.',
                ),
              );
            } else if (parsed.value.type === 'Metadata') {
              const event = await validateTypes({
                value: parsed.rawValue,
                schema: streamingMetadataSchema,
              });
              reportedDuration = event.duration ?? reportedDuration;
              duration = event.duration ?? duration;
              controller.enqueue({
                type: 'response-metadata',
                timestamp,
                modelId,
                body: parsed.rawValue,
              });
              if (inputEnded) finish();
            } else if (parsed.value.type === 'Results') {
              const event = await validateTypes({
                value: parsed.rawValue,
                schema: streamingResultSchema,
              });
              const alternative = event.channel?.alternatives[0];
              if (alternative == null)
                throw new Error(
                  'Deepgram Results event is missing a transcript alternative.',
                );
              const text = alternative.transcript;
              language = alternative.languages?.[0] ?? language;
              const start = event.start ?? 0;
              const end = start + (event.duration ?? 0);
              duration = Math.max(duration ?? 0, end);
              const providerMetadata = {
                deepgram: { speechFinal: event.speech_final ?? false },
              };
              if (event.is_final === true) {
                if (text.length > 0)
                  finalTexts.push({
                    text,
                    startSecond: start,
                    channelIndex: event.channel_index?.[0] ?? 0,
                  });
                segments.push(
                  ...(alternative.words?.map(word => ({
                    text: word.punctuated_word ?? word.word,
                    startSecond: word.start,
                    endSecond: word.end,
                  })) ?? []),
                );
                controller.enqueue({
                  type: 'transcript-final',
                  text,
                  startSecond: start,
                  endSecond: end,
                  channelIndex: event.channel_index?.[0],
                  providerMetadata,
                });
              } else {
                controller.enqueue({
                  type: 'transcript-partial',
                  text,
                  startSecond: start,
                  durationInSeconds: event.duration ?? undefined,
                  channelIndex: event.channel_index?.[0],
                  providerMetadata,
                });
              }
            }
          },
          onSocketError: () =>
            fail(new Error('Deepgram streaming WebSocket error.')),
          onClose({ code, reason }) {
            if (finished) return;
            if (!inputEnded || (code != null && code !== 1000)) {
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

const streamingEventTypeSchema = lazySchema(() =>
  zodSchema(z.object({ type: z.string() })),
);

const streamingMetadataSchema = lazySchema(() =>
  zodSchema(z.object({ duration: z.number().nullish() })),
);

const streamingErrorSchema = lazySchema(() =>
  zodSchema(
    z.object({
      description: z.string().nullish(),
      message: z.string().nullish(),
    }),
  ),
);

const streamingResultSchema = lazySchema(() =>
  zodSchema(
    z.object({
      is_final: z.boolean().nullish(),
      speech_final: z.boolean().nullish(),
      start: z.number().nullish(),
      duration: z.number().nullish(),
      channel_index: z.array(z.number()).nullish(),
      channel: z
        .object({
          alternatives: z.array(
            z.object({
              transcript: z.string(),
              languages: z.array(z.string()).nullish(),
              words: z
                .array(
                  z.object({
                    word: z.string(),
                    punctuated_word: z.string().nullish(),
                    start: z.number(),
                    end: z.number(),
                  }),
                )
                .nullish(),
            }),
          ),
        })
        .nullish(),
    }),
  ),
);
