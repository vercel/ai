import type {
  Experimental_SpeechModelV4StreamPart as SpeechModelV4StreamPart,
  JSONObject,
  JSONValue,
  SharedV4AudioFormat,
  SharedV4Warning,
} from '@ai-sdk/provider';
import {
  connectToWebSocket,
  safeParseJSON,
  waitForWebSocketBufferDrain,
  type WebSocketConnection,
  type WebSocketLike,
} from '@ai-sdk/provider-utils';
import type { ElevenLabsConfig } from './elevenlabs-config';
import { ElevenLabsDialogueMarkerParser } from './elevenlabs-dialogue-markers';

/**
 * Counts Unicode code points, the unit ElevenLabs bills text-to-speech in.
 */
export function countCodePoints(text: string): number {
  let count = 0;
  for (const _ of text) {
    count++;
  }
  return count;
}

// Deltas are held back to the last word boundary: the WebSockets expect text
// messages to end at whitespace, and LLM deltas often split words.
const WORD_BOUNDARY = /[\s.,!?;:。、！？，；：]/u;
// Bounds buffering for scripts without spaces (e.g. CJK) or very long words.
const MAX_HELD_CODE_POINTS = 100;

/**
 * Splits buffered text at the last word boundary. Returns the text to send
 * now (possibly empty) and the text to keep buffering.
 */
export function takeCompleteWords(buffered: string): {
  send: string;
  hold: string;
} {
  const codePoints = Array.from(buffered);
  for (let index = codePoints.length - 1; index >= 0; index--) {
    if (WORD_BOUNDARY.test(codePoints[index])) {
      return {
        send: codePoints.slice(0, index + 1).join(''),
        hold: codePoints.slice(index + 1).join(''),
      };
    }
  }
  return codePoints.length >= MAX_HELD_CODE_POINTS
    ? { send: buffered, hold: '' }
    : { send: '', hold: buffered };
}

/**
 * Milliseconds of send inactivity after which a keepalive is sent, ahead of
 * the server's inactivity timeout (default 20 s).
 */
export function getKeepaliveIntervalMs(
  inactivityTimeoutSeconds: number | undefined,
): number {
  const timeoutMs = (inactivityTimeoutSeconds ?? 20) * 1000;
  return Math.max(1000, timeoutMs - 5000);
}

/**
 * Maps an ElevenLabs `output_format` (e.g. `mp3_44100_128`, `pcm_24000`) to
 * the format of the audio chunks it produces.
 */
export function getElevenLabsAudioFormat(
  outputFormat: string,
): SharedV4AudioFormat {
  const [codec, rate] = outputFormat.split('_');
  const sampleRate = rate != null ? Number(rate) : undefined;
  const withRate = (type: string): SharedV4AudioFormat =>
    sampleRate != null && Number.isFinite(sampleRate)
      ? { type, rate: sampleRate }
      : { type };

  switch (codec) {
    case 'mp3':
      return withRate('audio/mpeg');
    case 'pcm':
      return withRate('audio/pcm');
    case 'ulaw':
      return withRate('audio/pcmu');
    case 'alaw':
      return withRate('audio/pcma');
    case 'opus':
      return withRate('audio/opus');
    case 'wav':
      return withRate('audio/wav');
    default:
      return { type: 'application/octet-stream' };
  }
}

/** One decoded server message, normalized across the WebSockets. */
export type ElevenLabsStreamEvent = {
  audio?: string;
  error?: string;
  isFinal?: boolean;
  providerMetadata?: JSONObject;
};

/**
 * Wire protocol for one ElevenLabs streaming TTS WebSocket. `encodeText`
 * returns the messages for a text delta and the characters they carry.
 */
export type ElevenLabsStreamProtocol = {
  initMessage: Record<string, unknown>;
  /** Init-message fields that authenticate the socket with the API key. */
  authFields(apiKey: string): Record<string, unknown>;
  /** Resets the server's inactivity timeout without generating audio. */
  keepaliveMessage: Record<string, unknown>;
  encodeText(delta: string): {
    messages: Array<Record<string, unknown>>;
    characters: number;
  };
  endMessages(): {
    messages: Array<Record<string, unknown>>;
    characters: number;
  };
  decodeEvent(raw: Record<string, unknown>): ElevenLabsStreamEvent;
};

/** `stream-input`: one implicit context; `{"text":""}` ends the input. */
export function createSingleContextProtocol(
  initMessage: Record<string, unknown>,
): ElevenLabsStreamProtocol {
  return {
    initMessage,
    authFields: apiKey => ({ 'xi-api-key': apiKey }),
    keepaliveMessage: { text: ' ' },
    encodeText: delta => ({
      messages: [{ text: delta }],
      characters: countCodePoints(delta),
    }),
    endMessages: () => ({ messages: [{ text: '' }], characters: 0 }),
    decodeEvent: raw => decodeTextToSpeechEvent(raw),
  };
}

