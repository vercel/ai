import type {
  Experimental_SpeechModelV4StreamPart as SpeechModelV4StreamPart,
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

type ElevenLabsSpeechStreamEvent = {
  audio?: string | null;
  isFinal?: boolean | null;
  alignment?: unknown;
  normalizedAlignment?: unknown;
  error?: unknown;
  message?: unknown;
};

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

/**
 * Streams text-to-speech over the ElevenLabs `stream-input` WebSocket:
 * an init message, one message per text delta, then `{"text":""}` to end
 * the input. The server answers with base64 audio chunks and `isFinal`.
 */
export function createElevenLabsSpeechStream({
  abortSignal,
  audioFormat,
  headers,
  includeRawChunks,
  initMessage,
  text,
  url,
  warnings,
  webSocket,
}: {
  abortSignal: AbortSignal | undefined;
  audioFormat: SharedV4AudioFormat;
  headers: Record<string, string | undefined>;
  includeRawChunks: boolean | undefined;
  initMessage: Record<string, unknown>;
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
        controller.enqueue({
          type: 'finish',
          usage: { inputCharacters },
        });
        controller.close();
        cleanup(1000);
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
            inputCharacters += countCodePoints(value);
            socket.send(JSON.stringify({ text: value }));
            await waitForWebSocketBufferDrain(socket);
          }
        } finally {
          reader.releaseLock();
          if (textReader === reader) {
            textReader = undefined;
          }
        }
        if (!finished) {
          socket.send(JSON.stringify({ text: '' }));
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
          socket.send(JSON.stringify(initMessage));
          void sendText(socket).catch(finishWithError);
        },
        onMessageText: async messageText => {
          if (finished) return;
          const parsed = await safeParseJSON({ text: messageText });
          if (!parsed.success) return;
          const event = parsed.value as ElevenLabsSpeechStreamEvent;

          if (includeRawChunks) {
            controller.enqueue({ type: 'raw', rawValue: event });
          }

          if (
            event.error != null ||
            (event.audio == null && isErrorMessage(event))
          ) {
            finishWithError(
              new Error(
                `ElevenLabs speech stream error: ${getErrorText(event)}`,
              ),
            );
            return;
          }

          if (typeof event.audio === 'string' && event.audio.length > 0) {
            const alignment = event.alignment ?? undefined;
            const normalizedAlignment = event.normalizedAlignment ?? undefined;
            controller.enqueue({
              type: 'audio',
              audio: event.audio,
              audioFormat,
              ...((alignment != null || normalizedAlignment != null) && {
                providerMetadata: {
                  elevenlabs: {
                    ...(alignment != null && {
                      alignment: alignment as JSONValue,
                    }),
                    ...(normalizedAlignment != null && {
                      normalizedAlignment: normalizedAlignment as JSONValue,
                    }),
                  },
                },
              }),
            });
          }

          if (event.isFinal === true) {
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

function isErrorMessage(event: ElevenLabsSpeechStreamEvent): boolean {
  return typeof event.message === 'string' && event.isFinal !== true;
}

function getErrorText(event: ElevenLabsSpeechStreamEvent): string {
  if (typeof event.message === 'string') return event.message;
  if (typeof event.error === 'string') return event.error;
  return JSON.stringify(event.error ?? event);
}
