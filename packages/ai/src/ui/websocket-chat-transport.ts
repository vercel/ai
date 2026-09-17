import {
  generateId,
  getWebSocketConstructor,
  normalizeHeaders,
  readWebSocketMessageText,
  resolve,
  safeParseJSON,
  safeValidateTypes,
  toWebSocketUrl,
  waitForWebSocketBufferDrain,
  type Resolvable,
  type WebSocketConstructor,
  type WebSocketLike,
} from '@ai-sdk/provider-utils';
import {
  uiMessageChunkSchema,
  type UIMessageChunk,
} from '../ui-message-stream/ui-message-chunks';
import type { ChatTransport } from './chat-transport';
import type { UIMessage } from './ui-messages';

export type WebSocketChatTransportSendRequest<
  UI_MESSAGE extends UIMessage = UIMessage,
> = {
  type: 'send';
  requestId: string;
  id: string;
  trigger: 'submit-message' | 'regenerate-message';
  messageId: string | undefined;
  messages: UI_MESSAGE[];
  headers: Record<string, string>;
  body: object;
  metadata: unknown;
};

export type WebSocketChatTransportResumeRequest = {
  type: 'resume';
  requestId: string;
  id: string;
  headers: Record<string, string>;
  body: object;
  metadata: unknown;
};

export type WebSocketChatTransportAbortRequest = {
  type: 'abort';
  requestId: string;
};

/**
 * A client-to-server frame used by `WebSocketChatTransport`.
 */
export type WebSocketChatTransportRequest<
  UI_MESSAGE extends UIMessage = UIMessage,
> =
  | WebSocketChatTransportSendRequest<UI_MESSAGE>
  | WebSocketChatTransportResumeRequest
  | WebSocketChatTransportAbortRequest;

/**
 * A server-to-client frame used by `WebSocketChatTransport`.
 */
export type WebSocketChatTransportResponse =
  | { type: 'start'; requestId: string }
  | { type: 'chunk'; requestId: string; chunk: UIMessageChunk }
  | { type: 'end'; requestId: string }
  | { type: 'error'; requestId: string; errorText?: string }
  | { type: 'no-active'; requestId: string };

export type PrepareWebSocketChatTransportSendMessagesRequest<
  UI_MESSAGE extends UIMessage,
> = (options: {
  id: string;
  messages: UI_MESSAGE[];
  requestMetadata: unknown;
  body: object;
  headers: Record<string, string>;
  trigger: 'submit-message' | 'regenerate-message';
  messageId: string | undefined;
}) =>
  | {
      messages?: UI_MESSAGE[];
      body?: object;
      headers?: HeadersInit;
    }
  | PromiseLike<{
      messages?: UI_MESSAGE[];
      body?: object;
      headers?: HeadersInit;
    }>;

export type PrepareWebSocketChatTransportReconnectToStreamRequest = (options: {
  id: string;
  requestMetadata: unknown;
  body: object;
  headers: Record<string, string>;
}) =>
  | {
      body?: object;
      headers?: HeadersInit;
    }
  | PromiseLike<{
      body?: object;
      headers?: HeadersInit;
    }>;

/**
 * Options for `WebSocketChatTransport`.
 */
export type WebSocketChatTransportInitOptions<UI_MESSAGE extends UIMessage> = {
  /**
   * WebSocket endpoint URL. HTTP(S) URLs are converted to WS(S), and relative
   * URLs are resolved against the current browser location.
   */
  url: string;

  /**
   * Optional WebSocket subprotocols used during the connection handshake.
   */
  protocols?: string | string[];

  /**
   * Query parameters appended when a new connection is opened.
   */
  params?: Resolvable<Record<string, string>>;

  /**
   * Headers included in each application-level request frame.
   *
   * Browser WebSocket APIs cannot set handshake headers. Use cookies, query
   * parameters, or subprotocols for handshake authentication.
   */
  headers?: Resolvable<Record<string, string> | Headers>;

  /**
   * Extra application data included in each send and resume request.
   */
  body?: Resolvable<object>;

  /**
   * Custom WebSocket implementation, for example the `ws` package in Node.js.
   */
  webSocket?: WebSocketConstructor;

  /**
   * Customizes send request frames before they are transmitted.
   */
  prepareSendMessagesRequest?: PrepareWebSocketChatTransportSendMessagesRequest<UI_MESSAGE>;

  /**
   * Customizes resume request frames before they are transmitted.
   */
  prepareReconnectToStreamRequest?: PrepareWebSocketChatTransportReconnectToStreamRequest;
};

