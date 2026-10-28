import type {
  Experimental_SpeechModelV4StreamOptions as SpeechModelV4StreamOptions,
  Experimental_SpeechModelV4StreamPart as SpeechModelV4StreamPart,
  Experimental_SpeechModelV4StreamResult as SpeechModelV4StreamResult,
  Experimental_SpeechModelV4StreamTextPart as SpeechModelV4StreamTextPart,
  Experimental_StreamingSpeechModelV4 as StreamingSpeechModelV4,
  SharedV4ProviderMetadata,
  SharedV4Warning,
  SpeechModelV4,
} from '@ai-sdk/provider';
import {
  lazySchema,
  zodSchema,
  combineHeaders,
  connectToWebSocket,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  getErrorMessage,
  experimental_parseSpeechStreamPart as parseSpeechStreamPart,
  postJsonToApi,
  resolve,
  EXPERIMENTAL_SPEECH_STREAM_START_FRAME_TYPE as SPEECH_STREAM_START_FRAME_TYPE,
  EXPERIMENTAL_SPEECH_STREAM_TEXT_DELTA_FRAME_TYPE as SPEECH_STREAM_TEXT_DELTA_FRAME_TYPE,
  EXPERIMENTAL_SPEECH_STREAM_TEXT_DONE_FRAME_TYPE as SPEECH_STREAM_TEXT_DONE_FRAME_TYPE,
  waitForWebSocketBufferDrain,
  type Experimental_SpeechStreamStartFrame,
  type Experimental_SpeechStreamTextDeltaFrame,
  type Resolvable,
  type WebSocketConnection,
  type WebSocketConstructor,
  type WebSocketLike,
} from '@ai-sdk/provider-utils';
import { z } from './zod';
import { asGatewayError } from './errors';
import { parseAuthMethod } from './errors/parse-auth-method';
import type { GatewayConfig } from './gateway-config';
import {
  GATEWAY_SPEECH_SUBPROTOCOL,
  getGatewaySpeechProtocols,
} from './gateway-realtime-auth';
import {
  createErrorFromServerErrorPart,
  errorControllerWithGatewayError,
} from './gateway-stream-errors';
import { getProtocolsFromHeaders } from './gateway-transcription-model';

export class GatewaySpeechModel
  implements SpeechModelV4, StreamingSpeechModelV4
{
  readonly specificationVersion = 'v4' as const;

  constructor(
    readonly modelId: string,
    private readonly config: GatewayConfig & {
      provider: string;
      o11yHeaders: Resolvable<Record<string, string>>;
      _internal?: {
        currentDate?: () => Date;
      };
    },
  ) {}

  get provider(): string {
    return this.config.provider;
  }

  async doGenerate({
    text,
    voice,
    outputFormat,
    instructions,
    speed,
    language,
    providerOptions,
    headers,
    abortSignal,
  }: Parameters<SpeechModelV4['doGenerate']>[0]): Promise<
    Awaited<ReturnType<SpeechModelV4['doGenerate']>>
  > {
    const resolvedHeaders = this.config.headers
      ? await resolve(this.config.headers)
      : undefined;
    try {
      const {
        responseHeaders,
        value: responseBody,
        rawValue,
      } = await postJsonToApi({
        url: this.getUrl(),
        headers: combineHeaders(
          resolvedHeaders,
          headers ?? {},
          this.getModelConfigHeaders(),
          await resolve(this.config.o11yHeaders),
        ),
        body: {
          text,
          ...(voice && { voice }),
          ...(outputFormat && { outputFormat }),
          ...(instructions && { instructions }),
          ...(speed != null && { speed }),
          ...(language && { language }),
          ...(providerOptions && { providerOptions }),
        },
        successfulResponseHandler: createJsonResponseHandler(
          gatewaySpeechResponseSchema,
        ),
        failedResponseHandler: createJsonErrorResponseHandler({
          errorSchema: z.any(),
          errorToMessage: data => getErrorMessage(data) ?? 'unknown error',
        }),
        ...(abortSignal && { abortSignal }),
        fetch: this.config.fetch,
      });

      return {
        audio: responseBody.audio,
        warnings: (responseBody.warnings ?? []) as Array<SharedV4Warning>,
        ...(responseBody.usage != null && { usage: responseBody.usage }),
        providerMetadata:
          responseBody.providerMetadata as SharedV4ProviderMetadata,
        response: {
          timestamp: new Date(),
          modelId: this.modelId,
          headers: responseHeaders,
          body: rawValue,
        },
      };
    } catch (error) {
      throw await asGatewayError(
        error,
        await parseAuthMethod(resolvedHeaders ?? {}),
      );
    }
  }

  async doStream(
    options: SpeechModelV4StreamOptions,
  ): Promise<SpeechModelV4StreamResult> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();

    const headers = combineHeaders(
      await resolve(this.config.headers ?? {}),
      options.headers ?? {},
      this.getModelConfigHeaders(),
      await resolve(this.config.o11yHeaders),
    );
    const authMethod = await parseAuthMethod(headers);

    // First frame after the WebSocket opens, per the speech-stream envelope.
    // Optional keys are omitted so the frame stays minimal.
    const startFrame: Experimental_SpeechStreamStartFrame = {
      type: SPEECH_STREAM_START_FRAME_TYPE,
      ...(options.voice != null && { voice: options.voice }),
      ...(options.outputFormat != null && {
        outputFormat: options.outputFormat,
      }),
      ...(options.instructions != null && {
        instructions: options.instructions,
      }),
      ...(options.speed != null && { speed: options.speed }),
      ...(options.language != null && { language: options.language }),
      ...(options.providerOptions != null && {
        providerOptions: options.providerOptions,
      }),
      ...(options.includeRawChunks != null && {
        includeRawChunks: options.includeRawChunks,
      }),
    };

    return {
      stream: createGatewaySpeechStream({
        webSocket: this.config.webSocket,
        url: toGatewaySpeechUrl(this.config.baseURL, this.modelId),
        protocols: getProtocolsFromHeaders(headers, {
          marker: GATEWAY_SPEECH_SUBPROTOCOL,
          getProtocols: getGatewaySpeechProtocols,
        }),
        headers,
        startFrame,
        text: options.text,
        abortSignal: options.abortSignal,
        authMethod,
      }),
      request: { body: startFrame },
      response: { timestamp: currentDate, modelId: this.modelId },
    };
  }

  private getUrl() {
    return `${this.config.baseURL}/speech-model`;
  }

  private getModelConfigHeaders() {
    return {
      'ai-speech-model-specification-version': '4',
      'ai-model-id': this.modelId,
    };
  }
}

