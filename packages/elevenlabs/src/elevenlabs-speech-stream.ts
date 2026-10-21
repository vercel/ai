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

/** One decoded server message, normalized across the three WebSockets. */
export type ElevenLabsStreamEvent = {
  audio?: string;
  error?: string;
  isFinal?: boolean;
  /** Message belongs to another context and is ignored. */
  ignore?: boolean;
  providerMetadata?: JSONObject;
};

/**
 * Wire protocol for one ElevenLabs streaming TTS WebSocket. `encodeText`
 * returns the messages for a text delta and the characters they carry.
 */
export type ElevenLabsStreamProtocol = {
  initMessage: Record<string, unknown>;
  encodeText(delta: string): {
    messages: Array<Record<string, unknown>>;
    characters: number;
  };
  endMessages(): {
    messages: Array<Record<string, unknown>>;
    characters: number;
  };
  decodeEvent(raw: Record<string, unknown>): ElevenLabsStreamEvent;
  /** Messages to send after the final event (e.g. `close_socket`). */
  afterFinalMessages?: Array<Record<string, unknown>>;
};

/** `stream-input`: one implicit context; `{"text":""}` ends the input. */
export function createSingleContextProtocol(
  initMessage: Record<string, unknown>,
): ElevenLabsStreamProtocol {
  return {
    initMessage,
    encodeText: delta => ({
      messages: [{ text: delta }],
      characters: countCodePoints(delta),
    }),
    endMessages: () => ({ messages: [{ text: '' }], characters: 0 }),
    decodeEvent: raw => decodeTextToSpeechEvent(raw),
  };
}

/**
 * `multi-stream-input` with a single caller-chosen context: every message
 * carries `context_id`; the input ends with flush + `close_context`.
 */
export function createMultiContextProtocol(
  initMessage: Record<string, unknown>,
  contextId: string,
): ElevenLabsStreamProtocol {
  return {
    initMessage: { ...initMessage, context_id: contextId },
    encodeText: delta => ({
      messages: [{ text: delta, context_id: contextId }],
      characters: countCodePoints(delta),
    }),
    endMessages: () => ({
      messages: [
        { context_id: contextId, flush: true },
        { context_id: contextId, close_context: true },
      ],
      characters: 0,
    }),
    decodeEvent: raw => {
      const eventContextId = raw.contextId ?? raw.context_id;
      if (eventContextId != null && eventContextId !== contextId) {
        return { ignore: true };
      }
      return decodeTextToSpeechEvent(raw, { contextId });
    },
    afterFinalMessages: [{ close_socket: true }],
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
  { contextId }: { contextId?: string } = {},
): ElevenLabsStreamEvent {
  const error = getErrorText(raw);
  if (error != null && typeof raw.audio !== 'string') return { error };
  const alignment = raw.alignment ?? undefined;
  const normalizedAlignment = raw.normalizedAlignment ?? undefined;
  const metadata: JSONObject = {
    ...(contextId != null && { contextId }),
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
 * Streams text-to-speech over an ElevenLabs WebSocket using `protocol`:
 * init message, encoded text deltas, end-of-input messages, then audio until
 * the final event.
 */
export function createElevenLabsSpeechStream({
  abortSignal,
  audioFormat,
  headers,
  includeRawChunks,
  protocol,
  text,
  url,
  warnings,
  webSocket,
}: {
  abortSignal: AbortSignal | undefined;
  audioFormat: SharedV4AudioFormat;
  headers: Record<string, string | undefined>;
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

      cleanup = (closeCode?: number) => {
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
        for (const message of protocol.afterFinalMessages ?? []) {
          try {
            connection?.socket?.send(JSON.stringify(message));
          } catch {}
        }
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
          socket.send(JSON.stringify(message));
          await waitForWebSocketBufferDrain(socket);
        }
      };

      const sendText = async (socket: WebSocketLike) => {
        const reader = text.getReader();
        textReader = reader;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done || finished) break;
            // An empty text message ends the input, so skip empty deltas.
            if (value.length === 0) continue;
            await sendAll(socket, protocol.encodeText(value));
          }
        } finally {
          reader.releaseLock();
          if (textReader === reader) {
            textReader = undefined;
          }
        }
        if (!finished) {
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
          socket.send(JSON.stringify(protocol.initMessage));
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
          if (event.ignore) return;
          if (event.error != null) {
            finishWithError(
              new Error(`ElevenLabs speech stream error: ${event.error}`),
            );
            return;
          }

          if (event.audio != null) {
            controller.enqueue({
              type: 'audio',
              audio: event.audio,
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
          finishWithError(
            new Error(
              'ElevenLabs speech stream error.' +
                (webSocket == null
                  ? ' Note: the native WebSocket implementation in browsers,' +
                    ' Node.js, Deno, and Bun cannot send the xi-api-key header' +
                    ' required by ElevenLabs. Pass a header-capable WebSocket' +
                    " implementation (e.g. the 'ws' package) via" +
                    ' createElevenLabs({ webSocket }).'
                  : ''),
            ),
          );
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
