import {
  InvalidArgumentError,
  UnsupportedFunctionalityError,
  type Experimental_TranscriptionModelV4StreamPart as TranscriptionModelV4StreamPart,
  type JSONObject,
  type SharedV4Warning,
  type TranscriptionModelV4,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  connectToWebSocket,
  convertBase64ToUint8Array,
  createJsonResponseHandler,
  lazySchema,
  parseProviderOptions,
  postJsonToApi,
  resolve,
  safeParseJSON,
  toWebSocketUrl,
  validateTypes,
  waitForWebSocketBufferDrain,
  zodSchema,
  type InferSchema,
  type WebSocketConnection,
  type WebSocketConstructor,
  type WebSocketLike,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { AssemblyAIConfig } from './assemblyai-config';
import { assemblyaiFailedResponseHandler } from './assemblyai-error';
import {
  assemblyaiStreamingSharedOptionKeys,
  getAssemblyAITranscriptionModelEntry,
} from './assemblyai-model-catalog';
import {
  assemblyaiTranscriptionModelOptionsSchema,
  type AssemblyAITranscriptionModelOptions,
} from './assemblyai-transcription-model-options';

type StreamOptions = Parameters<
  NonNullable<TranscriptionModelV4['doStream']>
>[0];
type StreamResult = Awaited<
  ReturnType<NonNullable<TranscriptionModelV4['doStream']>>
>;

export type AssemblyAIStreamingConfig = AssemblyAIConfig & {
  /** Base URL of the Streaming v3 WebSocket API. */
  streamingBaseURL?: string;
  /** Base URL of the temporary token API. */
  tokenBaseURL?: string;
  webSocket?: WebSocketConstructor;
  _internal?: { currentDate?: () => Date };
};

const DEFAULT_STREAMING_BASE_URL = 'wss://streaming.assemblyai.com';
const DEFAULT_TOKEN_BASE_URL = 'https://token.assemblyai.com';

/**
 * Seconds the temporary token stays redeemable. It only has to outlive the
 * WebSocket handshake; the session itself runs for up to three hours.
 */
const TOKEN_EXPIRES_IN_SECONDS = 60;

/**
 * Supported input formats. Raw formats declare their sample size and the byte
 * value of silence; compressed formats are self-describing.
 */
const encodings: Record<
  string,
  { encoding: string; raw?: { bytesPerSample: number; silence: number } }
> = {
  'audio/pcm': {
    encoding: 'pcm_s16le',
    raw: { bytesPerSample: 2, silence: 0 },
  },
  'audio/pcmu': {
    encoding: 'pcm_mulaw',
    raw: { bytesPerSample: 1, silence: 0xff },
  },
  'audio/opus': { encoding: 'opus' },
  'audio/ogg': { encoding: 'ogg_opus' },
  'audio/aac': { encoding: 'aac' },
};

/**
 * The server closes the session (`3007`) when a raw audio message holds less
 * than 20 ms or more than 1000 ms of audio.
 */
const MIN_RAW_CHUNK_MS = 20;
const MAX_RAW_CHUNK_MS = 1000;
/** Frame size used when splitting chunks that are too long. */
const SPLIT_RAW_CHUNK_MS = 100;

/**
 * Streams audio to the AssemblyAI Streaming v3 WebSocket API.
 *
 * The API key is exchanged for a short-lived temporary token that is passed
 * in the URL, so the stream works with native `WebSocket` implementations
 * (browsers, Node.js, Deno, Bun, edge runtimes), which cannot send headers.
 *
 * @see https://www.assemblyai.com/docs/streaming/getting-started/transcribe-streaming-audio
 */
export async function streamAssemblyAITranscription(
  modelId: string,
  config: AssemblyAIStreamingConfig,
  options: StreamOptions,
): Promise<StreamResult> {
  if (
    getAssemblyAITranscriptionModelEntry(modelId).capabilities.transcription
      .streaming === false
  ) {
    throw new UnsupportedFunctionalityError({
      functionality: 'streaming transcription',
      message: `'${modelId}' is a pre-recorded model and does not support streaming transcription. Use 'assemblyai-stt-3-7-realtime-agent', 'assemblyai-stt-3-7-realtime', or 'universal-3-6-pro'.`,
    });
  }

  const format = encodings[options.inputAudioFormat.type.toLowerCase()];
  const rate = options.inputAudioFormat.rate;
  if (format == null) {
    throw new InvalidArgumentError({
      argument: 'inputAudioFormat',
      message:
        'AssemblyAI streaming transcription accepts audio/pcm (16-bit little-endian), audio/pcmu, audio/opus (raw Opus packets), audio/ogg (Ogg Opus), or audio/aac.',
    });
  }
  if (
    format.raw != null &&
    (rate == null || !Number.isInteger(rate) || rate < 8000 || rate > 96000)
  ) {
    throw new InvalidArgumentError({
      argument: 'inputAudioFormat',
      message:
        'AssemblyAI streaming transcription of raw PCM requires an integer sample rate from 8000 to 96000 Hz.',
    });
  }

  const providerOptions = await parseProviderOptions({
    provider: 'assemblyai',
    providerOptions: options.providerOptions,
    schema: assemblyaiTranscriptionModelOptionsSchema,
  });
  validateStreamingOptions(providerOptions);
  const warnings = getStreamingWarnings(modelId, providerOptions);

  const url = toWebSocketUrl(
    `${config.streamingBaseURL ?? DEFAULT_STREAMING_BASE_URL}/v3/ws`,
  );
  url.searchParams.set('speech_model', modelId);
  url.searchParams.set('encoding', format.encoding);
  if (format.raw != null) url.searchParams.set('sample_rate', String(rate));
  for (const [name, value] of Object.entries(
    getConnectionParameters(providerOptions),
  )) {
    // List parameters are JSON-encoded; the server parses them with
    // `json.loads`.
    if (value != null) {
      url.searchParams.set(
        name,
        Array.isArray(value) ? JSON.stringify(value) : String(value),
      );
    }
  }
  // The request body reported to callers never includes the token.
  const requestBody = url.toString();

  const token = await createTemporaryToken(config, options);
  url.searchParams.set('token', token);

  const timestamp = config._internal?.currentDate?.() ?? new Date();

  return {
    request: { body: requestBody },
    response: { timestamp, modelId },
    stream: createTranscriptStream({
      url,
      webSocket: config.webSocket,
      warnings,
      modelId,
      timestamp,
      language: getRequestedLanguage(providerOptions),
      chunker:
        format.raw != null && rate != null
          ? createRawAudioChunker({ rate, ...format.raw })
          : undefined,
      options,
    }),
  };
}

async function createTemporaryToken(
  config: AssemblyAIStreamingConfig,
  options: StreamOptions,
): Promise<string> {
  const { value } = await postJsonToApi({
    url: `${config.tokenBaseURL ?? DEFAULT_TOKEN_BASE_URL}/v1/token`,
    headers: combineHeaders(await resolve(config.headers), options.headers),
    body: {
      product: 'streaming',
      expires_in_seconds: TOKEN_EXPIRES_IN_SECONDS,
    },
    failedResponseHandler: assemblyaiFailedResponseHandler,
    successfulResponseHandler: createJsonResponseHandler(tokenResponseSchema),
    abortSignal: options.abortSignal,
    fetch: config.fetch,
  });
  return value.token;
}

function getConnectionParameters(
  options: AssemblyAITranscriptionModelOptions | undefined,
): Record<string, string | number | boolean | string[] | null | undefined> {
  const streaming = options?.streaming;
  return {
    prompt: options?.prompt,
    keyterms_prompt: options?.keytermsPrompt,
    language_codes: streaming?.languageCodes?.length
      ? streaming.languageCodes
      : options?.languageCode != null
        ? [options.languageCode]
        : undefined,
    language_detection: options?.languageDetection,
    domain: options?.domain,
    speaker_labels: options?.speakerLabels,
    filter_profanity: options?.filterProfanity,
    redact_pii: options?.redactPii,
    redact_pii_policies: options?.redactPiiPolicies,
    redact_pii_sub: options?.redactPiiSub,
    mode: streaming?.mode,
    min_turn_silence: streaming?.minTurnSilence,
    max_turn_silence: streaming?.maxTurnSilence,
    vad_threshold: streaming?.vadThreshold,
    interruption_delay: streaming?.interruptionDelay,
    include_partial_turns: streaming?.includePartialTurns,
    agent_context: streaming?.agentContext,
    previous_context_n_turns: streaming?.previousContextNTurns,
    max_speakers: streaming?.maxSpeakers,
    voice_focus: streaming?.voiceFocus,
    voice_focus_threshold: streaming?.voiceFocusThreshold,
    inactivity_timeout: streaming?.inactivityTimeout,
  };
}

/**
 * Rejects option combinations that the streaming server rejects with an
 * error that names its internal parameters instead of the provider options.
 */
function validateStreamingOptions(
  options: AssemblyAITranscriptionModelOptions | undefined,
) {
  if (
    options?.streaming?.voiceFocusThreshold != null &&
    options.streaming.voiceFocus == null
  ) {
    throw new InvalidArgumentError({
      argument: 'providerOptions.assemblyai.streaming.voiceFocusThreshold',
      message:
        "'streaming.voiceFocusThreshold' requires 'streaming.voiceFocus'.",
    });
  }
  if (
    !options?.redactPii &&
    (options?.redactPiiPolicies != null ||
      (options?.redactPiiSub != null && options.redactPiiSub !== 'hash'))
  ) {
    throw new InvalidArgumentError({
      argument: 'providerOptions.assemblyai.redactPii',
      message:
        "'redactPiiPolicies' and 'redactPiiSub' require 'redactPii' for streaming transcription.",
    });
  }
}

/**
 * Warns about options the streaming server ignores. Other invalid values are
 * reported by the server when it closes the session.
 */
function getStreamingWarnings(
  modelId: string,
  options: AssemblyAITranscriptionModelOptions | undefined,
): SharedV4Warning[] {
  const warnings: SharedV4Warning[] = [];
  if (
    getAssemblyAITranscriptionModelEntry(modelId).requestConfig.transcription
      .deprecated
  ) {
    warnings.push({
      type: 'deprecated',
      setting: `model '${modelId}'`,
      message: `AssemblyAI has deprecated '${modelId}' for streaming. Use 'assemblyai-stt-3-7-realtime-agent' instead. See documentation: https://www.assemblyai.com/docs/getting-started/model-versions-and-deprecations`,
    });
  }
  const shared: ReadonlySet<string> = new Set(
    assemblyaiStreamingSharedOptionKeys,
  );
  for (const [key, value] of Object.entries(options ?? {})) {
    if (value == null || key === 'streaming') continue;
    // `false` only matters for options that are enabled by default.
    if (value === false && !defaultEnabledOptionKeys.has(key)) continue;
    if (!shared.has(key)) {
      warnings.push({
        type: 'unsupported',
        feature: `providerOptions.assemblyai.${key}`,
        details:
          'This option only applies to pre-recorded transcription and is ignored for streaming transcription.',
      });
    }
  }
  if (
    options?.languageCode != null &&
    options.streaming?.languageCodes?.length
  ) {
    warnings.push({
      type: 'other',
      message:
        "'languageCode' is ignored because 'streaming.languageCodes' is set.",
    });
  }
  if (options?.streaming?.maxSpeakers != null && !options.speakerLabels) {
    warnings.push({
      type: 'other',
      message:
        "'streaming.maxSpeakers' only applies when 'speakerLabels' is enabled.",
    });
  }
  return warnings;
}

function createTranscriptStream({
  url,
  webSocket,
  warnings,
  modelId,
  timestamp,
  language: initialLanguage,
  chunker,
  options,
}: {
  url: URL;
  webSocket: WebSocketConstructor | undefined;
  warnings: SharedV4Warning[];
  modelId: string;
  timestamp: Date;
  language: string | undefined;
  /** Re-chunks raw audio into sizes the server accepts. */
  chunker: RawAudioChunker | undefined;
  options: StreamOptions;
}): ReadableStream<TranscriptionModelV4StreamPart> {
  let finished = false;
  let cleanup: () => void = () => {};

  return new ReadableStream<TranscriptionModelV4StreamPart>({
    start(controller) {
      let connection: WebSocketConnection | undefined;
      let reader: ReadableStreamDefaultReader<Uint8Array | string> | undefined;
      let terminateSent = false;
      let language = initialLanguage;
      let sessionId: string | undefined;
      let audioDurationSeconds: number | undefined;
      let sessionDurationSeconds: number | undefined;
      // Final turns keyed by turn order, so a re-sent turn replaces the
      // earlier copy instead of duplicating it.
      const finalTurns = new Map<number, TurnMessage>();
      // Turns with a surfaced partial that still need a final.
      const openTurns = new Set<number>();

      cleanup = () => {
        void (reader != null ? reader.cancel() : options.audio.cancel()).catch(
          () => {},
        );
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
        const turns = [...finalTurns.entries()]
          .sort(([a], [b]) => a - b)
          .map(([, turn]) => turn);
        const providerMetadata: JSONObject = {};
        if (sessionId != null) providerMetadata.sessionId = sessionId;
        controller.enqueue({
          type: 'finish',
          text: turns
            .map(turn => turn.transcript)
            .filter(text => text.length > 0)
            .join(' '),
          // AssemblyAI reports word timings in milliseconds.
          segments: turns.flatMap(turn =>
            (turn.words ?? []).map(word => ({
              text: word.text,
              startSecond: word.start / 1000,
              endSecond: word.end / 1000,
            })),
          ),
          language,
          ...(audioDurationSeconds != null
            ? { durationInSeconds: audioDurationSeconds }
            : {}),
          // Streaming is billed by session duration.
          ...(sessionDurationSeconds != null
            ? { usage: { sessionDurationSeconds } }
            : {}),
          ...(Object.keys(providerMetadata).length > 0
            ? { providerMetadata: { assemblyai: providerMetadata } }
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
            for (const chunk of chunker?.push(bytes) ?? [bytes]) {
              socket.send(chunk);
            }
            await waitForWebSocketBufferDrain(socket, {
              abortSignal: options.abortSignal,
            });
          }
        } finally {
          reader.releaseLock();
          reader = undefined;
        }
        if (!finished) {
          const rest = chunker?.flush();
          if (rest != null) socket.send(rest);
          // The server flushes the open turn, sends `Termination`, and closes.
          terminateSent = true;
          socket.send(JSON.stringify({ type: 'Terminate' }));
        }
      };
      const handleTurn = (turn: TurnMessage) => {
        const id = `turn-${turn.turn_order}`;
        const words = turn.words ?? [];
        const startSecond =
          words.length > 0 ? words[0].start / 1000 : undefined;
        const endSecond =
          words.length > 0 ? words.at(-1)!.end / 1000 : undefined;

        if (!turn.end_of_turn) {
          if (turn.transcript.length === 0) return;
          openTurns.add(turn.turn_order);
          controller.enqueue({
            type: 'transcript-partial',
            id,
            text: turn.transcript,
            ...(startSecond != null && endSecond != null
              ? {
                  startSecond,
                  durationInSeconds:
                    Math.round((endSecond - startSecond) * 1000) / 1000,
                }
              : {}),
          });
          return;
        }

        // Empty finals follow speech that produced no words (e.g. background
        // noise). Only close out a turn that already surfaced a partial.
        if (turn.transcript.length === 0 && !openTurns.has(turn.turn_order)) {
          return;
        }
        openTurns.delete(turn.turn_order);
        finalTurns.set(turn.turn_order, turn);
        language = turn.language_code ?? language;
        controller.enqueue({
          type: 'transcript-final',
          id,
          text: turn.transcript,
          ...(startSecond != null && endSecond != null
            ? { startSecond, endSecond }
            : {}),
          providerMetadata: { assemblyai: getTurnMetadata(turn) },
        });
      };

      connection = connectToWebSocket({
        url,
        webSocket,
        abortSignal: options.abortSignal,
        onAbort: fail,
        onProcessingError: fail,
        onOpen() {
          // Emitted on open (not on `Begin`) so warnings reach the caller even
          // when the server rejects the session parameters.
          controller.enqueue({ type: 'stream-start', warnings });
        },
        async onMessageText(text) {
          if (finished) return;
          const parsed = await safeParseJSON({
            text,
            schema: messageTypeSchema,
          });
          if (!parsed.success) throw parsed.error;
          if (finished) return;
          if (options.includeRawChunks) {
            controller.enqueue({ type: 'raw', rawValue: parsed.rawValue });
          }
          switch (parsed.value.type) {
            case 'Begin': {
              const begin = await validateTypes({
                value: parsed.rawValue,
                schema: beginMessageSchema,
              });
              sessionId = begin.id ?? undefined;
              controller.enqueue({
                type: 'response-metadata',
                timestamp,
                // The server echoes the model it actually runs.
                modelId: begin.configuration?.model ?? modelId,
                body: parsed.rawValue,
              });
              const socket = connection?.socket;
              if (socket != null) void sendAudio(socket).catch(fail);
              break;
            }
            case 'Turn': {
              handleTurn(
                await validateTypes({
                  value: parsed.rawValue,
                  schema: turnMessageSchema,
                }),
              );
              break;
            }
            case 'Termination': {
              const termination = await validateTypes({
                value: parsed.rawValue,
                schema: terminationMessageSchema,
              });
              audioDurationSeconds =
                termination.audio_duration_seconds ?? undefined;
              sessionDurationSeconds =
                termination.session_duration_seconds ?? undefined;
              finish();
              break;
            }
            case 'Error': {
              // Sent right before the server closes the socket with this code.
              const error = await validateTypes({
                value: parsed.rawValue,
                schema: errorMessageSchema,
              });
              fail(
                new Error(
                  describeSessionClose(
                    error.error_code ?? undefined,
                    error.error ?? undefined,
                  ),
                ),
              );
              break;
            }
            // `SpeechStarted` (a barge-in signal for voice agents) and other
            // message types are only surfaced as raw chunks.
          }
        },
        onSocketError: () =>
          fail(new Error('AssemblyAI streaming WebSocket error.')),
        onClose({ code, reason }) {
          if (finished) return;
          if (
            terminateSent &&
            (code == null || code === 1000 || code === 1005)
          ) {
            finish();
          } else {
            fail(new Error(describeSessionClose(code, reason)));
          }
        },
      });
    },
    cancel() {
      if (finished) return;
      finished = true;
      cleanup();
    },
  });
}

/**
 * Turn details the stream parts cannot represent. Word timings stay in
 * milliseconds, as in the AssemblyAI API.
 */
function getTurnMetadata(turn: TurnMessage): JSONObject {
  const metadata: JSONObject = { turnOrder: turn.turn_order };
  if (turn.end_of_turn_confidence != null) {
    metadata.endOfTurnConfidence = turn.end_of_turn_confidence;
  }
  if (turn.speaker_label != null) metadata.speakerLabel = turn.speaker_label;
  if (turn.language_code != null) metadata.languageCode = turn.language_code;
  if (turn.language_confidence != null) {
    metadata.languageConfidence = turn.language_confidence;
  }
  metadata.words = (turn.words ?? []).map(word => ({
    text: word.text,
    start: word.start,
    end: word.end,
    ...(word.confidence != null ? { confidence: word.confidence } : {}),
    ...(word.speaker != null ? { speaker: word.speaker } : {}),
  }));
  return metadata;
}

/**
 * @see https://www.assemblyai.com/docs/streaming/common-session-errors-and-closures
 */
function describeSessionClose(code?: number, reason?: string): string {
  const hints: Record<number, string> = {
    1008: 'invalid or expired credentials, or an account issue such as insufficient balance',
    3005: 'the session was cancelled by the server',
    3006: 'invalid session parameters or messages, or the session timed out from inactivity',
    3007: 'audio was sent faster than real time, or a chunk held less than 20 ms or more than 1000 ms of audio',
    3008: 'the session reached its maximum duration',
    3009: 'too many concurrent sessions',
  };
  const hint = code != null ? hints[code] : undefined;
  return (
    'AssemblyAI streaming transcription session closed before completion' +
    (code != null ? ` (code ${code}${reason ? `: ${reason}` : ''})` : '') +
    (hint != null ? `: ${hint}.` : '.')
  );
}

/**
 * Pre-recorded options that are enabled by default, so setting them to
 * `false` is a request that streaming transcription does not honor.
 */
const defaultEnabledOptionKeys: ReadonlySet<string> = new Set([
  'formatText',
  'punctuate',
]);

/**
 * The language the session is steered toward, used as the stream's language
 * when language detection does not report one.
 */
function getRequestedLanguage(
  options: AssemblyAITranscriptionModelOptions | undefined,
): string | undefined {
  const languageCodes = options?.streaming?.languageCodes;
  if (languageCodes?.length) {
    return languageCodes.length === 1 ? languageCodes[0] : undefined;
  }
  return options?.languageCode ?? undefined;
}

type RawAudioChunker = {
  /** Returns the chunks to send now; holds back audio that is too short. */
  push(bytes: Uint8Array): Uint8Array[];
  /** Returns the held-back audio, padded with silence to the minimum size. */
  flush(): Uint8Array | undefined;
};

/**
 * Keeps raw audio messages within the 20-1000 ms the server accepts. Chunks
 * that are already in range pass through unchanged, so well-sized input gets
 * no added latency.
 */
function createRawAudioChunker({
  rate,
  bytesPerSample,
  silence,
}: {
  rate: number;
  bytesPerSample: number;
  silence: number;
}): RawAudioChunker {
  const bytesFor = (ms: number) =>
    Math.ceil((rate * ms) / 1000) * bytesPerSample;
  const minBytes = bytesFor(MIN_RAW_CHUNK_MS);
  const maxBytes = bytesFor(MAX_RAW_CHUNK_MS);
  const splitBytes = bytesFor(SPLIT_RAW_CHUNK_MS);
  let pending: Uint8Array | undefined;

  return {
    push(bytes) {
      let data = bytes;
      if (pending != null) {
        data = new Uint8Array(pending.length + bytes.length);
        data.set(pending);
        data.set(bytes, pending.length);
        pending = undefined;
      }
      if (data.length < minBytes) {
        pending = data;
        return [];
      }
      const chunks: Uint8Array[] = [];
      while (data.length > maxBytes) {
        chunks.push(data.subarray(0, splitBytes));
        data = data.subarray(splitBytes);
      }
      chunks.push(data);
      return chunks;
    },
    flush() {
      if (pending == null) return undefined;
      const chunk = new Uint8Array(Math.max(pending.length, minBytes));
      chunk.fill(silence);
      chunk.set(pending);
      pending = undefined;
      return chunk;
    },
  };
}

const tokenResponseSchema = lazySchema(() =>
  zodSchema(z.object({ token: z.string().min(1) })),
);

const messageTypeSchema = lazySchema(() =>
  zodSchema(z.object({ type: z.string() })),
);

const beginMessageSchema = lazySchema(() =>
  zodSchema(
    z.object({
      id: z.string().nullish(),
      configuration: z.object({ model: z.string().nullish() }).nullish(),
    }),
  ),
);

const turnMessageSchema = lazySchema(() =>
  zodSchema(
    z.object({
      turn_order: z.number().int(),
      end_of_turn: z.boolean(),
      transcript: z.string(),
      end_of_turn_confidence: z.number().nullish(),
      language_code: z.string().nullish(),
      language_confidence: z.number().nullish(),
      speaker_label: z.string().nullish(),
      words: z
        .array(
          z.object({
            text: z.string(),
            start: z.number(),
            end: z.number(),
            confidence: z.number().nullish(),
            speaker: z.string().nullish(),
          }),
        )
        .nullish(),
    }),
  ),
);
type TurnMessage = InferSchema<typeof turnMessageSchema>;

const terminationMessageSchema = lazySchema(() =>
  zodSchema(
    z.object({
      audio_duration_seconds: z.number().nullish(),
      session_duration_seconds: z.number().nullish(),
    }),
  ),
);

const errorMessageSchema = lazySchema(() =>
  zodSchema(
    z.object({
      error_code: z.number().nullish(),
      error: z.string().nullish(),
    }),
  ),
);
