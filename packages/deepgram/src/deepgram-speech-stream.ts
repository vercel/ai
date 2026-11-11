import {
  InvalidArgumentError,
  UnsupportedFunctionalityError,
  type Experimental_SpeechModelV4StreamOptions as SpeechModelV4StreamOptions,
  type Experimental_SpeechModelV4StreamPart as SpeechModelV4StreamPart,
  type Experimental_SpeechModelV4StreamResult as SpeechModelV4StreamResult,
  type Experimental_SpeechModelV4StreamTextPart as SpeechModelV4StreamTextPart,
  type SharedV4AudioFormat,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  connectToWebSocket,
  lazySchema,
  parseProviderOptions,
  safeParseJSON,
  toWebSocketUrl,
  waitForWebSocketBufferDrain,
  zodSchema,
  type WebSocketConnection,
  type WebSocketLike,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { DeepgramConfig } from './deepgram-config';
import {
  composeDeepgramSpeechModelId,
  getIgnoredLanguageWarning,
  getIgnoredVoiceWarning,
  isDeepgramFluxSpeechModelId,
} from './deepgram-speech-model-id';
import { deepgramSpeechModelOptionsSchema } from './deepgram-speech-model-options';
import { resolveDeepgramWebSocketAuth } from './deepgram-websocket-auth';

/**
 * Milliseconds of send inactivity after which a keepalive is sent, ahead of
 * the server's 60 s inactivity timeout.
 */
export const KEEPALIVE_INTERVAL_MS = 30_000;

// The /v2/speak WebSocket emits raw (non-containerized) audio only.
// https://developers.deepgram.com/docs/flux-tts/feature-overview
const OUTPUT_FORMATS: Record<
  string,
  { encoding: string; rates: number[]; defaultRate: number }
> = {
  'audio/pcm': {
    encoding: 'linear16',
    rates: [8000, 16000, 24000, 32000, 44100, 48000],
    defaultRate: 24000,
  },
  'audio/pcmu': { encoding: 'mulaw', rates: [8000, 16000], defaultRate: 8000 },
  'audio/pcma': { encoding: 'alaw', rates: [8000, 16000], defaultRate: 8000 },
};

/**
 * Streams Flux TTS over the turn-based `/v2/speak` WebSocket: text parts are
 * forwarded as they arrive, the end of the text ends the turn, and raw audio
 * frames are emitted until the server reports the session totals.
 *
 * https://developers.deepgram.com/reference/text-to-speech/speak-flux
 */
export async function streamDeepgramSpeech(
  modelId: string,
  config: DeepgramConfig & { _internal?: { currentDate?: () => Date } },
  options: SpeechModelV4StreamOptions,
): Promise<SpeechModelV4StreamResult> {
  if (!isDeepgramFluxSpeechModelId(modelId)) {
    throw new UnsupportedFunctionalityError({
      functionality: `streaming speech with ${modelId}`,
      message: `Deepgram streaming speech requires a Flux TTS model (e.g. 'flux'); ${modelId} is not one. Use generateSpeech instead.`,
    });
  }

  const deepgramOptions = await parseProviderOptions({
    provider: 'deepgram',
    providerOptions: options.providerOptions,
    schema: deepgramSpeechModelOptionsSchema,
  });
  if (deepgramOptions?.callback != null) {
    throw new InvalidArgumentError({
      argument: 'providerOptions.deepgram.callback',
      message:
        'Deepgram streaming speech delivers audio over the WebSocket, so `providerOptions.deepgram.callback` is not supported.',
    });
  }

  const warnings: SharedV4Warning[] = [];
  const upstreamModelId = composeDeepgramSpeechModelId({
    modelId,
    voice: options.voice,
    language: options.language,
    warnings,
  });
  for (const warning of [
    getIgnoredVoiceWarning({ modelId, upstreamModelId, voice: options.voice }),
    getIgnoredLanguageWarning({
      modelId,
      upstreamModelId,
      language: options.language,
    }),
  ]) {
    if (warning != null) warnings.push(warning);
  }

  const outputType = options.outputFormat?.type ?? 'audio/pcm';
  const output = OUTPUT_FORMATS[outputType];
  const rate = options.outputFormat?.rate ?? output?.defaultRate;
  if (output == null || rate == null || !output.rates.includes(rate)) {
    throw new InvalidArgumentError({
      argument: 'outputFormat',
      message:
        'Deepgram streaming speech emits raw audio only: audio/pcm (16-bit little-endian at 8000, 16000, 24000, 32000, 44100, or 48000 Hz), audio/pcmu, or audio/pcma (8000 or 16000 Hz).',
    });
  }
  const audioFormat: SharedV4AudioFormat = { type: outputType, rate };

  // The socket rejects the batch-only media and callback parameters.
  for (const key of [
    'encoding',
    'container',
    'sampleRate',
    'bitRate',
    'callbackMethod',
  ] as const) {
    if (deepgramOptions?.[key] != null) {
      warnings.push({
        type: 'unsupported',
        feature: `providerOptions.deepgram.${key}`,
        details:
          'This option is not supported for Deepgram streaming speech. The audio format is selected with `outputFormat`.',
      });
    }
  }
  if (options.instructions) {
    warnings.push({
      type: 'unsupported',
      feature: 'instructions',
      details:
        'Deepgram TTS does not support instructions. Instructions parameter was ignored.',
    });
  }

  const url = toWebSocketUrl(config.url({ path: '/v2/speak', modelId }));
  url.searchParams.set('model', upstreamModelId);
  url.searchParams.set('encoding', output.encoding);
  url.searchParams.set('sample_rate', String(rate));
  if (options.speed != null) {
    url.searchParams.set('speed', String(options.speed));
  }
  if (deepgramOptions?.expressivity != null) {
    url.searchParams.set('expressivity', String(deepgramOptions.expressivity));
  }
  if (deepgramOptions?.mipOptOut != null) {
    url.searchParams.set('mip_opt_out', String(deepgramOptions.mipOptOut));
  }
  if (deepgramOptions?.tag != null) {
    for (const tag of [deepgramOptions.tag].flat()) {
      url.searchParams.append('tag', tag);
    }
  }

  const { headers, protocols } = await resolveDeepgramWebSocketAuth({
    config,
    headers: options.headers,
  });
  // The voice segment of `flux-<voice>-<language>`.
  const streamVoice = upstreamModelId.slice(
    'flux-'.length,
    upstreamModelId.lastIndexOf('-'),
  );
  const timestamp = config._internal?.currentDate?.() ?? new Date();
  let finished = false;
  let cleanup: (closeCode?: number) => void = () => {};

  return {
    request: { body: url.toString() },
    response: { timestamp, modelId },
    stream: new ReadableStream<SpeechModelV4StreamPart>({
      start(controller) {
        let connection: WebSocketConnection | undefined;
        let textReader:
          | ReadableStreamDefaultReader<SpeechModelV4StreamTextPart>
          | undefined;
        let keepaliveTimer: ReturnType<typeof setTimeout> | undefined;
        let inputEnded = false;
        let sentCharacters = 0;
        let requestId: string | undefined;
        let modelName: string | undefined;

        cleanup = (closeCode?: number) => {
          clearTimeout(keepaliveTimer);
          void (
            textReader != null ? textReader.cancel() : options.text.cancel()
          ).catch(() => {});
          connection?.close(closeCode);
        };
        const fail = (error: unknown) => {
          if (finished) return;
          finished = true;
          cleanup();
          controller.error(error);
        };

        // The server closes a session after 60 s without a client message.
        // Native WebSockets cannot send pings, so an empty `Configure` (which
        // changes nothing) resets the timer while the text producer is idle.
        // The idle clock starts when the socket opens (the first text part can
        // be slow too) and restarts on every send; none follows the end of
        // input.
        const scheduleKeepalive = (socket: WebSocketLike) => {
          clearTimeout(keepaliveTimer);
          if (finished || inputEnded) return;
          keepaliveTimer = setTimeout(() => {
            if (finished || inputEnded) return;
            try {
              send(socket, { type: 'Configure' });
            } catch (error) {
              fail(error);
            }
          }, KEEPALIVE_INTERVAL_MS);
        };
        const send = (
          socket: WebSocketLike,
          message: Record<string, unknown>,
        ) => {
          socket.send(JSON.stringify(message));
          scheduleKeepalive(socket);
        };

        const sendText = async (socket: WebSocketLike) => {
          const reader = options.text.getReader();
          textReader = reader;
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done || finished) break;
              const partVoice = value.voice?.trim();
              if (partVoice != null && partVoice !== streamVoice) {
                throw new InvalidArgumentError({
                  argument: 'text',
                  message: `Deepgram streaming speech uses a single voice per stream ("${streamVoice}"); a text part requested "${partVoice}".`,
                });
              }
              if (value.text.length === 0) continue;
              // The server concatenates `Speak` text verbatim, so parts can
              // split anywhere without client-side buffering.
              send(socket, { type: 'Speak', text: value.text });
              sentCharacters += Array.from(value.text).length;
              await waitForWebSocketBufferDrain(socket, {
                abortSignal: options.abortSignal,
              });
            }
          } finally {
            reader.releaseLock();
            if (textReader === reader) {
              textReader = undefined;
            }
          }
          if (!finished) {
            inputEnded = true;
            // `Flush` ends the turn; `Close` drains its remaining audio,
            // after which the server reports the totals and closes.
            if (sentCharacters > 0) {
              send(socket, { type: 'Flush' });
            }
            send(socket, { type: 'Close' });
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
            void sendText(socket).catch(fail);
          },
          onMessageBinary(bytes) {
            if (finished || bytes.byteLength === 0) return;
            controller.enqueue({ type: 'audio', audio: bytes, audioFormat });
          },
          async onMessageText(text) {
            if (finished) return;
            const parsed = await safeParseJSON({
              text,
              schema: speechStreamEventSchema,
            });
            if (!parsed.success) throw parsed.error;
            if (finished) return;
            if (options.includeRawChunks) {
              controller.enqueue({ type: 'raw', rawValue: parsed.rawValue });
            }
            const event = parsed.value;
            if (event.type === 'Error') {
              fail(
                new Error(
                  `Deepgram speech stream error: ${event.description ?? event.code ?? 'unknown error'}`,
                ),
              );
            } else if (event.type === 'Connected') {
              requestId = event.request_id ?? undefined;
              modelName = event.model_name ?? undefined;
              controller.enqueue({
                type: 'response-metadata',
                timestamp,
                modelId,
                body: parsed.rawValue,
              });
            } else if (event.type === 'SessionMetadata') {
              // Sent once, after all audio and just before the server closes.
              finished = true;
              const charCount = event.total_billable_character_count;
              controller.enqueue({
                type: 'finish',
                usage: {
                  inputCharacters: charCount ?? sentCharacters,
                  raw: {
                    ...(event.total_audio_duration_ms != null && {
                      total_audio_duration_ms: event.total_audio_duration_ms,
                    }),
                    ...(event.total_input_character_count != null && {
                      total_input_character_count:
                        event.total_input_character_count,
                    }),
                    ...(charCount != null && {
                      total_billable_character_count: charCount,
                    }),
                  },
                },
                providerMetadata: {
                  deepgram: {
                    ...(modelName != null && { modelName }),
                    ...(charCount != null && { charCount }),
                    ...(requestId != null && { requestId }),
                  },
                },
              });
              controller.close();
              cleanup(1000);
            }
          },
          onSocketError: () =>
            fail(new Error('Deepgram speech stream WebSocket error.')),
          onClose({ code, reason }) {
            if (finished) return;
            fail(
              new Error(
                `Deepgram speech stream closed before completion${code != null ? ` (${code})` : ''}${reason ? `: ${reason}` : '.'}`,
              ),
            );
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

const speechStreamEventSchema = lazySchema(() =>
  zodSchema(
    z.object({
      type: z.string(),
      code: z.string().nullish(),
      description: z.string().nullish(),
      request_id: z.string().nullish(),
      model_name: z.string().nullish(),
      total_audio_duration_ms: z.number().nullish(),
      total_input_character_count: z.number().nullish(),
      total_billable_character_count: z.number().nullish(),
    }),
  ),
);
