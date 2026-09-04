import {
  InvalidArgumentError,
  type Experimental_TranscriptionModelV4StreamOptions as TranscriptionModelV4StreamOptions,
  type Experimental_TranscriptionModelV4StreamPart as TranscriptionModelV4StreamPart,
  type JSONObject,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  connectToWebSocket,
  convertBase64ToUint8Array,
  safeParseJSON,
  toWebSocketUrl,
  waitForWebSocketBufferDrain,
  type WebSocketConnection,
  type WebSocketConstructor,
  type WebSocketLike,
} from '@ai-sdk/provider-utils';
import type { AssemblyAITranscriptionModelOptions } from './assemblyai-transcription-model-options';

/**
 * Audio encodings accepted by the AssemblyAI Streaming v3 API.
 *
 * @see https://www.assemblyai.com/docs/api-reference/streaming-api/streaming-api
 */
type AssemblyAIStreamingEncoding =
  | 'pcm_s16le'
  | 'pcm_mulaw'
  | 'opus'
  | 'ogg_opus'
  | 'aac';

const encodingByAudioFormat: Record<string, AssemblyAIStreamingEncoding> = {
  'audio/pcm': 'pcm_s16le',
  'audio/pcmu': 'pcm_mulaw',
  'audio/opus': 'opus',
  'audio/ogg': 'ogg_opus',
  'audio/aac': 'aac',
};

// Raw PCM needs an explicit sample rate; the compressed encodings are
// self-describing and the API ignores `sample_rate` for them.
const pcmEncodings: ReadonlySet<AssemblyAIStreamingEncoding> = new Set([
  'pcm_s16le',
  'pcm_mulaw',
]);

const DEFAULT_SAMPLE_RATE = 16000;

export function getAssemblyAIStreamingEncoding(
  type: string,
): AssemblyAIStreamingEncoding {
  const encoding = encodingByAudioFormat[type.toLowerCase()];
  if (encoding == null) {
    throw new InvalidArgumentError({
      argument: 'inputAudioFormat',
      message:
        `Unsupported audio format "${type}" for AssemblyAI streaming transcription. ` +
        'Use audio/pcm (16-bit signed little-endian PCM), audio/pcmu (mu-law), ' +
        'audio/opus (raw Opus packets), audio/ogg (Ogg Opus), or audio/aac (ADTS AAC).',
    });
  }
  return encoding;
}

/**
 * Builds the Streaming v3 WebSocket URL. All session configuration is passed
 * as query parameters; authentication is sent via the `Authorization` header.
 */