/**
 * Text-to-Dialogue `stream-input`. Speaker turns come from inline
 * `[[voice:<id>]]` markers (see `ElevenLabsDialogueMarkerParser`). With
 * `incremental: false` (the v3 family) all inputs go in one final message.
 */
export function createDialogueProtocol({
  initMessage,
  voices,
  incremental,
}: {
  initMessage: Record<string, unknown>;
  voices: string[];
  incremental: boolean;
}): ElevenLabsStreamProtocol {
  const parser = new ElevenLabsDialogueMarkerParser(voices);
  const buffered: Array<Record<string, unknown>> = [];

  const toInputs = (
    segments: ReturnType<ElevenLabsDialogueMarkerParser['push']>,
  ) => {
    let characters = 0;
    const inputs = segments.map(segment => {
      characters += countCodePoints(segment.text);
      return {
        text: segment.text,
        voice_id: segment.voiceId,
        ...(segment.newTurn && { new_turn: true }),
      };
    });
    return { inputs, characters };
  };

  const emit = (
    segments: ReturnType<ElevenLabsDialogueMarkerParser['push']>,
  ) => {
    const { inputs, characters } = toInputs(segments);
    if (!incremental) {
      buffered.push(...inputs);
      return { messages: [], characters };
    }
    return {
      messages: inputs.length > 0 ? [{ inputs }] : [],
      characters,
    };
  };

  return {
    initMessage: { ...initMessage, voices },
    authFields: apiKey => ({ xi_api_key: apiKey }),
    keepaliveMessage: { keep_alive: true },
    encodeText: delta => emit(parser.push(delta)),
    endMessages: () => {
      const tail = emit(parser.flush());
      if (!incremental) {
        return {
          messages: [{ inputs: buffered, close_socket: true }],
          characters: tail.characters,
        };
      }
      return {
        messages: [...tail.messages, { close_socket: true }],
        characters: tail.characters,
      };
    },
    decodeEvent: raw => {
      const error = getErrorText(raw);
      if (error != null) return { error };
      const alignment = camelizeAlignment(raw.alignment);
      return {
        ...(typeof raw.audio === 'string' &&
          raw.audio.length > 0 && { audio: raw.audio }),
        ...(raw.is_final === true && { isFinal: true }),
        ...((alignment != null || raw.is_final_audio_for_turn === true) && {
          providerMetadata: {
            ...(alignment != null && { alignment }),
            ...(raw.is_final_audio_for_turn === true && {
              isFinalAudioForTurn: true,
            }),
          },
        }),
      };
    },
  };
}

function decodeTextToSpeechEvent(
  raw: Record<string, unknown>,
): ElevenLabsStreamEvent {
  const error = getErrorText(raw);
  if (error != null && typeof raw.audio !== 'string') return { error };
  const alignment = raw.alignment ?? undefined;
  const normalizedAlignment = raw.normalizedAlignment ?? undefined;
  const metadata: JSONObject = {
    ...(alignment != null && { alignment: alignment as JSONValue }),
    ...(normalizedAlignment != null && {
      normalizedAlignment: normalizedAlignment as JSONValue,
    }),
  };
  return {
    ...(typeof raw.audio === 'string' &&
      raw.audio.length > 0 && { audio: raw.audio }),
    ...((raw.isFinal === true || raw.is_final === true) && { isFinal: true }),
    ...(Object.keys(metadata).length > 0 && { providerMetadata: metadata }),
  };
}

function getErrorText(raw: Record<string, unknown>): string | undefined {
  if (
    raw.error == null &&
    (typeof raw.message !== 'string' || raw.isFinal === true)
  ) {
    return undefined;
  }
  if (typeof raw.message === 'string') return raw.message;
  if (typeof raw.error === 'string') return raw.error;
  return JSON.stringify(raw.error);
}

// Dialogue alignment is snake_case on the wire; expose the TTS (camelCase) shape.
function camelizeAlignment(value: unknown): JSONObject | undefined {
  if (value == null || typeof value !== 'object') return undefined;
  const alignment = value as Record<string, unknown>;
  return {
    ...(alignment.chars != null && { chars: alignment.chars as JSONValue }),
    ...(alignment.char_start_times_ms != null && {
      charStartTimesMs: alignment.char_start_times_ms as JSONValue,
    }),
    ...(alignment.char_durations_ms != null && {
      charDurationsMs: alignment.char_durations_ms as JSONValue,
    }),
  };
}

/**
 * Streams text-to-speech over an ElevenLabs WebSocket using `protocol`: an
 * init message carrying the API key, text ending at word boundaries,
 * keepalives while idle, end-of-input messages, then audio until the final
 * event.
 */
