import {
  InvalidArgumentError,
  type Experimental_TranscriptionModelV4StreamOptions as TranscriptionModelV4StreamOptions,
  type Experimental_TranscriptionModelV4StreamPart as TranscriptionModelV4StreamPart,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  connectToWebSocket,
  convertBase64ToUint8Array,
  safeParseJSON,
  waitForWebSocketBufferDrain,
  type WebSocketConnection,
  type WebSocketConstructor,
  type WebSocketLike,
} from '@ai-sdk/provider-utils';
import type { AssemblyAITranscriptionModelOptions } from './assemblyai-transcription-model-options';

type AssemblyAIStreamingOptions = NonNullable<
  AssemblyAITranscriptionModelOptions['streaming']
>;

type AssemblyAIStreamingWord = {
  text?: string;
  start?: number;
  end?: number;
  confidence?: number;
  word_is_final?: boolean;
  speaker?: string;
};

type AssemblyAIStreamingEvent = {
  type?: string;
  id?: string;
  turn_order?: number;
  end_of_turn?: boolean;
  transcript?: string;
  language_code?: string;
  speaker_label?: string;
  words?: AssemblyAIStreamingWord[];
  audio_duration_seconds?: number;
  session_duration_seconds?: number;
  error_code?: number;
  error?: string;
};

export type AssemblyAIStreamingAudioFormat = {
  encoding: 'pcm_mulaw' | 'pcm_s16le';
  sampleRate: number;
  bytesPerSample: number;
  silenceByte: number;
};

/**
 * AssemblyAI accepts any integer sample rate from 8000 to 96000 Hz.
 * @see https://www.assemblyai.com/docs/streaming/api-spec/streaming-websocket
 */
const MIN_SAMPLE_RATE = 8000;
const MAX_SAMPLE_RATE = 96_000;

/**
 * AssemblyAI rejects binary audio messages shorter than 20 ms or longer than
 * 1000 ms, and recommends 50-100 ms per message for turn latency.
 */
const MIN_CHUNK_SECONDS = 0.02;
const MAX_CHUNK_SECONDS = 0.1;

const WEBSOCKET_OPEN = 1;

export function getAssemblyAIStreamingAudioFormat(
  inputAudioFormat: TranscriptionModelV4StreamOptions['inputAudioFormat'],
): AssemblyAIStreamingAudioFormat {
  const type = inputAudioFormat.type.toLowerCase();
  const isMulaw = type === 'audio/pcmu';
  const sampleRate = inputAudioFormat.rate ?? (isMulaw ? 8000 : 16_000);

  if (
    (type !== 'audio/pcm' && !isMulaw) ||
    !Number.isInteger(sampleRate) ||
    sampleRate < MIN_SAMPLE_RATE ||
    sampleRate > MAX_SAMPLE_RATE
  ) {
    throw new InvalidArgumentError({
      argument: 'inputAudioFormat',
      message:
        'AssemblyAI streaming transcription supports audio/pcm (16-bit little-endian) and audio/pcmu at integer sample rates from 8000 to 96000 Hz',
    });
  }

  return isMulaw
    ? {
        encoding: 'pcm_mulaw',
        sampleRate,
        bytesPerSample: 1,
        silenceByte: 0xff,
      }
    : { encoding: 'pcm_s16le', sampleRate, bytesPerSample: 2, silenceByte: 0 };
}

