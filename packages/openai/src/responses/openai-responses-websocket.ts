import {
  APICallError,
  InvalidArgumentError,
  type Experimental_SharedV4Session,
} from '@ai-sdk/provider';
import type { WebSocket as NodeWebSocket } from 'node:http';
import {
  readWebSocketMessageText,
  removeUndefinedEntries,
  safeParseJSON,
  safeValidateTypes,
  toWebSocketUrl,
  waitForWebSocketBufferDrain,
  type InferSchema,
  type ParseResult,
  type WebSocketLike,
} from '@ai-sdk/provider-utils';
import {
  openaiResponsesChunkSchema,
  openaiResponsesResponseSchema,
  type OpenAIResponsesChunk,
  type OpenAIResponsesInput,
} from './openai-responses-api';

export const OPENAI_RESPONSES_WEBSOCKET_SESSION_KEY =
  '@ai-sdk/openai/responses-websocket';

type OpenAIResponsesResponse = InferSchema<
  typeof openaiResponsesResponseSchema
>;

type ConnectionIdentity = {
  url: string;
  constructor: typeof NodeWebSocket;
  headers: Record<string, string>;
};

type RequestState = {
  body: Record<string, unknown>;
  controller:
    | ReadableStreamDefaultController<ParseResult<OpenAIResponsesChunk>>
    | undefined;
  sent: boolean;
  terminal: {
    resolve: (value: OpenAIResponsesWebSocketTerminal) => void;
    reject: (error: unknown) => void;
  };
  abortSignal: AbortSignal | undefined;
  abortListener: (() => void) | undefined;
  settled: boolean;
};

export type OpenAIResponsesWebSocketTerminal = {
  type: 'response.completed' | 'response.incomplete';
  response: OpenAIResponsesResponse;
  rawFrame: unknown;
};

export type OpenAIResponsesWebSocketRequest = {
  stream: ReadableStream<ParseResult<OpenAIResponsesChunk>>;
  terminal: Promise<OpenAIResponsesWebSocketTerminal>;
  body: Record<string, unknown>;
};

export function assertOpenAIResponsesTransport({
  session,
  transport,
}: {
  session: Experimental_SharedV4Session | undefined;
  transport: 'http' | 'websocket';
}): void {
  if (transport === 'websocket' && session == null) {
    throw new InvalidArgumentError({
      argument: 'experimental_session',
      message:
        "OpenAI Responses transport 'websocket' requires an AI SDK session. Use it through generateText or streamText.",
    });
  }
}

export function getOpenAIResponsesWebSocketSession(
  session: Experimental_SharedV4Session,
): OpenAIResponsesWebSocketSession {
  return session.getOrSet(
    OPENAI_RESPONSES_WEBSOCKET_SESSION_KEY,
    () => new OpenAIResponsesWebSocketSession(),
    {
      onDestroy: state => state.close(),
    },
  );
}

export class OpenAIResponsesWebSocketSession {
  private socket: WebSocketLike | undefined;
  private openPromise: Promise<void> | undefined;
  private identity: ConnectionIdentity | undefined;

  // Event handlers capture the generation that created them. This prevents
  // late events from an old socket from affecting its replacement.
  private connectionGeneration = 0;

  // Reserve synchronously before opening the socket. `activeRequest` is only
  // available after the handshake, so it cannot prevent two callers from
  // racing through that first await on its own.
  private requestReserved = false;
  private activeRequest: RequestState | undefined;

  // Frame decoding can be asynchronous for Blob and binary messages. Chaining
  // it preserves the order in which the server delivered frames.
  private messageTail: Promise<void> = Promise.resolve();