/**
 * Gateway streaming speech WebSocket URL: HTTP(S) base upgraded to WS(S),
 * model id in `?ai-model-id=` (browser `WebSocket` cannot set headers).
 */
export function toGatewaySpeechUrl(baseURL: string, modelId: string): string {
  const url = new URL(`${baseURL.replace(/^http/, 'ws')}/speech-model`);
  url.searchParams.set('ai-model-id', modelId);
  return url.toString();
}

/**
 * Keeps text-delta frames under 64 KiB (envelope rule 7) even when JSON
 * escapes every code unit as `\uXXXX`.
 */
const MAX_TEXT_DELTA_CODE_UNITS = 8 * 1024;

/**
 * Splits a long text delta into pieces of at most `MAX_TEXT_DELTA_CODE_UNITS`
 * UTF-16 code units without separating a surrogate pair.
 */
export function splitTextDelta(delta: string): string[] {
  const pieces: string[] = [];
  let offset = 0;
  while (offset < delta.length) {
    let end = Math.min(offset + MAX_TEXT_DELTA_CODE_UNITS, delta.length);
    const lastCodeUnit = delta.charCodeAt(end - 1);
    if (
      end < delta.length &&
      lastCodeUnit >= 0xd800 &&
      lastCodeUnit <= 0xdbff
    ) {
      end--;
    }
    pieces.push(delta.slice(offset, end));
    offset = end;
  }
  return pieces;
}