export function createElevenLabsSpeechStream({
  abortSignal,
  apiKey,
  audioFormat,
  headers,
  inactivityTimeoutSeconds,
  includeRawChunks,
  protocol,
  text,
  url,
  warnings,
  webSocket,
}: {
  abortSignal: AbortSignal | undefined;
  /** Sent in the init message, so native (header-less) WebSockets work. */
  apiKey: string | undefined;
  audioFormat: SharedV4AudioFormat;
  headers: Record<string, string | undefined>;
  inactivityTimeoutSeconds: number | undefined;
  includeRawChunks: boolean | undefined;
  protocol: ElevenLabsStreamProtocol;
  text: ReadableStream<string>;
  url: URL;
  warnings: SharedV4Warning[];
  webSocket: ElevenLabsConfig['webSocket'];
}): ReadableStream<SpeechModelV4StreamPart> {
  let finished = false;
  let cleanup: (closeCode?: number) => void = () => {};

  return new ReadableStream<SpeechModelV4StreamPart>({
    start: controller => {
      let textReader: ReadableStreamDefaultReader<string> | undefined;
      let connection: WebSocketConnection | undefined;
      let inputCharacters = 0;
      let keepaliveTimer: ReturnType<typeof setTimeout> | undefined;
      const keepaliveIntervalMs = getKeepaliveIntervalMs(
        inactivityTimeoutSeconds,
      );

      // Every send restarts the idle clock; a slow text producer (e.g. a
      // reasoning model) would otherwise hit the server's inactivity timeout.
      const send = (
        socket: WebSocketLike,
        message: Record<string, unknown>,
      ) => {
        socket.send(JSON.stringify(message));
        if (keepaliveTimer != null) clearTimeout(keepaliveTimer);
        keepaliveTimer = setTimeout(() => {
          if (!finished) send(socket, protocol.keepaliveMessage);
        }, keepaliveIntervalMs);
      };

      cleanup = (closeCode?: number) => {
        if (keepaliveTimer != null) clearTimeout(keepaliveTimer);
        if (textReader != null) {
          void textReader.cancel().catch(() => {});
        } else {
          void text.cancel().catch(() => {});
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
        controller.enqueue({
          type: 'finish',
          usage: { inputCharacters },
        });
        controller.close();
        cleanup(1000);
      };

      const sendAll = async (
        socket: WebSocketLike,
        encoded: ReturnType<ElevenLabsStreamProtocol['encodeText']>,
      ) => {
        inputCharacters += encoded.characters;
        for (const message of encoded.messages) {
          send(socket, message);
          await waitForWebSocketBufferDrain(socket);
        }
      };

      const sendText = async (socket: WebSocketLike) => {
        const reader = text.getReader();
        textReader = reader;
        let held = '';
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done || finished) break;
            const { send: complete, hold } = takeCompleteWords(held + value);
            held = hold;
            // An empty text message ends the input, so never send one here.
            if (complete.length > 0) {
              await sendAll(socket, protocol.encodeText(complete));
            }
          }
        } finally {
          reader.releaseLock();
          if (textReader === reader) {
            textReader = undefined;
          }
        }
        if (!finished) {
          if (held.length > 0) {
            await sendAll(socket, protocol.encodeText(held));
          }
          await sendAll(socket, protocol.endMessages());
        }
      };

      connection = connectToWebSocket({
        url,
        headers,
        webSocket,
        abortSignal,
        onAbort: finishWithError,
        onOpen: socket => {
          controller.enqueue({ type: 'stream-start', warnings });
          send(socket, {
            ...protocol.initMessage,
            ...(apiKey != null && protocol.authFields(apiKey)),
          });
          void sendText(socket).catch(finishWithError);
        },
        onMessageText: async messageText => {
          if (finished) return;
          const parsed = await safeParseJSON({ text: messageText });
          if (!parsed.success) return;
          const raw = parsed.value as Record<string, unknown>;

          if (includeRawChunks) {
            controller.enqueue({ type: 'raw', rawValue: raw });
          }

          const event = protocol.decodeEvent(raw);
          if (event.error != null) {
            finishWithError(
              new Error(`ElevenLabs speech stream error: ${event.error}`),
            );
            return;
          }

          // Turn boundaries arrive as standalone frames, so they are emitted
          // as metadata-only (empty) audio parts.
          if (
            event.audio != null ||
            event.providerMetadata?.isFinalAudioForTurn === true
          ) {
            controller.enqueue({
              type: 'audio',
              audio: event.audio ?? '',
              audioFormat,
              ...(event.providerMetadata != null && {
                providerMetadata: { elevenlabs: event.providerMetadata },
              }),
            });
          }

          if (event.isFinal) {
            finish();
          }
        },
        onProcessingError: finishWithError,
        onSocketError: () => {
          finishWithError(new Error('ElevenLabs speech stream error.'));
        },
        onClose: ({ code, reason }) => {
          if (finished) return;
          finishWithError(
            new Error(
              'ElevenLabs speech stream closed before completion' +
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