  async request({
    url,
    headers,
    body,
    abortSignal,
    includeEvents = true,
  }: {
    url: string;
    headers: Record<string, string | undefined>;
    body: Record<string, unknown> & { input: OpenAIResponsesInput };
    abortSignal?: AbortSignal;
    includeEvents?: boolean;
  }): Promise<OpenAIResponsesWebSocketRequest> {
    // OpenAI permits only one in-flight response on a WebSocket connection.
    if (this.requestReserved) {
      throw new InvalidArgumentError({
        argument: 'providerOptions.openai.transport',
        message:
          'OpenAI Responses WebSocket permits only one in-flight response per session.',
      });
    }
    this.requestReserved = true;

    // TODO: support custom webSocket constructor instead of always using the runtime global WebSocket
    // Node's WebSocket extends the browser API with support for headers in the second argument
    // which is required to send authorization headers to the OpenAI API.
    const RuntimeWebSocket = globalThis.WebSocket as unknown as
      | typeof NodeWebSocket
      | undefined;

    if (RuntimeWebSocket == null) {
      this.requestReserved = false;
      throw new InvalidArgumentError({
        argument: 'providerOptions.openai.transport',
        message:
          "OpenAI Responses transport 'websocket' requires a runtime-global WebSocket implementation with handshake header support.",
      });
    }

    const nextIdentity: ConnectionIdentity = {
      url: toWebSocketUrl(url).toString(),
      constructor: RuntimeWebSocket,
      headers: normalizeHeaders(headers),
    };

    try {
      await this.ensureConnection(nextIdentity, abortSignal);
    } catch (error) {
      this.requestReserved = false;
      throw error;
    }

    const preparedBody = prepareWebSocketBody(body);

    // `doGenerate` waits for the complete terminal response, while `doStream`
    // consumes every protocol event. Expose both views over the same request.
    let terminalResolve!: (value: OpenAIResponsesWebSocketTerminal) => void;
    let terminalReject!: (error: unknown) => void;
    const terminal = new Promise<OpenAIResponsesWebSocketTerminal>(
      (resolve, reject) => {
        terminalResolve = resolve;
        terminalReject = reject;
      },
    );
    // A streaming consumer may not observe the terminal promise directly.
    // Keep a rejection from becoming an unhandled promise in that case.
    terminal.catch(() => {});

    let controller!: ReadableStreamDefaultController<
      ParseResult<OpenAIResponsesChunk>
    >;
    const stream = new ReadableStream<ParseResult<OpenAIResponsesChunk>>({
      start(value) {
        if (includeEvents) {
          controller = value;
        } else {
          // `doGenerate` only consumes the full terminal response. Closing its
          // unused event view avoids retaining every intermediate delta.
          value.close();
        }
      },
      cancel: reason => {
        // The protocol has no documented per-response cancel event. Closing
        // the socket is the only way to stop an active response safely.
        this.failActiveRequest(
          reason ?? new Error('OpenAI Responses WebSocket stream cancelled.'),
          true,
          true,
        );
      },
    });

    const request: RequestState = {
      body: preparedBody,
      controller: includeEvents ? controller : undefined,
      sent: false,
      terminal: { resolve: terminalResolve, reject: terminalReject },
      abortSignal,
      abortListener: undefined,
      settled: false,
    };
    this.activeRequest = request;

    if (abortSignal != null) {
      // Abort belongs to this response, not to the long-lived connection. The
      // listener is removed when the active request settles.
      request.abortListener = () => {
        this.failActiveRequest(
          abortSignal.reason ?? new Error('The operation was aborted.'),
          true,
          true,
        );
      };
      abortSignal.addEventListener('abort', request.abortListener, {
        once: true,
      });
    }

    if (abortSignal?.aborted) {
      const error =
        abortSignal.reason ?? new Error('The operation was aborted.');
      this.failActiveRequest(error, false, true);
      throw error;
    }

    const socket = this.socket;
    if (socket == null || socket.readyState !== 1) {
      const error = new Error(
        'OpenAI Responses WebSocket closed before the request was sent.',
      );
      this.failActiveRequest(error, false);
      throw error;
    }

    try {
      socket.send(
        JSON.stringify({
          type: 'response.create',
          ...preparedBody,
        }),
      );

      // From this point onward, OpenAI may have accepted the request. Failures
      // must be non-retryable because replaying it could create two responses.
      request.sent = true;
      await waitForWebSocketBufferDrain(socket, { abortSignal });
      if (socket.readyState !== 1 && !request.settled) {
        throw new Error(
          'OpenAI Responses WebSocket closed while sending the request.',
        );
      }
    } catch (error) {
      this.failActiveRequest(error, request.sent);
      throw request.sent
        ? createTransportError({
            message: 'OpenAI Responses WebSocket request failed after send.',
            url,
            body: preparedBody,
            cause: error,
          })
        : error;
    }

    return {
      stream,
      terminal,
      body: preparedBody,
    };
  }

