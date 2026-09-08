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
import {
  isAssemblyAIUniversalProModelId,
  isAssemblyAIUniversalStreamingModelId,
} from './assemblyai-transcription-settings';

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

/**
 * The streaming API accepts at most this many `keyterms_prompt` entries.
 */
const MAX_STREAMING_KEYTERMS = 100;

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
 * List-valued parameters are JSON-encoded, which is how the server parses
 * them.
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
    keyterms_prompt: jsonArray(options?.keytermsPrompt),
    language_detection: options?.languageDetection,
    speaker_labels: options?.speakerLabels,
    filter_profanity: options?.filterProfanity,
    redact_pii: options?.redactPii,
    redact_pii_policies: jsonArray(options?.redactPiiPolicies),
    redact_pii_sub: options?.redactPiiSub,
    domain: options?.domain,

    // streaming-only options:
    mode: streaming?.mode,
    format_turns: streaming?.formatTurns,
    language_codes: jsonArray(streaming?.languageCodes),
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

function jsonArray(value: string[] | null | undefined): string | undefined {
  return value != null ? JSON.stringify(value) : undefined;
}

/**
 * Warnings for option combinations that the streaming server rejects at
 * connect time (closing the socket before `Begin`) or silently ignores.
 * Emitting them up front gives callers an actionable message instead of a
 * bare close code.
 */