export function buildAssemblyAIStreamingUrl({
  baseUrl,
  modelId,
  audioFormat,
  streamingOptions,
}: {
  baseUrl: string;
  modelId: string;
  audioFormat: AssemblyAIStreamingAudioFormat;
  streamingOptions: AssemblyAIStreamingOptions | undefined;
}): URL {
  const url = new URL(baseUrl);
  url.searchParams.set('speech_model', modelId);
  url.searchParams.set('encoding', audioFormat.encoding);
  url.searchParams.set('sample_rate', String(audioFormat.sampleRate));

  // List parameters are JSON-encoded strings on the query.
  const parameters = {
    agent_context: streamingOptions?.agentContext,
    domain: streamingOptions?.domain,
    filter_profanity: streamingOptions?.filterProfanity,
    inactivity_timeout: streamingOptions?.inactivityTimeout,
    include_partial_turns: streamingOptions?.includePartialTurns,
    interruption_delay: streamingOptions?.interruptionDelay,
    keyterms_prompt: toJsonParameter(streamingOptions?.keytermsPrompt),
    language_codes: toJsonParameter(streamingOptions?.languageCodes),
    language_detection: streamingOptions?.languageDetection,
    max_speakers: streamingOptions?.maxSpeakers,
    max_turn_silence: streamingOptions?.maxTurnSilence,
    min_turn_silence: streamingOptions?.minTurnSilence,
    mode: streamingOptions?.mode,
    previous_context_n_turns: streamingOptions?.previousContextNTurns,
    prompt: streamingOptions?.prompt,
    redact_pii: streamingOptions?.redactPii,
    redact_pii_policies: toJsonParameter(streamingOptions?.redactPiiPolicies),
    redact_pii_sub: streamingOptions?.redactPiiSub,
    speaker_labels: streamingOptions?.speakerLabels,
    vad_threshold: streamingOptions?.vadThreshold,
    voice_focus: streamingOptions?.voiceFocus,
    voice_focus_threshold: streamingOptions?.voiceFocusThreshold,
  };
  for (const [key, value] of Object.entries(parameters)) {
    if (value != null) {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

function toJsonParameter(value: string[] | null | undefined) {
  return value == null ? undefined : JSON.stringify(value);
}

export function createAssemblyAIStreamingTranscriptionStream({
  abortSignal,
  audio,
  audioFormat,
  headers,
  includeRawChunks,
  url,
  warnings,
  webSocket,
}: {
  abortSignal: AbortSignal | undefined;
  audio: ReadableStream<Uint8Array | string>;
  audioFormat: AssemblyAIStreamingAudioFormat;
  headers: Record<string, string | undefined>;
  includeRawChunks: boolean | undefined;
  url: URL;
  warnings: SharedV4Warning[];
  webSocket: WebSocketConstructor | undefined;
}) {
  let finished = false;
  let cleanup: () => void = () => {};

  const { bytesPerSample, sampleRate, silenceByte } = audioFormat;
  const minChunkBytes =
    Math.ceil(sampleRate * MIN_CHUNK_SECONDS) * bytesPerSample;
  const maxChunkBytes =
    Math.floor(sampleRate * MAX_CHUNK_SECONDS) * bytesPerSample;

  return new ReadableStream<TranscriptionModelV4StreamPart>({
    start: controller => {
      let audioReader:
        | ReadableStreamDefaultReader<Uint8Array | string>
        | undefined;
      let connection: WebSocketConnection | undefined;
      let audioStarted = false;
      let audioBytesSent = 0;
      let language: string | undefined;
      let sessionEnded = false;
      let sessionId: string | undefined;
      const finalizedTurns = new Set<number>();
      const finalTexts: string[] = [];
      const segments: Array<{
        text: string;
        startSecond: number;
        endSecond: number;
      }> = [];

      // AssemblyAI keeps a session that was not explicitly terminated open,
      // so a session the server has not ended gets a best-effort `Terminate`
      // before the socket closes (cancel, abort, or a local error).
      const terminateSession = () => {
        const socket = connection?.socket;
        if (
          sessionEnded ||
          !audioStarted ||
          socket?.readyState !== WEBSOCKET_OPEN
        ) {
          return;
        }
        sessionEnded = true;
        try {
          socket.send(JSON.stringify({ type: 'Terminate' }));
        } catch {
          // the socket is closing
        }
      };

      cleanup = () => {
        if (audioReader != null) {
          void audioReader.cancel().catch(() => {});
        } else {
          void audio.cancel().catch(() => {});
        }
        terminateSession();
        connection?.close();
      };

      const finishWithError = (error: unknown) => {
        if (finished) return;
        finished = true;
        cleanup();
        controller.error(error);
      };

      const finish = (usage: {
        audio_duration_seconds?: number;
        session_duration_seconds?: number;
      }) => {
        if (finished) return;
        finished = true;
        controller.enqueue({
          type: 'finish',
          text: finalTexts.join(' '),
          segments,
          language,
          // Exact duration of the audio sent, excluding silence padding;
          // AssemblyAI reports whole seconds in `usage`.
          durationInSeconds: audioBytesSent / (sampleRate * bytesPerSample),
          ...(Object.keys(usage).length > 0 && { usage }),
        });
        controller.close();
        cleanup();
      };

      // Each binary message must carry 20-100 ms of audio, so client chunks
      // are regrouped on sample boundaries. A final remainder shorter than
      // 20 ms is padded with silence.
      const sendAudio = async (socket: WebSocketLike) => {
        audioReader = audio.getReader();
        let pending = new Uint8Array(0);
        const send = async (bytes: Uint8Array, audioBytes = bytes.length) => {
          socket.send(bytes);
          audioBytesSent += audioBytes;
          await waitForWebSocketBufferDrain(socket);
        };
        try {
          while (true) {
            const { done, value } = await audioReader.read();
            if (done || finished) break;
            const bytes =
              typeof value === 'string'
                ? convertBase64ToUint8Array(value)
                : value;
            if (bytes.length === 0) continue;
            const combined = new Uint8Array(pending.length + bytes.length);
            combined.set(pending);
            combined.set(bytes, pending.length);
            pending = combined;
            while (pending.length >= minChunkBytes) {
              if (finished) return;
              const size = Math.min(pending.length, maxChunkBytes);
              const alignedSize = size - (size % bytesPerSample);
              await send(pending.subarray(0, alignedSize));
              pending = pending.subarray(alignedSize);
            }
          }
        } finally {
          audioReader.releaseLock();
          audioReader = undefined;
        }
        if (finished) return;
        if (pending.length > 0) {
          const padded = new Uint8Array(minChunkBytes).fill(silenceByte);
          padded.set(pending.subarray(0, minChunkBytes));
          await send(padded, pending.length);
        }
        if (finished) return;
        sessionEnded = true;
        socket.send(JSON.stringify({ type: 'Terminate' }));
      };

      connection = connectToWebSocket({
        abortSignal,
        headers,
        onAbort: finishWithError,
        onClose: ({ code, reason }) => {
          finishWithError(
            new Error(
              `AssemblyAI streaming transcription closed before the session terminated${code != null ? ` (code ${code}${reason ? `: ${reason}` : ''})` : ''}`,
            ),
          );
        },
        onMessageText: async text => {
          const parsed = await safeParseJSON({ text });
          if (!parsed.success) return;
          const event = parsed.value as AssemblyAIStreamingEvent;

          if (includeRawChunks) {
            controller.enqueue({ type: 'raw', rawValue: event });
          }

          switch (event.type) {
            case 'Begin': {
              if (audioStarted) break;
              audioStarted = true;
              sessionId = event.id;
              controller.enqueue({ type: 'stream-start', warnings });
              const socket = connection?.socket;
              if (socket == null) {
                finishWithError(new Error('WebSocket is not connected.'));
                break;
              }
              void sendAudio(socket).catch(finishWithError);
              break;
            }

            case 'Turn': {
              const turnOrder = event.turn_order ?? 0;
              const id = `${sessionId ?? 'session'}:${turnOrder}`;
              const transcript = (event.transcript ?? '').trim();

              if (event.end_of_turn !== true) {
                controller.enqueue({
                  type: 'transcript-partial',
                  id,
                  text: transcript,
                });
                break;
              }

              if (finalizedTurns.has(turnOrder)) break;
              finalizedTurns.add(turnOrder);
              language = event.language_code ?? language;
              if (transcript.length === 0) break;

              // Word timings are in milliseconds.
              const words = (event.words ?? []).filter(
                (
                  word,
                ): word is AssemblyAIStreamingWord & {
                  start: number;
                  end: number;
                } =>
                  typeof word.start === 'number' &&
                  typeof word.end === 'number',
              );
              finalTexts.push(transcript);
              segments.push(
                ...words.map(word => ({
                  text: word.text ?? '',
                  startSecond: word.start / 1000,
                  endSecond: word.end / 1000,
                })),
              );
              controller.enqueue({
                type: 'transcript-final',
                id,
                text: transcript,
                ...(words.length > 0 && {
                  startSecond: words[0].start / 1000,
                  endSecond: words[words.length - 1].end / 1000,
                }),
                ...(event.speaker_label != null && {
                  providerMetadata: {
                    assemblyai: { speakerLabel: event.speaker_label },
                  },
                }),
              });
              break;
            }

            case 'Termination': {
              sessionEnded = true;
              // AssemblyAI reports the session duration (time the WebSocket
              // was open) separately from the audio duration.
              finish({
                ...(event.audio_duration_seconds != null && {
                  audio_duration_seconds: event.audio_duration_seconds,
                }),
                ...(event.session_duration_seconds != null && {
                  session_duration_seconds: event.session_duration_seconds,
                }),
              });
              break;
            }

            case 'Error': {
              sessionEnded = true;
              // `inactivityTimeout` elapsing ends the session with this error
              // instead of `Termination`; the finalized turns are kept. A turn
              // still in progress has no final transcript and is dropped.
              if (
                event.error_code === 3006 &&
                /inactivity/i.test(event.error ?? '')
              ) {
                finish({});
                break;
              }
              finishWithError(
                new Error(
                  `AssemblyAI streaming transcription error${event.error_code != null ? ` (code ${event.error_code})` : ''}: ${event.error ?? 'unknown error'}`,
                ),
              );
              break;
            }
          }
        },
        onProcessingError: finishWithError,
        onSocketError: () => {
          finishWithError(
            new Error(
              'AssemblyAI streaming transcription WebSocket error.' +
                (webSocket == null
                  ? ' Note: the native WebSocket implementation in browsers,' +
                    ' Node.js, Deno, and Bun cannot send the Authorization' +
                    ' header required by AssemblyAI. Pass a header-capable' +
                    " WebSocket implementation (e.g. the 'ws' package) via" +
                    ' createAssemblyAI({ webSocket }).'
                  : ''),
            ),
          );
        },
        url,
        webSocket,
      });
    },

    cancel: () => {
      if (finished) return;
      finished = true;
      cleanup();
    },
  });
}