function createGatewaySpeechStream({
  webSocket,
  url,
  protocols,
  headers,
  startFrame,
  text,
  abortSignal,
  authMethod,
}: {
  webSocket: WebSocketConstructor | undefined;
  url: string;
  protocols: string[];
  headers: Record<string, string | undefined>;
  startFrame: Experimental_SpeechStreamStartFrame;
  text: ReadableStream<SpeechModelV4StreamTextPart>;
  abortSignal: AbortSignal | undefined;
  authMethod: 'api-key' | 'oidc' | undefined;
}): ReadableStream<SpeechModelV4StreamPart> {
  let finished = false;
  let cleanup: (closeCode?: number) => void = () => {};

  return new ReadableStream<SpeechModelV4StreamPart>({
    start: controller => {
      let textReader:
        | ReadableStreamDefaultReader<SpeechModelV4StreamTextPart>
        | undefined;
      let hasServerErrorPart = false;
      let lastServerError: unknown;
      let textStopped = false;
      let connection: WebSocketConnection | undefined;

      const cancelText = () => {
        if (textReader != null) {
          void textReader.cancel().catch(() => {});
          textReader = undefined;
        } else {
          void text.cancel().catch(() => {});
        }
      };

      cleanup = (closeCode?: number) => {
        cancelText();
        connection?.close(closeCode);
      };

      const finishWithError = (error: unknown) => {
        if (finished) return;
        finished = true;
        cleanup();
        void errorControllerWithGatewayError(controller, error, authMethod);
      };

      const sendText = async (socket: WebSocketLike) => {
        const reader = text.getReader();
        textReader = reader;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done || finished || textStopped) break;
            let first = true;
            // An empty part still carries its voice or provider options.
            const pieces = splitTextDelta(value.text);
            if (
              pieces.length === 0 &&
              (value.voice != null || value.providerOptions != null)
            ) {
              pieces.push('');
            }
            for (const delta of pieces) {
              if (finished || textStopped) break;
              // The voice applies to every frame of the part; provider
              // options (e.g. a turn break) only to its first frame.
              const frame: Experimental_SpeechStreamTextDeltaFrame = {
                type: SPEECH_STREAM_TEXT_DELTA_FRAME_TYPE,
                delta,
                ...(value.voice != null && { voice: value.voice }),
                ...(first &&
                  value.providerOptions != null && {
                    providerOptions: value.providerOptions,
                  }),
              };
              first = false;
              socket.send(JSON.stringify(frame));
              await waitForWebSocketBufferDrain(socket);
            }
          }
        } finally {
          reader.releaseLock();
          if (textReader === reader) {
            textReader = undefined;
          }
        }
        if (!finished && !textStopped) {
          socket.send(
            JSON.stringify({ type: SPEECH_STREAM_TEXT_DONE_FRAME_TYPE }),
          );
        }
      };

      connection = connectToWebSocket({
        url,
        protocols,
        headers,
        webSocket,
        abortSignal,
        onAbort: reason => {
          if (finished) return;
          finished = true;
          cleanup();
          controller.error(reason);
        },
        onProcessingError: finishWithError,
        onOpen: socket => {
          socket.send(JSON.stringify(startFrame));
          void sendText(socket).catch(finishWithError);
        },
        onMessageText: async messageText => {
          if (finished) return;
          const part = parseSpeechStreamPart(messageText);
          if (part == null) return;
          if (part.type === 'finish') {
            finished = true;
            controller.enqueue(part);
            controller.close();
            cleanup(1000);
            return;
          }

          if (part.type === 'error') {
            // Error parts are terminal (envelope rule 5): stop sending text
            // and surface the server's message when the socket closes.
            hasServerErrorPart = true;
            lastServerError = part.error;
            textStopped = true;
            cancelText();
            part.error = await createErrorFromServerErrorPart(
              part.error,
              authMethod,
              'speech',
            );
            if (finished) return;
          }

          controller.enqueue(part);
        },
        onSocketError: () => {
          finishWithError(
            new Error('Connection error on AI Gateway speech stream'),
          );
        },
        onClose: ({ code, reason }) => {
          if (hasServerErrorPart) {
            if (finished) return;
            void createErrorFromServerErrorPart(
              lastServerError,
              authMethod,
              'speech',
            ).then(finishWithError);
            return;
          }
          finishWithError(
            new Error(
              'AI Gateway speech stream closed before a finish part was received' +
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

const providerMetadataEntrySchema = () => z.object({}).catchall(z.unknown());

const gatewaySpeechWarningSchema = () =>
  z.discriminatedUnion('type', [
    z.object({
      type: z.literal('unsupported'),
      feature: z.string(),
      details: z.string().optional(),
    }),
    z.object({
      type: z.literal('compatibility'),
      feature: z.string(),
      details: z.string().optional(),
    }),
    z.object({
      type: z.literal('deprecated'),
      setting: z.string(),
      message: z.string(),
    }),
    z.object({
      type: z.literal('other'),
      message: z.string(),
    }),
  ]);

const gatewaySpeechResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      audio: z.string(),
      warnings: z.array(gatewaySpeechWarningSchema()).optional(),
      usage: z.record(z.string(), z.json()).optional(),
      providerMetadata: z
        .record(z.string(), providerMetadataEntrySchema())
        .optional(),
    }),
  ),
);
