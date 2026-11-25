import {
  InvalidArgumentError,
  type Experimental_TranscriptionModelV4StreamOptions as TranscriptionModelV4StreamOptions,
  type Experimental_TranscriptionModelV4StreamPart as TranscriptionModelV4StreamPart,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  connectToWebSocket,
  convertUint8ArrayToBase64,
  convertBase64ToUint8Array,
  lazySchema,
  parseProviderOptions,
  safeParseJSON,
  safeValidateTypes,
  toWebSocketUrl,
  waitForWebSocketBufferDrain,
  zodSchema,
  type WebSocketConnection,
  type WebSocketConstructor,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { mistralTranscriptionModelOptions } from './mistral-transcription-model-options';

export async function streamMistralTranscription({
  modelId,
  baseURL,
  headers,
  webSocket,
  currentDate,
  ...options
}: TranscriptionModelV4StreamOptions & {
  modelId: string;
  baseURL: string;
  webSocket?: WebSocketConstructor;
  currentDate: Date;
}) {
  const mistralOptions = await parseProviderOptions({
    provider: 'mistral',
    providerOptions: options.providerOptions,
    schema: mistralTranscriptionModelOptions,
  });
  const { type, rate = 16000 } = options.inputAudioFormat;
  if (type !== 'audio/pcm' || !Number.isInteger(rate) || rate <= 0) {
    throw new InvalidArgumentError({
      argument: 'inputAudioFormat',
      message:
        'Mistral realtime transcription requires audio/pcm (mono, signed 16-bit little-endian) with a positive integer sample rate.',
    });
  }

  const warnings: SharedV4Warning[] = [];
  for (const option of [
    'returnLanguage',
    'temperature',
    'timestampGranularities',
  ] as const) {
    if (mistralOptions?.[option] != null) {
      warnings.push({
        type: 'unsupported',
        feature: `providerOptions.mistral.${option}`,
        details: 'This option is not supported for realtime transcription.',
      });
    }
  }

  const turnDetection = mistralOptions?.turnDetection;
  const session = {
    audio_format: { encoding: 'pcm_s16le', sample_rate: rate },
    target_streaming_delay_ms: mistralOptions?.targetStreamingDelayMs,
    language: mistralOptions?.language,
    context_bias: mistralOptions?.contextBias,
    diarize: mistralOptions?.diarize,
    speaker_references: mistralOptions?.speakerReferences,
    turn_detection:
      turnDetection == null
        ? undefined
        : {
            start_threshold: turnDetection.startThreshold,
            eager_end_threshold: turnDetection.eagerEndThreshold,
            end_threshold: turnDetection.endThreshold,
            min_silence_ms: turnDetection.minSilenceMs,
            end_timeout_ms: turnDetection.endTimeoutMs,
          },
  };
  const url = toWebSocketUrl(`${baseURL}/audio/transcriptions/realtime`);
  url.searchParams.set('model', modelId);
  let finished = false;
  let cleanup: () => void = () => {};

  return {
    request: { body: url.toString() },
    response: { timestamp: currentDate, modelId },
    stream: new ReadableStream<TranscriptionModelV4StreamPart>({
      start(controller) {
        let connection: WebSocketConnection | undefined;
        let reader:
          | ReadableStreamDefaultReader<Uint8Array | string>
          | undefined;
        let configured = false;
        let sending = false;
        const stop = new AbortController();

        cleanup = () => {
          stop.abort();
          void (
            reader != null ? reader.cancel() : options.audio.cancel()
          ).catch(() => {});
          connection?.close(1000);
        };
        const fail = (error: unknown) => {
          if (finished) return;
          finished = true;
          cleanup();
          controller.error(error);
        };
        const sendAudio = async () => {
          const socket = connection!.socket!;
          reader = options.audio.getReader();
          try {
            while (true) {
              if (finished) break;
              const { done, value } = await reader.read();
              if (finished || done) break;
              const bytes =
                typeof value === 'string'
                  ? convertBase64ToUint8Array(value)
                  : value;
              // Keep each message below Mistral's 256 KiB limit, including
              // base64 expansion, even when the caller supplies a large chunk.
              for (let offset = 0; offset < bytes.length; offset += 64 * 1024) {
                if (finished) break;
                socket.send(
                  JSON.stringify({
                    type: 'input_audio.append',
                    audio: convertUint8ArrayToBase64(
                      bytes.subarray(offset, offset + 64 * 1024),
                    ),
                  }),
                );
                await waitForWebSocketBufferDrain(socket, {
                  abortSignal: stop.signal,
                });
              }
            }
            if (!finished) {
              socket.send(JSON.stringify({ type: 'input_audio.end' }));
            }
          } finally {
            reader.releaseLock();
            reader = undefined;
          }
        };

        controller.enqueue({ type: 'stream-start', warnings });
        connection = connectToWebSocket({
          url,
          headers,
          webSocket,
          abortSignal: options.abortSignal,
          onAbort: fail,
          onProcessingError: fail,
          onMessageText: async text => {
            if (finished) return;
            const parsed = await safeParseJSON({
              text,
              schema: eventEnvelopeSchema,
            });
            if (finished) return;
            if (!parsed.success) throw parsed.error;
            const raw = parsed.value;
            if (options.includeRawChunks) {
              controller.enqueue({ type: 'raw', rawValue: raw });
            }
            // Unknown events (including turn events) remain available as raw
            // chunks without making the adapter depend on their schema.
            if (!handledEvents.has(raw.type)) return;
            const validated = await safeValidateTypes({
              value: raw,
              schema: transcriptionEventSchema,
            });
            if (finished) return;
            if (!validated.success) throw validated.error;
            const event = validated.value;
            switch (event.type) {
              case 'session.created':
                if (configured) break;
                configured = true;
                connection!.socket!.send(
                  JSON.stringify({ type: 'session.update', session }),
                );
                break;
              case 'session.updated':
                if (!configured || sending) break;
                sending = true;
                void sendAudio().catch(fail);
                break;
              case 'transcription.text.delta':
                controller.enqueue({
                  type: 'transcript-delta',
                  delta: event.text,
                });
                break;
              case 'transcription.segment':
                controller.enqueue({
                  type: 'transcript-final',
                  text: event.text,
                  startSecond: event.start ?? undefined,
                  endSecond: event.end ?? undefined,
                  ...(event.speaker_id != null && {
                    providerMetadata: {
                      mistral: { speakerId: event.speaker_id },
                    },
                  }),
                });
                break;
              case 'transcription.done': {
                const segments = event.segments ?? [];
                controller.enqueue({
                  type: 'response-metadata',
                  modelId: event.model ?? modelId,
                  body: raw,
                });
                controller.enqueue({
                  type: 'finish',
                  text: event.text,
                  segments: segments.flatMap(segment =>
                    segment.start == null || segment.end == null
                      ? []
                      : [
                          {
                            text: segment.text,
                            startSecond: segment.start,
                            endSecond: segment.end,
                          },
                        ],
                  ),
                  language: event.language ?? undefined,
                  durationInSeconds:
                    typeof event.usage?.prompt_audio_seconds === 'number'
                      ? event.usage.prompt_audio_seconds
                      : undefined,
                  usage: event.usage ?? undefined,
                  providerMetadata: {
                    mistral: {
                      ...(event.usage != null && { usage: event.usage }),
                      segments: segments.map(segment => ({
                        text: segment.text,
                        ...(segment.start != null && {
                          startSecond: segment.start,
                        }),
                        ...(segment.end != null && { endSecond: segment.end }),
                        ...(segment.speaker_id != null && {
                          speakerId: segment.speaker_id,
                        }),
                      })),
                    },
                  },
                });
                finished = true;
                controller.close();
                cleanup();
                break;
              }
              case 'error':
                fail(new Error(event.error.message));
                break;
            }
          },
          onSocketError: () =>
            fail(
              new Error(
                'Mistral realtime transcription WebSocket error.' +
                  (webSocket == null
                    ? ' Pass a header-capable WebSocket implementation (e.g. ws) to createMistral({ webSocket }) to send the Authorization header.'
                    : ''),
              ),
            ),
          onClose: ({ code, reason }) =>
            fail(
              new Error(
                `Mistral realtime transcription connection closed before transcription.done (code: ${code ?? 'unknown'}${reason ? `, reason: ${reason}` : ''}).`,
              ),
            ),
        });
        // A constructor failure or an already-aborted signal can finish
        // synchronously, before the connection has been assigned.
        if (finished) connection.close();
      },
      cancel() {
        if (finished) return;
        finished = true;
        cleanup();
      },
    }),
  };
}

const handledEvents = new Set([
  'session.created',
  'session.updated',
  'transcription.text.delta',
  'transcription.segment',
  'transcription.done',
  'error',
]);
const eventEnvelopeSchema = lazySchema(() =>
  zodSchema(z.looseObject({ type: z.string() })),
);
const transcriptionEventSchema = lazySchema(() => {
  const segment = {
    text: z.string(),
    start: z.number().nullish(),
    end: z.number().nullish(),
    speaker_id: z.string().nullish(),
  };
  return zodSchema(
    z.discriminatedUnion('type', [
      z.object({ type: z.literal('session.created') }),
      z.object({ type: z.literal('session.updated') }),
      z.object({
        type: z.literal('transcription.text.delta'),
        text: z.string(),
      }),
      z.object({ type: z.literal('transcription.segment'), ...segment }),
      z.object({
        type: z.literal('transcription.done'),
        text: z.string(),
        model: z.string().nullish(),
        language: z.string().nullish(),
        segments: z.array(z.object(segment)).nullish(),
        usage: z.record(z.string(), z.json()).nullish(),
      }),
      z.object({
        type: z.literal('error'),
        error: z.object({ message: z.string() }),
      }),
    ]),
  );
});