  close(): void {
    // Session destruction owns final cleanup. Normal successful responses leave
    // the socket open so another call using the Session can reuse it.
    this.failActiveRequest(
      new Error('OpenAI Responses WebSocket session was destroyed.'),
      false,
    );
    this.closeSocket();
  }

  private async ensureConnection(
    nextIdentity: ConnectionIdentity,
    abortSignal: AbortSignal | undefined,
  ): Promise<void> {
    if (
      this.identity != null &&
      !connectionIdentitiesEqual(this.identity, nextIdentity)
    ) {
      // Never reuse a connection across endpoint, credential, or constructor
      // changes. In particular, this prevents headers from one call leaking
      // into a later call that shares the Session.
      this.closeSocket();
      this.identity = undefined;
    }

    if (this.socket?.readyState === 1) {
      return;
    }

    if (this.openPromise != null) {
      await waitForOpenOrAbort(this.openPromise, abortSignal);
      return;
    }

    this.identity = nextIdentity;
    this.connectionGeneration++;

    let socket: WebSocketLike;
    try {
      socket = new nextIdentity.constructor(nextIdentity.url, {
        headers: nextIdentity.headers,
      }) as unknown as WebSocketLike;
    } catch (error) {
      this.identity = undefined;
      throw error;
    }

    this.socket = socket;
    const connectionGeneration = this.connectionGeneration;
    this.openPromise = new Promise<void>((resolve, reject) => {
      // `settled` distinguishes a handshake failure from a failure on an
      // already-open connection.
      let settled = false;

      const resolveOpen = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      const rejectOpen = (error: unknown) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      };

      socket.onopen = resolveOpen;
      socket.onmessage = event => {
        if (
          this.socket !== socket ||
          this.connectionGeneration !== connectionGeneration
        ) {
          return;
        }

        const request = this.activeRequest;
        if (request == null) {
          // A frame without an active request means client and server state are
          // out of sync. Discard the connection instead of guessing its owner.
          this.closeSocket();
          return;
        }

        // Decode and handle one frame at a time. Without this chain, a Blob
        // frame could finish decoding after a later string frame.
        this.messageTail = this.messageTail
          .then(() => readWebSocketMessageText(event.data))
          .then(text => {
            if (
              this.socket === socket &&
              this.connectionGeneration === connectionGeneration &&
              this.activeRequest === request
            ) {
              return this.handleMessage(text, request);
            }
          })
          .catch(error => {
            if (
              this.socket === socket &&
              this.connectionGeneration === connectionGeneration &&
              this.activeRequest === request
            ) {
              this.failActiveRequest(error, true);
            }
          });
      };
      socket.onerror = () => {
        const error = new Error('OpenAI Responses WebSocket error.');
        rejectOpen(error);

        // Once open, connection errors belong to the active response rather
        // than the handshake promise.
        if (
          settled &&
          this.socket === socket &&
          this.connectionGeneration === connectionGeneration
        ) {
          this.failActiveRequest(error, true);
        }
      };
      socket.onclose = () => {
        const error = new Error('OpenAI Responses WebSocket closed.');
        rejectOpen(error);
        if (
          settled &&
          this.socket === socket &&
          this.connectionGeneration === connectionGeneration
        ) {
          this.failActiveRequest(error, true);
        }
        if (this.socket === socket) {
          this.socket = undefined;
          this.openPromise = undefined;
        }
      };

      if (socket.readyState === 1) {
        // Some implementations can become open between construction and event
        // handler registration.
        resolveOpen();
      }
    });