export function buildAssemblyAIStreamingUrl({
  baseUrl,
  modelId,
  inputAudioFormat,
  options,
}: {
  baseUrl: string;
  modelId: string;
  inputAudioFormat: TranscriptionModelV4StreamOptions['inputAudioFormat'];
  options: AssemblyAITranscriptionModelOptions | undefined;
}): URL {
  const url = toWebSocketUrl(baseUrl);
  const encoding = getAssemblyAIStreamingEncoding(inputAudioFormat.type);
  const streaming = options?.streaming;

  url.searchParams.set('speech_model', modelId);
  url.searchParams.set('encoding', encoding);
  if (pcmEncodings.has(encoding)) {
    url.searchParams.set(
      'sample_rate',
      String(inputAudioFormat.rate ?? DEFAULT_SAMPLE_RATE),
    );
  }

  const parameters: Record<
    string,
    string | number | boolean | null | undefined
  > = {
    // options shared with pre-recorded transcription:
    prompt: options?.prompt,
    keyterms_prompt:
      options?.keytermsPrompt != null
        ? JSON.stringify(options.keytermsPrompt)
        : undefined,
    language_detection: options?.languageDetection,
    speaker_labels: options?.speakerLabels,
    filter_profanity: options?.filterProfanity,
    redact_pii: options?.redactPii,
    redact_pii_policies: options?.redactPiiPolicies?.join(','),
    redact_pii_sub: options?.redactPiiSub,
    domain: options?.domain,

    // streaming-only options:
    mode: streaming?.mode,
    format_turns: streaming?.formatTurns,
    language_codes:
      streaming?.languageCodes != null
        ? JSON.stringify(streaming.languageCodes)
        : undefined,
    max_speakers: streaming?.maxSpeakers,
    min_turn_silence: streaming?.minTurnSilence,
    max_turn_silence: streaming?.maxTurnSilence,
    end_of_turn_confidence_threshold: streaming?.endOfTurnConfidenceThreshold,
    vad_threshold: streaming?.vadThreshold,
    interruption_delay: streaming?.interruptionDelay,
    continuous_partials: streaming?.continuousPartials,
    agent_context: streaming?.agentContext,
    previous_context_n_turns: streaming?.previousContextNTurns,
    voice_focus: streaming?.voiceFocus,
    voice_focus_threshold: streaming?.voiceFocusThreshold,
    include_partial_turns: streaming?.includePartialTurns,
    inactivity_timeout: streaming?.inactivityTimeout,
  };

  for (const [key, value] of Object.entries(parameters)) {
    if (value != null) {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

type AssemblyAIStreamingWord = {
  text?: string;
  start?: number;
  end?: number;
  confidence?: number;
  word_is_final?: boolean;
  speaker?: string | null;
};

/**
 * Union of the server message payloads we read. Only the fields used by the
 * mapping are typed; everything else stays on the raw value.
 */
type AssemblyAIStreamingMessage = {
  type?: string;
  // Begin
  id?: string;
  configuration?: { model?: string | null } | null;
  // Turn
  turn_order?: number;
  turn_is_formatted?: boolean;
  end_of_turn?: boolean;
  transcript?: string;
  end_of_turn_confidence?: number;
  language_code?: string | null;
  language_confidence?: number | null;
  speaker_label?: string | null;
  words?: AssemblyAIStreamingWord[];
  // SpeakerRevision
  revisions?: JSONObject[];
  // Termination
  audio_duration_seconds?: number;
  session_duration_seconds?: number;
  // Error
  error?: string;
  message?: string;
};

type FinalTurn = {
  text: string;
  startSecond?: number;
  endSecond?: number;
};

export function createAssemblyAIStreamingTranscriptionStream({
  webSocket,
  url,
  headers,
  warnings,
  modelId,
  audio,
  abortSignal,
  includeRawChunks,
  formatTurns,
  initialLanguage,
  currentDate,
}: {
  webSocket: WebSocketConstructor | undefined;
  url: URL;
  headers: Record<string, string | undefined>;
  warnings: SharedV4Warning[];
  modelId: string;
  audio: ReadableStream<Uint8Array | string>;
  abortSignal: AbortSignal | undefined;
  includeRawChunks: boolean | undefined;
  /**
   * Whether `format_turns` was requested. Universal Streaming models then
   * emit an unformatted end-of-turn message followed by the formatted one;
   * only the formatted message is surfaced as `transcript-final`.
   */
  formatTurns: boolean;
  initialLanguage: string | undefined;
  currentDate: Date;
}): ReadableStream<TranscriptionModelV4StreamPart> {
  let finished = false;
  let cleanup: (closeCode?: number) => void = () => {};

  const headerHint =
    webSocket == null
      ? ' Note: the native WebSocket implementation in browsers, Node.js,' +
        ' Deno, and Bun cannot send the Authorization header required by' +
        ' AssemblyAI. Pass a header-capable WebSocket implementation (e.g.' +
        " the 'ws' package) via createAssemblyAI({ webSocket })."
      : '';

  return new ReadableStream<TranscriptionModelV4StreamPart>({
    start(controller) {
      let audioReader:
        | ReadableStreamDefaultReader<Uint8Array | string>
        | undefined;
      let connection: WebSocketConnection | undefined;
      let sessionId: string | undefined;
      let terminateSent = false;
      let detectedLanguage = initialLanguage;
      let audioDurationSeconds: number | undefined;
      let sessionDurationSeconds: number | undefined;
      let speakerRevisions: JSONObject[] | undefined;
      // finalized turns keyed by turn_order, so a re-sent turn overwrites
      // rather than duplicates:
      const finalTurns = new Map<number, FinalTurn>();

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

        const turns = [...finalTurns.entries()]
          .sort(([a], [b]) => a - b)
          .map(([, turn]) => turn);
        const segments = turns.flatMap(turn =>
          turn.startSecond != null && turn.endSecond != null
            ? [
                {
                  text: turn.text,
                  startSecond: turn.startSecond,
                  endSecond: turn.endSecond,
                },
              ]
            : [],
        );

        const metadata: JSONObject = {};
        if (sessionId != null) metadata.sessionId = sessionId;
        if (sessionDurationSeconds != null) {
          metadata.sessionDurationSeconds = sessionDurationSeconds;
        }
        if (speakerRevisions != null) {
          metadata.speakerRevisions = speakerRevisions;
        }

        controller.enqueue({
          type: 'finish',
          text: turns.map(turn => turn.text).join(' '),
          segments,
          language: detectedLanguage,
          durationInSeconds: audioDurationSeconds ?? segments.at(-1)?.endSecond,
          ...(Object.keys(metadata).length > 0
            ? { providerMetadata: { assemblyai: metadata } }
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
            // backpressure: pause reads while the socket buffer is full
            await waitForWebSocketBufferDrain(socket);
          }
        } finally {
          audioReader.releaseLock();
          // unlocked again: cleanup must cancel `audio`, not the reader
          audioReader = undefined;
        }
        if (!finished) {
          // graceful shutdown: the server flushes remaining turns and replies
          // with `Termination` before closing the socket.
          terminateSent = true;
          socket.send(JSON.stringify({ type: 'Terminate' }));
        }
      };

      connection = connectToWebSocket({
        url,
        headers,
        webSocket,
        abortSignal,
        onAbort: finishWithError,
        onProcessingError: finishWithError,
        onMessageText: async text => {
          const parsed = await safeParseJSON({ text });
          if (!parsed.success) return;
          const raw = parsed.value as AssemblyAIStreamingMessage;

          if (includeRawChunks) {
            controller.enqueue({ type: 'raw', rawValue: raw });
          }

          switch (raw.type) {
            case 'Begin': {
              sessionId = raw.id;

              // Unrecognized query parameters are ignored by the server rather
              // than rejected, so verify the applied model matches.
              const appliedModel = raw.configuration?.model ?? undefined;
              if (appliedModel != null && appliedModel !== modelId) {
                warnings.push({
                  type: 'other',
                  message: `AssemblyAI applied speech model '${appliedModel}' instead of the requested '${modelId}'.`,
                });
              }

              controller.enqueue({ type: 'stream-start', warnings });
              controller.enqueue({
                type: 'response-metadata',
                timestamp: currentDate,
                modelId: appliedModel ?? modelId,
              });

              const socket = connection?.socket;
              if (socket == null) {
                finishWithError(new Error('WebSocket is not connected.'));
                break;
              }
              void sendAudio(socket).catch(finishWithError);
              break;
            }

            case 'Turn': {
              const turnOrder = raw.turn_order ?? 0;
              const id = `turn-${turnOrder}`;
              const text = raw.transcript ?? '';
              if (text.length === 0) break; // silence-only turn

              const words = raw.words ?? [];
              const timing = timingFromWords(words);
              const isFinal =
                raw.end_of_turn === true &&
                (raw.turn_is_formatted === true || !formatTurns);

              if (isFinal) {
                if (raw.language_code) {
                  detectedLanguage = raw.language_code;
                }
                finalTurns.set(turnOrder, { text, ...timing });
                controller.enqueue({
                  type: 'transcript-final',
                  id,
                  text,
                  ...timing,
                  providerMetadata: {
                    assemblyai: turnMetadata(raw, words),
                  },
                });
              } else {
                controller.enqueue({
                  type: 'transcript-partial',
                  id,
                  text,
                  ...(timing.startSecond != null
                    ? { startSecond: timing.startSecond }
                    : {}),
                  ...(timing.startSecond != null && timing.endSecond != null
                    ? {
                        durationInSeconds: roundMs(
                          timing.endSecond - timing.startSecond,
                        ),
                      }
                    : {}),
                });
              }
              break;
            }

            case 'SpeakerRevision': {
              // Final speaker-label refinement emitted right before
              // `Termination` when `speakerLabels` is enabled. Text and word
              // timestamps never change, only speaker assignments.
              speakerRevisions = raw.revisions ?? [];
              break;
            }

            case 'Termination': {
              audioDurationSeconds = raw.audio_duration_seconds;
              sessionDurationSeconds = raw.session_duration_seconds;
              finish();
              break;
            }

            case 'Error': {
              finishWithError(
                new Error(
                  raw.error ??
                    raw.message ??
                    'AssemblyAI streaming transcription error',
                ),
              );
              break;
            }

            // SpeechStarted, Heartbeat, LLMGatewayResponse and unknown
            // message types have no normalized equivalent and are only
            // surfaced as `raw` parts.
          }
        },
        onSocketError: () => {
          finishWithError(
            new Error('AssemblyAI streaming transcription error.' + headerHint),
          );
        },
        onClose: ({ code, reason }) => {
          if (finished) return;
          // A normal close after `Terminate` without a `Termination` message
          // still has all finalized turns; finish rather than fail.
          if (
            terminateSent &&
            (code == null || code === 1000 || code === 1005)
          ) {
            finish();
            return;
          }
          finishWithError(
            new Error(
              describeSessionClose({ code, reason }) +
                (code === 1008 ? headerHint : ''),
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
 * AssemblyAI reports word timings in milliseconds; the AI SDK reports
 * seconds. Compute the span in milliseconds first so the division happens
 * once and does not accumulate floating point error.
 */
function timingFromWords(words: AssemblyAIStreamingWord[]): {
  startSecond?: number;
  endSecond?: number;
} {
  const startMs = words.find(word => typeof word.start === 'number')?.start;
  const endMs = [...words]
    .reverse()
    .find(word => typeof word.end === 'number')?.end;
  if (startMs == null || endMs == null) return {};
  return { startSecond: startMs / 1000, endSecond: endMs / 1000 };
}

function roundMs(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}

/**
 * Turn-level details that the AI SDK's transcript parts cannot represent.
 * Word timings inside `words` stay in milliseconds, matching the AssemblyAI
 * API (unlike the part-level `startSecond` / `endSecond`).
 */
function turnMetadata(
  raw: AssemblyAIStreamingMessage,
  words: AssemblyAIStreamingWord[],
): JSONObject {
  const metadata: JSONObject = { turnOrder: raw.turn_order ?? 0 };
  if (raw.end_of_turn_confidence != null) {
    metadata.endOfTurnConfidence = raw.end_of_turn_confidence;
  }
  if (raw.speaker_label != null) metadata.speakerLabel = raw.speaker_label;
  if (raw.language_code != null) metadata.languageCode = raw.language_code;
  if (raw.language_confidence != null) {
    metadata.languageConfidence = raw.language_confidence;
  }
  metadata.words = words.map(word => {
    const entry: JSONObject = {};
    if (word.text != null) entry.text = word.text;
    if (word.start != null) entry.start = word.start;
    if (word.end != null) entry.end = word.end;
    if (word.confidence != null) entry.confidence = word.confidence;
    if (word.speaker != null) entry.speaker = word.speaker;
    return entry;
  });
  return metadata;
}

/**
 * @see https://www.assemblyai.com/docs/streaming/common-session-errors-and-closures
 */
function describeSessionClose({
  code,
  reason,
}: {
  code?: number;
  reason?: string;
}): string {
  const detail = (() => {
    switch (code) {
      case 1008:
        return 'missing or invalid authorization, or an account issue such as insufficient balance';
      case 1009:
        return 'a single WebSocket message exceeded the 128 KB limit; send smaller audio chunks';
      case 1011:
        return 'internal server error while establishing the connection';
      case 3005:
        return 'the session was cancelled by the server';
      case 3006:
        return 'invalid message, or the session was terminated due to inactivity';
      case 3007:
        return 'audio pacing violation: chunks must contain 50ms to 1000ms of audio and must not be sent faster than real time';
      case 3008:
        return 'the session expired (3 hour maximum, or the token expired)';
      case 3009:
        return 'too many concurrent sessions';
      default:
        return undefined;
    }
  })();

  const codeText =
    code != null ? ` (code ${code}${reason ? `: ${reason}` : ''})` : '';
  return (
    'AssemblyAI streaming transcription session closed before completion' +
    codeText +
    (detail != null ? `: ${detail}.` : '.')
  );
}