type ConnectionState = {
  promise: Promise<WebSocketLike>;
  resolve: (socket: WebSocketLike) => void;
  reject: (error: Error) => void;
  socket?: WebSocketLike;
  settled: boolean;
};

type ActiveRequest = {
  requestId: string;
  kind: 'send' | 'resume';
  stream: ReadableStream<UIMessageChunk>;
  controller: ReadableStreamDefaultController<UIMessageChunk>;
  responseSettled: boolean;
  resolveResponse?: (stream: ReadableStream<UIMessageChunk> | null) => void;
  rejectResponse?: (error: Error) => void;
  abortSignal?: AbortSignal;
  abortListener?: () => void;
};

const WEBSOCKET_OPEN_STATE = 1;

function createAbortError(signal?: AbortSignal): Error {
  const reason = signal?.reason;
  if (reason instanceof Error) {
    return reason;
  }

  const error = new Error('The WebSocket chat request was aborted.');
  error.name = 'AbortError';
  return error;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * A `ChatTransport` that multiplexes correlated UI message streams over one
 * persistent WebSocket connection.
 *
 * The server must implement the protocol represented by
 * `WebSocketChatTransportRequest` and `WebSocketChatTransportResponse`.
 */
export class WebSocketChatTransport<
  UI_MESSAGE extends UIMessage,
> implements ChatTransport<UI_MESSAGE> {
  private readonly url: string;
  private readonly protocols?: string | string[];
  private readonly params?: Resolvable<Record<string, string>>;
  private readonly headers?: Resolvable<Record<string, string> | Headers>;
  private readonly body?: Resolvable<object>;
  private readonly webSocket?: WebSocketConstructor;
  private readonly prepareSendMessagesRequest?: PrepareWebSocketChatTransportSendMessagesRequest<UI_MESSAGE>;
  private readonly prepareReconnectToStreamRequest?: PrepareWebSocketChatTransportReconnectToStreamRequest;

  private connection?: ConnectionState;
  private readonly activeRequests = new Map<string, ActiveRequest>();

  constructor(options: WebSocketChatTransportInitOptions<UI_MESSAGE>) {
    this.url = options.url;
    this.protocols = options.protocols;
    this.params = options.params;
    this.headers = options.headers;
    this.body = options.body;
    this.webSocket = options.webSocket;
    this.prepareSendMessagesRequest = options.prepareSendMessagesRequest;
    this.prepareReconnectToStreamRequest =
      options.prepareReconnectToStreamRequest;
  }

  async sendMessages({
    abortSignal,
    ...options
  }: Parameters<ChatTransport<UI_MESSAGE>['sendMessages']>[0]): Promise<
    ReadableStream<UIMessageChunk>
  > {
    this.throwIfAborted(abortSignal);

    const [resolvedHeaders, resolvedBody] = await Promise.all([
      resolve(this.headers),
      resolve(this.body),
    ]);
    this.throwIfAborted(abortSignal);

    const headers = {
      ...normalizeHeaders(resolvedHeaders),
      ...normalizeHeaders(options.headers),
    };
    const body = { ...resolvedBody, ...options.body };

    const preparedRequest = await this.prepareSendMessagesRequest?.({
      id: options.chatId,
      messages: options.messages,
      requestMetadata: options.metadata,
      body,
      headers,
      trigger: options.trigger,
      messageId: options.messageId,
    });
    this.throwIfAborted(abortSignal);

    const socket = await this.getSocket(abortSignal);
    const requestId = generateId();
    const request = this.createActiveRequest({
      requestId,
      kind: 'send',
      abortSignal,
    });

    const frame: WebSocketChatTransportSendRequest<UI_MESSAGE> = {
      type: 'send',
      requestId,
      id: options.chatId,
      trigger: options.trigger,
      messageId: options.messageId,
      messages: preparedRequest?.messages ?? options.messages,
      headers:
        preparedRequest?.headers == null
          ? headers
          : normalizeHeaders(preparedRequest.headers),
      body: preparedRequest?.body ?? body,
      metadata: options.metadata,
    };

    try {
      await this.sendFrame(socket, frame, abortSignal);
      return request.stream;
    } catch (error) {
      const requestError = asError(error);
      this.failRequest(request, requestError);
      throw requestError;
    }
  }

  async reconnectToStream(
    options: Parameters<ChatTransport<UI_MESSAGE>['reconnectToStream']>[0],
  ): Promise<ReadableStream<UIMessageChunk> | null> {
    this.throwIfAborted(options.abortSignal);

    const [resolvedHeaders, resolvedBody] = await Promise.all([
      resolve(this.headers),
      resolve(this.body),
    ]);
    this.throwIfAborted(options.abortSignal);

    const headers = {
      ...normalizeHeaders(resolvedHeaders),
      ...normalizeHeaders(options.headers),
    };
    const body = { ...resolvedBody, ...options.body };

    const preparedRequest = await this.prepareReconnectToStreamRequest?.({
      id: options.chatId,
      requestMetadata: options.metadata,
      body,
      headers,
    });
    this.throwIfAborted(options.abortSignal);

    const socket = await this.getSocket(options.abortSignal);
    const requestId = generateId();

    let resolveResponse:
      | ((stream: ReadableStream<UIMessageChunk> | null) => void)
      | undefined;
    let rejectResponse: ((error: Error) => void) | undefined;
    const responsePromise = new Promise<ReadableStream<UIMessageChunk> | null>(
      (resolve, reject) => {
        resolveResponse = resolve;
        rejectResponse = reject;
      },
    );
    // The request can be aborted between registration and transmission. Mark
    // the promise as handled immediately while preserving its rejection for
    // the caller that receives it below.
    void responsePromise.catch(() => {});

    const request = this.createActiveRequest({
      requestId,
      kind: 'resume',
      abortSignal: options.abortSignal,
      resolveResponse,
      rejectResponse,
    });

    const frame: WebSocketChatTransportResumeRequest = {
      type: 'resume',
      requestId,
      id: options.chatId,
      headers:
        preparedRequest?.headers == null
          ? headers
          : normalizeHeaders(preparedRequest.headers),
      body: preparedRequest?.body ?? body,
      metadata: options.metadata,
    };

    try {
      await this.sendFrame(socket, frame, options.abortSignal);
    } catch (error) {
      const requestError = asError(error);
      request.responseSettled = true;
      this.failRequest(request, requestError);
      throw requestError;
    }

    return responsePromise;
  }

  /**
   * Closes the current connection and errors any active response streams.
   * A later request opens a new connection.
   */
  close(): void {
    const error = new Error('WebSocket chat transport was closed.');
    const connection = this.connection;
    this.connection = undefined;
    this.failAllRequests(error);

    if (connection != null) {
      this.rejectConnection(connection, error);
      try {
        connection.socket?.close(1000, 'Client closed transport');
      } catch {
        // The socket may already be closed.
      }
    }
  }

  private throwIfAborted(abortSignal: AbortSignal | undefined): void {
    if (abortSignal?.aborted) {
      throw createAbortError(abortSignal);
    }
  }

  private async getSocket(
    abortSignal: AbortSignal | undefined,
  ): Promise<WebSocketLike> {
    const existingSocket = this.connection?.socket;
    if (existingSocket?.readyState === WEBSOCKET_OPEN_STATE) {
      return existingSocket;
    }

    if (this.connection == null) {
      let resolveConnection!: (socket: WebSocketLike) => void;
      let rejectConnection!: (error: Error) => void;
      const promise = new Promise<WebSocketLike>((resolve, reject) => {
        resolveConnection = resolve;
        rejectConnection = reject;
      });

      const connection: ConnectionState = {
        promise,
        resolve: resolveConnection,
        reject: rejectConnection,
        settled: false,
      };
      this.connection = connection;
      void this.initializeConnection(connection);
    }

    const connection = this.connection;
    if (connection == null) {
      throw new Error('Failed to initialize WebSocket connection.');
    }

    return this.waitForConnection(connection.promise, abortSignal);
  }

  private async initializeConnection(
    connection: ConnectionState,
  ): Promise<void> {
    try {
      const params = await resolve(this.params);
      if (this.connection !== connection) {
        return;
      }

      const url = this.buildUrl(params);
      const WebSocketConstructor = getWebSocketConstructor(this.webSocket);
      const socket = new WebSocketConstructor(url, this.protocols);
      connection.socket = socket;

      let messageTail: Promise<void> = Promise.resolve();

      socket.onopen = () => {
        if (this.connection !== connection) {
          return;
        }
        this.resolveConnection(connection, socket);
      };

      socket.onmessage = event => {
        messageTail = messageTail
          .then(() => readWebSocketMessageText(event.data))
          .then(text => this.handleResponseFrame(connection, text))
          .catch(error => {
            this.terminateConnection(connection, asError(error));
          });
      };

      socket.onerror = () => {
        this.terminateConnection(
          connection,
          new TypeError('WebSocket chat network connection failed.'),
        );
      };

      socket.onclose = event => {
        messageTail = messageTail
          .then(() => {
            if (this.connection !== connection) {
              return;
            }

            const closeEvent = event as
              | { code?: unknown; reason?: unknown }
              | null
              | undefined;
            const code =
              typeof closeEvent?.code === 'number'
                ? closeEvent.code
                : undefined;
            const reason =
              typeof closeEvent?.reason === 'string' && closeEvent.reason !== ''
                ? `: ${closeEvent.reason}`
                : '';

            this.terminateConnection(
              connection,
              new TypeError(
                `WebSocket chat network connection closed${
                  code == null ? '' : ` (code ${code}${reason})`
                }.`,
              ),
              false,
            );
          })
          .catch(error => {
            this.terminateConnection(connection, asError(error));
          });
      };
    } catch (error) {
      this.terminateConnection(connection, asError(error), false);
    }
  }

  private buildUrl(params: Record<string, string> | undefined): URL {
    let url: URL;
    try {
      const baseUrl =
        typeof globalThis.location === 'undefined'
          ? undefined
          : globalThis.location.href;
      url = new URL(this.url, baseUrl);
      url = toWebSocketUrl(url);
    } catch {
      throw new Error(
        'Invalid WebSocket chat URL. Use an absolute URL outside the browser.',
      );
    }

    if (!['ws:', 'wss:'].includes(url.protocol) || url.hostname === '') {
      throw new Error('Invalid WebSocket chat URL. Expected ws:// or wss://.');
    }
    if (url.hash !== '') {
      throw new Error('Invalid WebSocket chat URL. Fragments are not allowed.');
    }

    for (const [key, value] of Object.entries(params ?? {})) {
      url.searchParams.set(key, value);
    }

    return url;
  }

  private waitForConnection(
    promise: Promise<WebSocketLike>,
    abortSignal: AbortSignal | undefined,
  ): Promise<WebSocketLike> {
    if (abortSignal == null) {
      return promise;
    }
    if (abortSignal.aborted) {
      return Promise.reject(createAbortError(abortSignal));
    }

    return new Promise<WebSocketLike>((resolve, reject) => {
      const onAbort = () => {
        reject(createAbortError(abortSignal));
      };
      abortSignal.addEventListener('abort', onAbort, { once: true });

      void promise.then(
        socket => {
          abortSignal.removeEventListener('abort', onAbort);
          resolve(socket);
        },
        error => {
          abortSignal.removeEventListener('abort', onAbort);
          reject(error);
        },
      );
    });
  }

  private resolveConnection(
    connection: ConnectionState,
    socket: WebSocketLike,
  ): void {
    if (connection.settled) {
      return;
    }
    connection.settled = true;
    connection.resolve(socket);
  }

  private rejectConnection(connection: ConnectionState, error: Error): void {
    if (connection.settled) {
      return;
    }
    connection.settled = true;
    connection.reject(error);
  }

  private terminateConnection(
    connection: ConnectionState,
    error: Error,
    closeSocket = true,
  ): void {
    if (this.connection !== connection) {
      return;
    }

    this.connection = undefined;
    this.rejectConnection(connection, error);
    this.failAllRequests(error);

    if (closeSocket) {
      try {
        connection.socket?.close(1011, 'WebSocket chat transport error');
      } catch {
        // The socket may already be closed.
      }
    }
  }

  private createActiveRequest({
    requestId,
    kind,
    abortSignal,
    resolveResponse,
    rejectResponse,
  }: {
    requestId: string;
    kind: ActiveRequest['kind'];
    abortSignal: AbortSignal | undefined;
    resolveResponse?: ActiveRequest['resolveResponse'];
    rejectResponse?: ActiveRequest['rejectResponse'];
  }): ActiveRequest {
    let controller!: ReadableStreamDefaultController<UIMessageChunk>;
    const stream = new ReadableStream<UIMessageChunk>({
      start(streamController) {
        controller = streamController;
      },
      cancel: () => {
        this.abortRequest(requestId, false);
      },
    });

    const request: ActiveRequest = {
      requestId,
      kind,
      stream,
      controller,
      responseSettled: false,
      resolveResponse,
      rejectResponse,
      abortSignal,
    };
    this.activeRequests.set(requestId, request);

    if (abortSignal != null) {
      const abortListener = () => {
        this.abortRequest(requestId, true);
      };
      request.abortListener = abortListener;
      abortSignal.addEventListener('abort', abortListener, { once: true });
      if (abortSignal.aborted) {
        abortListener();
      }
    }

    return request;
  }

  private abortRequest(requestId: string, closeStream: boolean): void {
    const request = this.activeRequests.get(requestId);
    if (request == null) {
      return;
    }

    const error = createAbortError(request.abortSignal);
    if (request.kind === 'resume' && !request.responseSettled) {
      request.responseSettled = true;
      request.rejectResponse?.(error);
    }

    this.cleanupRequest(request);
    if (closeStream) {
      try {
        request.controller.close();
      } catch {
        // The stream may already be closed or canceled.
      }
    }

    const socket = this.connection?.socket;
    if (socket?.readyState === WEBSOCKET_OPEN_STATE) {
      void this.sendFrame(socket, {
        type: 'abort',
        requestId,
      } satisfies WebSocketChatTransportAbortRequest).catch(() => {
        // Aborting is best-effort once the local stream has been closed.
      });
    }
  }

  private cleanupRequest(request: ActiveRequest): void {
    this.activeRequests.delete(request.requestId);
    if (request.abortListener != null) {
      request.abortSignal?.removeEventListener('abort', request.abortListener);
      request.abortListener = undefined;
    }
  }

  private failRequest(request: ActiveRequest, error: Error): void {
    if (!this.activeRequests.has(request.requestId)) {
      return;
    }

    if (request.kind === 'resume' && !request.responseSettled) {
      request.responseSettled = true;
      request.rejectResponse?.(error);
    }
    this.cleanupRequest(request);
    try {
      request.controller.error(error);
    } catch {
      // The stream may already be closed or canceled.
    }
  }

  private failAllRequests(error: Error): void {
    for (const request of [...this.activeRequests.values()]) {
      this.failRequest(request, error);
    }
  }

  private resolveResumeStream(request: ActiveRequest): void {
    if (request.kind !== 'resume' || request.responseSettled) {
      return;
    }
    request.responseSettled = true;
    request.resolveResponse?.(request.stream);
  }

  private async handleResponseFrame(
    connection: ConnectionState,
    text: string,
  ): Promise<void> {
    if (this.connection !== connection) {
      return;
    }

    const parsed = await safeParseJSON({ text });
    if (!parsed.success || !isRecord(parsed.value)) {
      throw new Error('Invalid WebSocket chat response frame.');
    }

    const type = parsed.value.type;
    const requestId = parsed.value.requestId;
    if (typeof type !== 'string' || typeof requestId !== 'string') {
      throw new Error('Invalid WebSocket chat response frame.');
    }

    const request = this.activeRequests.get(requestId);
    if (request == null) {
      return;
    }

    switch (type) {
      case 'start': {
        this.resolveResumeStream(request);
        return;
      }

      case 'chunk': {
        const chunk = await safeValidateTypes<UIMessageChunk>({
          value: parsed.value.chunk,
          schema: uiMessageChunkSchema,
        });
        if (!chunk.success) {
          throw new Error('Invalid UI message chunk in WebSocket response.');
        }
        this.resolveResumeStream(request);
        request.controller.enqueue(chunk.value);
        return;
      }

      case 'end': {
        this.resolveResumeStream(request);
        this.cleanupRequest(request);
        request.controller.close();
        return;
      }

      case 'no-active': {
        if (request.kind === 'resume' && !request.responseSettled) {
          request.responseSettled = true;
          request.resolveResponse?.(null);
        }
        this.cleanupRequest(request);
        request.controller.close();
        return;
      }

      case 'error': {
        if (
          parsed.value.errorText != null &&
          typeof parsed.value.errorText !== 'string'
        ) {
          throw new Error('Invalid WebSocket chat error response.');
        }
        this.failRequest(
          request,
          new Error(
            parsed.value.errorText ??
              'WebSocket chat server returned an error.',
          ),
        );
        return;
      }

      default:
        throw new Error(`Unknown WebSocket chat response type: ${type}.`);
    }
  }

  private async sendFrame(
    socket: WebSocketLike,
    frame: WebSocketChatTransportRequest<UI_MESSAGE>,
    abortSignal?: AbortSignal,
  ): Promise<void> {
    await waitForWebSocketBufferDrain(socket, { abortSignal });
    this.throwIfAborted(abortSignal);

    if (
      this.connection?.socket !== socket ||
      socket.readyState !== WEBSOCKET_OPEN_STATE
    ) {
      throw new TypeError('WebSocket chat network connection is not open.');
    }

    socket.send(JSON.stringify(frame));
  }
}