    try {
      await waitForOpenOrAbort(this.openPromise, abortSignal);
    } catch (error) {
      this.closeSocket();
      throw error;
    } finally {
      if (this.socket?.readyState === 1) {
        this.openPromise = undefined;
      }
    }
  }

  private async handleMessage(
    text: string,
    request: RequestState,
  ): Promise<void> {
    const parsed = await safeParseJSON({ text });
    if (!parsed.success) {
      this.failActiveRequest(parsed.error, true);
      return;
    }

    const value = parsed.value;
    const record = asRecord(value);
    const type = record?.type;

    if (type === 'response.completed' || type === 'response.incomplete') {
      // The chunk schema intentionally keeps only fields used by streaming.
      // Validate the full terminal response separately for `doGenerate` and
      // response metadata/body parity with HTTP.
      const terminalResponse = await safeValidateTypes({
        value: record?.response,
        schema: openaiResponsesResponseSchema,
      });
      if (!terminalResponse.success) {
        this.failActiveRequest(terminalResponse.error, true);
        return;
      }

      const chunk = await safeValidateTypes({
        value,
        schema: openaiResponsesChunkSchema,
      });

      // Streaming callers still need to observe the terminal event before the
      // request is released for reuse.
      request.controller?.enqueue(chunk);
      request.settled = true;
      request.controller?.close();
      request.terminal.resolve({
        type,
        response: terminalResponse.value,
        rawFrame: value,
      });
      this.clearActiveRequest(request);
      return;
    }

    const chunk = await safeValidateTypes({
      value,
      schema: openaiResponsesChunkSchema,
    });
    request.controller?.enqueue(chunk);

    if (type === 'error' || type === 'response.failed' || !chunk.success) {
      // Error events are part of the stream protocol, so enqueue the parsed
      // result for the existing mapper and reject the terminal view as well.
      request.settled = true;
      request.controller?.close();
      request.terminal.reject(
        createOpenAIResponsesWebSocketError({
          frame: value,
          url: this.identity?.url ?? '',
          body: request.body,
        }),
      );
      this.clearActiveRequest(request);
      this.closeSocket();
    }
  }

  private failActiveRequest(
    error: unknown,
    afterSend: boolean,
    preserveError = false,
  ): void {
    const request = this.activeRequest;
    if (request == null || request.settled) {
      return;
    }

    request.settled = true;
    if (afterSend && request.sent) {
      // A post-send transport failure is ambiguous: the server may already be
      // generating a response. Mark it non-retryable to prevent implicit replay.
      const finalError = preserveError
        ? error
        : APICallError.isInstance(error)
          ? error
          : createTransportError({
              message: 'OpenAI Responses WebSocket transport failed.',
              url: this.identity?.url ?? '',
              body: request.body,
              cause: error,
            });
      request.controller?.error(finalError);
      request.terminal.reject(finalError);
    } else {
      request.controller?.error(error);
      request.terminal.reject(error);
    }

    // Any active-request failure makes the physical connection unsafe to reuse.
    // A later explicit call can still open a fresh socket and send full input.
    this.clearActiveRequest(request);
    this.closeSocket();
  }

  private clearActiveRequest(request: RequestState): void {
    if (request.abortListener != null) {
      request.abortSignal?.removeEventListener('abort', request.abortListener);
    }
    if (this.activeRequest === request) {
      // Only the current request may release the reservation. Late callbacks
      // from an older request must not unlock a newer one.
      this.activeRequest = undefined;
      this.requestReserved = false;
    }
  }

  private closeSocket(): void {
    const socket = this.socket;

    // Detach first so close/error callbacks from this socket are recognized as
    // stale and cannot fail a replacement connection.
    this.socket = undefined;
    this.openPromise = undefined;
    if (socket != null && socket.readyState < 2) {
      try {
        socket.close();
      } catch {
        // Closing an already-failed socket is best effort.
      }
    }
  }
}