export function getAssemblyAIStreamingWarnings({
  modelId,
  options,
}: {
  modelId: string;
  options: AssemblyAITranscriptionModelOptions | undefined;
}): SharedV4Warning[] {
  const warnings: SharedV4Warning[] = [];
  const streaming = options?.streaming;

  if (
    (options?.redactPiiPolicies != null || options?.redactPiiSub != null) &&
    !options?.redactPii
  ) {
    warnings.push({
      type: 'other',
      message:
        "'redactPiiPolicies' and 'redactPiiSub' require 'redactPii' to be enabled; AssemblyAI rejects the streaming connection otherwise.",
    });
  }

  if (streaming?.voiceFocusThreshold != null && streaming.voiceFocus == null) {
    warnings.push({
      type: 'other',
      message:
        "'streaming.voiceFocusThreshold' only applies when 'streaming.voiceFocus' is set; it is otherwise ignored.",
    });
  }

  if (
    options?.keytermsPrompt != null &&
    options.keytermsPrompt.length > MAX_STREAMING_KEYTERMS
  ) {
    warnings.push({
      type: 'other',
      message: `AssemblyAI streaming transcription accepts at most ${MAX_STREAMING_KEYTERMS} 'keytermsPrompt' terms (${options.keytermsPrompt.length} given); the connection is rejected otherwise.`,
    });
  }

  if (isAssemblyAIUniversalStreamingModelId(modelId)) {
    const proOnlyOptions = (
      [
        ['prompt', options?.prompt],
        ['streaming.mode', streaming?.mode],
        ['streaming.languageCodes', streaming?.languageCodes],
        ['streaming.interruptionDelay', streaming?.interruptionDelay],
        ['streaming.continuousPartials', streaming?.continuousPartials],
        ['streaming.agentContext', streaming?.agentContext],
        ['streaming.previousContextNTurns', streaming?.previousContextNTurns],
        ['streaming.voiceFocus', streaming?.voiceFocus],
      ] as const
    )
      .filter(([, value]) => value != null)
      .map(([name]) => `'${name}'`);

    if (proOnlyOptions.length > 0) {
      warnings.push({
        type: 'other',
        message: `${proOnlyOptions.join(', ')} require a Universal-3.x Pro model such as 'universal-3-5-pro'; AssemblyAI rejects the streaming connection for '${modelId}'.`,
      });
    }
  } else if (
    isAssemblyAIUniversalProModelId(modelId) &&
    streaming?.endOfTurnConfidenceThreshold != null
  ) {
    warnings.push({
      type: 'other',
      message: `'streaming.endOfTurnConfidenceThreshold' has no effect on '${modelId}', which uses punctuation-based turn detection. Tune 'streaming.minTurnSilence' and 'streaming.maxTurnSilence' instead.`,
    });
  }

  return warnings;
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
  // Error (also set on a Turn whose transcript was cleared, e.g. when PII
  // redaction failed)
  error?: string;
  error_code?: number;
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
  includePartialTurns,
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
  /**
   * Whether the caller wants `transcript-partial` parts. When false, the
   * unformatted end-of-turn message described above is dropped instead of
   * being surfaced as a partial.
   */
  includePartialTurns: boolean;
  initialLanguage: string | undefined;
  currentDate: Date;
}): ReadableStream<TranscriptionModelV4StreamPart> {
  let finished = false;
  let cleanup: (closeCode?: number) => void = () => {};

  const headerHint =
    webSocket == null
      ? ' Note: the AI SDK passes WebSocket headers through a constructor' +
        ' option that the native WebSocket in browsers, Node.js, Deno, and' +
        ' Bun does not accept, so the Authorization header AssemblyAI' +
        ' requires was not sent. Pass a header-capable WebSocket' +
        " implementation (e.g. the 'ws' package) via" +
        ' createAssemblyAI({ webSocket }).'
      : '';

  return new ReadableStream<TranscriptionModelV4StreamPart>({
    start(controller) {
      let audioReader:
        | ReadableStreamDefaultReader<Uint8Array | string>
        | undefined;
      let connection: WebSocketConnection | undefined;
      let sessionId: string | undefined;
      let speechModelUsed: string | undefined;
      let terminateSent = false;
      let detectedLanguage = initialLanguage;
      let audioDurationSeconds: number | undefined;
      let sessionDurationSeconds: number | undefined;
      let speakerRevisions: JSONObject[] | undefined;
      // finalized turns keyed by turn_order, so a re-sent turn overwrites
      // rather than duplicates:
      const finalTurns = new Map<number, FinalTurn>();
      // turns for which a `transcript-partial` was surfaced and that still
      // need a `transcript-final` to close them out:
      const openPartialTurns = new Set<number>();

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
        if (speechModelUsed != null) metadata.speechModelUsed = speechModelUsed;
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

      const handleTurn = (raw: AssemblyAIStreamingMessage) => {
        const turnOrder = raw.turn_order ?? 0;
        const id = `turn-${turnOrder}`;
        const text = raw.transcript ?? '';
        const words = raw.words ?? [];
        const timing = timingFromWords(words);
        const isFinal =
          raw.end_of_turn === true &&
          (raw.turn_is_formatted === true || !formatTurns);

        if (!isFinal) {
          // Non-final turns (and, with `format_turns`, the unformatted
          // end-of-turn message on Universal Streaming models) are partials.
          if (!includePartialTurns || text.length === 0) return;
          openPartialTurns.add(turnOrder);
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
          return;
        }

        // The server clears the transcript of a final turn it could not
        // process (e.g. PII redaction failed) and attaches `error`. Surface it
        // as a non-fatal error part; the session continues.
        if (raw.error != null) {
          controller.enqueue({ type: 'error', error: new Error(raw.error) });
        }

        if (text.length > 0) {
          if (raw.language_code) {
            detectedLanguage = raw.language_code;
          }
          finalTurns.set(turnOrder, { text, ...timing });
          controller.enqueue({
            type: 'transcript-final',
            id,
            text,
            ...timing,
            providerMetadata: { assemblyai: turnMetadata(raw, words) },
          });
        } else if (openPartialTurns.has(turnOrder)) {
          // Silence-only or cleared turn: nothing to add to the transcript,
          // but a partial for this turn was already surfaced, so close it out
          // rather than leaving the consumer with stale partial text.
          controller.enqueue({
            type: 'transcript-final',
            id,
            text: '',
            providerMetadata: { assemblyai: turnMetadata(raw, words) },
          });
        }
        openPartialTurns.delete(turnOrder);
      };

      connection = connectToWebSocket({
        url,
        headers,
        webSocket,
        abortSignal,
        onAbort: finishWithError,
        onProcessingError: finishWithError,
        onOpen: () => {
          if (finished) return;
          // Emitted as soon as the socket opens (before `Begin`) so warnings
          // reach the caller even when the server rejects the session
          // parameters or the credentials and closes right away.
          controller.enqueue({ type: 'stream-start', warnings });
        },
        onMessageText: async text => {
          if (finished) return;
          const parsed = await safeParseJSON({ text });
          if (!parsed.success || finished) return;
          const raw = parsed.value as AssemblyAIStreamingMessage;

          if (includeRawChunks) {
            controller.enqueue({ type: 'raw', rawValue: raw });
          }

          switch (raw.type) {
            case 'Begin': {
              sessionId = raw.id;
              // The server echoes the configuration it applied. The model can
              // differ from the requested one (e.g. a legacy id redirected to
              // its successor), so report what actually ran.
              speechModelUsed = raw.configuration?.model ?? undefined;
              controller.enqueue({
                type: 'response-metadata',
                timestamp: currentDate,
                modelId: speechModelUsed ?? modelId,
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
              handleTurn(raw);
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
              // The server sends an Error frame carrying the close code and
              // reason immediately before closing the socket with that code.
              const code = raw.error_code;
              const reason =
                raw.error ?? 'AssemblyAI streaming transcription error';
              finishWithError(
                new Error(
                  code != null
                    ? describeSessionClose({ code, reason }) +
                        (code === 1008 ? headerHint : '')
                    : reason,
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
          // Reached when the socket closes without a preceding Error frame
          // (e.g. transport-level closes); the Error branch handles the
          // server's own close codes.
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
 * seconds.
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

/**
 * Rounds a duration in seconds to whole milliseconds, avoiding floating point
 * noise from subtracting two second values.
 */
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
  if (raw.error != null) metadata.error = raw.error;
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
        return 'a single WebSocket message was too large for the server; send smaller audio chunks';
      case 1011:
        return 'internal server error while establishing the connection';
      case 3005:
        return 'the session was cancelled by the server';
      case 3006:
        return 'invalid message or session parameters, or the session was terminated due to inactivity';
      case 3007:
        return 'audio input violation: chunks must contain 50ms to 1000ms of audio and should not be sent faster than real time';
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