export function createOpenAIResponsesWebSocketError({
  frame,
  url,
  body,
}: {
  frame: unknown;
  url: string;
  body: unknown;
}): APICallError {
  const value = asRecord(frame);

  // WebSocket errors exist in nested transport and flat Responses forms.
  // `response.failed` places the error one level deeper under `response`.
  const nestedError = asRecord(value?.error);
  const failedResponse = asRecord(value?.response);
  const failedError = asRecord(failedResponse?.error);
  const error = nestedError ?? failedError ?? value;
  const message =
    typeof error?.message === 'string'
      ? error.message
      : 'OpenAI Responses WebSocket request failed.';
  const status =
    typeof value?.status === 'number'
      ? value.status
      : typeof error?.status === 'number'
        ? error.status
        : undefined;

  return new APICallError({
    message,
    url: url.replace(/^ws/, 'http'),
    requestBodyValues: body,
    statusCode: status,
    responseBody: JSON.stringify(frame),
    data: frame,
    isRetryable: false,
  });
}

function prepareWebSocketBody(
  body: Record<string, unknown>,
): Record<string, unknown> {
  // Streaming is implicit in WebSocket mode, and OpenAI does not accept these
  // HTTP-only fields in `response.create`.
  const {
    stream: _stream,
    stream_options: _streamOptions,
    background: _background,
    ...webSocketBody
  } = body;
  return webSocketBody;
}

function normalizeHeaders(
  headers: Record<string, string | undefined>,
): Record<string, string> {
  // Header names are case-insensitive. Normalize both construction and
  // identity comparison, and remove optional values before the handshake.
  const normalized: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(headers)) {
    normalized[name.toLowerCase()] = value;
  }
  return removeUndefinedEntries(normalized);
}

function connectionIdentitiesEqual(
  left: ConnectionIdentity,
  right: ConnectionIdentity,
): boolean {
  if (
    left.url !== right.url ||
    !Object.is(left.constructor, right.constructor)
  ) {
    return false;
  }

  const leftHeaders = Object.entries(left.headers).sort(
    ([leftName], [rightName]) => leftName.localeCompare(rightName),
  );
  const rightHeaders = Object.entries(right.headers).sort(
    ([leftName], [rightName]) => leftName.localeCompare(rightName),
  );

  return (
    leftHeaders.length === rightHeaders.length &&
    leftHeaders.every(
      ([name, value], index) =>
        name === rightHeaders[index][0] && value === rightHeaders[index][1],
    )
  );
}

function createTransportError({
  message,
  url,
  body,
  cause,
}: {
  message: string;
  url: string;
  body: unknown;
  cause: unknown;
}): APICallError {
  return new APICallError({
    message,
    url: url.replace(/^ws/, 'http'),
    requestBodyValues: body,
    cause,
    isRetryable: false,
  });
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value != null
    ? (value as Record<string, unknown>)
    : undefined;
}

async function waitForOpenOrAbort(
  openPromise: Promise<void>,
  abortSignal: AbortSignal | undefined,
): Promise<void> {
  if (abortSignal == null) {
    return openPromise;
  }
  if (abortSignal.aborted) {
    throw abortSignal.reason ?? new Error('The operation was aborted.');
  }

  let abortListener: (() => void) | undefined;

  // Race only this wait. The long-lived socket must not retain a call-specific
  // abort listener after the handshake has completed.
  const abortPromise = new Promise<never>((_, reject) => {
    abortListener = () =>
      reject(abortSignal.reason ?? new Error('The operation was aborted.'));
    abortSignal.addEventListener('abort', abortListener, { once: true });
  });

  try {
    await Promise.race([openPromise, abortPromise]);
  } finally {
    if (abortListener != null) {
      abortSignal.removeEventListener('abort', abortListener);
    }
  }
}
