import {
  InvalidArgumentError,
  type Experimental_SharedV4Session,
  type LanguageModelV4CallOptions,
  type LanguageModelV4GenerateResult,
  type LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import {
  connectToWebSocket,
  getWebSocketConstructor,
  normalizeHeaders,
  safeParseJSON,
  toWebSocketUrl,
  waitForWebSocketBufferDrain,
  type WebSocketConnection,
  type WebSocketConstructor,
  type WebSocketLike,
} from '@ai-sdk/provider-utils';
import { createGatewayErrorFromResponse, GatewayResponseError } from './errors';
import { VERCEL_AI_GATEWAY_TEAM_HEADER } from './gateway-headers';
import {
  GATEWAY_LANGUAGE_MODEL_SUBPROTOCOL,
  getGatewayLanguageModelProtocols,
} from './gateway-realtime-auth';

export const GATEWAY_LANGUAGE_MODEL_WEBSOCKET_SESSION_KEY =
  '@ai-sdk/gateway/language-model-websocket';

export const GATEWAY_LANGUAGE_MODEL_REQUEST_FRAME_TYPE =
  'language-model.request';

export const GATEWAY_LANGUAGE_MODEL_ERROR_FRAME_TYPE = 'language-model.error';

/**
 * Experimental `/v4/ai/language-model` WebSocket protocol:
 *
 * 1. The client sends one `language-model.request` frame at a time.
 * 2. A generate response is one serialized `LanguageModelV4GenerateResult`.
 * 3. A stream response is a sequence of serialized
 *    `LanguageModelV4StreamPart` frames ending in `finish`.
 * 4. Gateway request failures use `language-model.error`.
 * 5. Successful completion leaves the socket open for the next request.
 *
 * Authentication belongs to the WebSocket handshake subprotocols and is never
 * copied into a request frame.
 */
export type GatewayLanguageModelRequestBody = Omit<
  LanguageModelV4CallOptions,
  'abortSignal' | 'experimental_session'
>;

/**
 * The first frame for each request on the connection. `body` is the serialized
 * `LanguageModelV4CallOptions` body used by the HTTP route, and `headers`
 * contains the same routing and observability headers without credentials.
 */
export type GatewayLanguageModelRequestFrame = {
  type: typeof GATEWAY_LANGUAGE_MODEL_REQUEST_FRAME_TYPE;
  body: GatewayLanguageModelRequestBody;
  headers: Record<string, string>;
};

/**
 * A protocol-level failure from AI Gateway. Successful generate responses are
 * sent as a plain `LanguageModelV4GenerateResult`; streaming responses are
 * plain `LanguageModelV4StreamPart` frames.
 */
export type GatewayLanguageModelErrorFrame = {
  type: typeof GATEWAY_LANGUAGE_MODEL_ERROR_FRAME_TYPE;
  statusCode?: number;
  isRetryable?: boolean;
  body: unknown;
};

type ConnectionIdentity = {
  url: string;
  constructor: WebSocketConstructor;
  protocols: string[];
  headers: Record<string, string>;
};

type ActiveRequest = {
  mode: 'generate' | 'stream';
  settled: boolean;
  requestSent: boolean;
  authMethod: 'api-key' | 'oidc' | undefined;
  abortSignal: AbortSignal | undefined;
  abortListener: (() => void) | undefined;
  generate:
    | {
        resolve: (result: LanguageModelV4GenerateResult) => void;
        reject: (error: unknown) => void;
      }
    | undefined;
  controller:
    | ReadableStreamDefaultController<LanguageModelV4StreamPart>
    | undefined;
};

type RequestOptions = {
  url: string;
  webSocket: WebSocketConstructor | undefined;
  connectionHeaders: Record<string, string | undefined>;
  requestHeaders: Record<string, string | undefined>;
  body: GatewayLanguageModelRequestBody;
  abortSignal: AbortSignal | undefined;
  authMethod: 'api-key' | 'oidc' | undefined;
};

export function assertGatewayLanguageModelTransport({
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
        "AI Gateway transport 'websocket' requires an AI SDK session. Use it through generateText or streamText.",
    });
  }
}

export function getGatewayLanguageModelWebSocketSession(
  session: Experimental_SharedV4Session,
): GatewayLanguageModelWebSocketSession {
  return session.getOrSet(
    GATEWAY_LANGUAGE_MODEL_WEBSOCKET_SESSION_KEY,
    () => new GatewayLanguageModelWebSocketSession(),
    {
      onDestroy: state => state.close(),
    },
  );
}

export class GatewayLanguageModelWebSocketSession {
  private connection: WebSocketConnection | undefined;
  private socket: WebSocketLike | undefined;
  private openPromise: Promise<void> | undefined;
  private identity: ConnectionIdentity | undefined;
  private connectionGeneration = 0;
  private requestReserved = false;
  private activeRequest: ActiveRequest | undefined;

  async generate(
    options: RequestOptions,
  ): Promise<LanguageModelV4GenerateResult> {
    const request = await this.startRequest('generate', options);
    return request.generateResult;
  }

  async stream(
    options: RequestOptions,
  ): Promise<ReadableStream<LanguageModelV4StreamPart>> {
    const request = await this.startRequest('stream', options);
    return request.stream;
  }

  close(): void {
    this.failActiveRequest(
      new Error('AI Gateway language model WebSocket session was destroyed.'),
    );
    this.closeConnection();
  }

  private async startRequest(
    mode: 'generate',
    options: RequestOptions,
  ): Promise<{
    mode: 'generate';
    generateResult: Promise<LanguageModelV4GenerateResult>;
  }>;
  private async startRequest(
    mode: 'stream',
    options: RequestOptions,
  ): Promise<{
    mode: 'stream';
    stream: ReadableStream<LanguageModelV4StreamPart>;
  }>;
  private async startRequest(
    mode: 'generate' | 'stream',
    {
      url,
      webSocket,
      connectionHeaders,
      requestHeaders,
      body,
      abortSignal,
      authMethod,
    }: RequestOptions,
  ): Promise<
    | {
        mode: 'generate';
        generateResult: Promise<LanguageModelV4GenerateResult>;
      }
    | {
        mode: 'stream';
        stream: ReadableStream<LanguageModelV4StreamPart>;
      }
  > {
    if (this.requestReserved) {
      throw new InvalidArgumentError({
        argument: 'providerOptions.gateway.transport',
        message:
          'AI Gateway WebSocket transport permits only one in-flight language model request per session.',
      });
    }
    this.requestReserved = true;

    if (abortSignal?.aborted) {
      this.requestReserved = false;
      throw abortSignal.reason ?? new Error('The operation was aborted.');
    }

    let constructor: WebSocketConstructor;
    try {
      constructor = getWebSocketConstructor(webSocket);
    } catch (error) {
      this.requestReserved = false;
      throw new InvalidArgumentError({
        argument: 'providerOptions.gateway.transport',
        message:
          "AI Gateway transport 'websocket' requires a WebSocket implementation.",
        cause: error,
      });
    }

    const normalizedConnectionHeaders = normalizeHeaders(connectionHeaders);
    const identity: ConnectionIdentity = {
      url: toWebSocketUrl(url).toString(),
      constructor,
      protocols: getProtocolsFromHeaders(normalizedConnectionHeaders),
      headers: normalizedConnectionHeaders,
    };

    try {
      await this.ensureConnection(identity, abortSignal);
    } catch (error) {
      this.requestReserved = false;
      throw error;
    }

    let generateResolve:
      | ((result: LanguageModelV4GenerateResult) => void)
      | undefined;
    let generateReject: ((error: unknown) => void) | undefined;
    const generateResult =
      mode === 'generate'
        ? new Promise<LanguageModelV4GenerateResult>((resolve, reject) => {
            generateResolve = resolve;
            generateReject = reject;
          })
        : undefined;
    generateResult?.catch(() => {});

    let controller:
      | ReadableStreamDefaultController<LanguageModelV4StreamPart>
      | undefined;
    const stream =
      mode === 'stream'
        ? new ReadableStream<LanguageModelV4StreamPart>({
            start(value) {
              controller = value;
            },
            cancel: reason => {
              this.failActiveRequest(
                reason ??
                  new Error(
                    'AI Gateway language model WebSocket stream was cancelled.',
                  ),
              );
            },
          })
        : undefined;

    const activeRequest: ActiveRequest = {
      mode,
      settled: false,
      requestSent: false,
      authMethod,
      abortSignal,
      abortListener: undefined,
      generate:
        generateResolve != null && generateReject != null
          ? { resolve: generateResolve, reject: generateReject }
          : undefined,
      controller,
    };
    this.activeRequest = activeRequest;

    if (abortSignal != null) {
      activeRequest.abortListener = () => {
        this.failActiveRequest(
          abortSignal.reason ?? new Error('The operation was aborted.'),
        );
      };
      abortSignal.addEventListener('abort', activeRequest.abortListener, {
        once: true,
      });
    }

    if (abortSignal?.aborted) {
      const error =
        abortSignal.reason ?? new Error('The operation was aborted.');
      this.failActiveRequest(error);
      throw error;
    }

    const socket = this.socket;
    if (socket == null || socket.readyState !== 1) {
      const error = new Error(
        'AI Gateway language model WebSocket closed before the request was sent.',
      );
      this.failActiveRequest(error);
      throw error;
    }

    const frame: GatewayLanguageModelRequestFrame = {
      type: GATEWAY_LANGUAGE_MODEL_REQUEST_FRAME_TYPE,
      body,
      headers: removeAuthenticationHeaders(requestHeaders),
    };

    try {
      socket.send(JSON.stringify(frame));
      activeRequest.requestSent = true;
      await waitForWebSocketBufferDrain(socket, { abortSignal });

      if (
        socket.readyState !== 1 &&
        this.activeRequest === activeRequest &&
        !activeRequest.settled
      ) {
        throw new Error(
          'AI Gateway language model WebSocket closed while sending the request.',
        );
      }
    } catch (error) {
      throw this.failActiveRequest(error, {
        postSend: activeRequest.requestSent,
      });
    }

    return mode === 'generate'
      ? {
          mode,
          generateResult: generateResult!,
        }
      : {
          mode,
          stream: stream!,
        };
  }

  private async ensureConnection(
    identity: ConnectionIdentity,
    abortSignal: AbortSignal | undefined,
  ): Promise<void> {
    if (
      this.identity != null &&
      !connectionIdentitiesEqual(this.identity, identity)
    ) {
      this.closeConnection();
    }

    if (this.socket?.readyState === 1) {
      return;
    }

    if (this.openPromise != null) {
      await waitForOpenOrAbort(this.openPromise, abortSignal);
      return;
    }

    this.identity = identity;
    const generation = ++this.connectionGeneration;
    let opened = false;
    let resolveOpen!: () => void;
    let rejectOpen!: (error: unknown) => void;
    const openPromise = new Promise<void>((resolve, reject) => {
      resolveOpen = resolve;
      rejectOpen = reject;
    });
    openPromise.catch(() => {});
    this.openPromise = openPromise;

    const failConnection = (error: unknown) => {
      if (generation !== this.connectionGeneration) return;

      if (!opened) {
        rejectOpen(error);
      } else {
        this.failActiveRequest(error, {
          postSend: this.activeRequest?.requestSent === true,
        });
      }
      this.closeConnection();
    };

    const connection = connectToWebSocket({
      url: identity.url,
      protocols: identity.protocols,
      headers: identity.headers,
      webSocket: identity.constructor,
      onOpen: () => {
        if (generation !== this.connectionGeneration) return;
        opened = true;
        resolveOpen();
      },
      onMessageText: text => {
        if (generation !== this.connectionGeneration) return;
        return this.handleMessage(text);
      },
      onProcessingError: failConnection,
      onSocketError: () => {
        failConnection(
          new Error('Connection error on AI Gateway language model WebSocket.'),
        );
      },
      onClose: () => {
        failConnection(
          new Error('AI Gateway language model WebSocket closed unexpectedly.'),
        );
      },
    });

    if (generation === this.connectionGeneration) {
      this.connection = connection;
      this.socket = connection.socket;

      if (connection.socket?.readyState === 1) {
        opened = true;
        resolveOpen();
      }
    }

    try {
      await waitForOpenOrAbort(openPromise, abortSignal);
    } catch (error) {
      if (generation === this.connectionGeneration) {
        this.closeConnection();
      }
      throw error;
    } finally {
      if (
        generation === this.connectionGeneration &&
        this.socket?.readyState === 1
      ) {
        this.openPromise = undefined;
      }
    }
  }

  private async handleMessage(text: string): Promise<void> {
    const request = this.activeRequest;
    if (request == null) {
      throw new Error(
        'AI Gateway language model WebSocket received a frame without an active request.',
      );
    }

    const parsed = await safeParseJSON({ text });
    if (!parsed.success) {
      throw parsed.error;
    }

    const frame = asRecord(parsed.value);
    if (frame == null) {
      throw new Error(
        'AI Gateway language model WebSocket received a non-object frame.',
      );
    }

    if (frame.type === GATEWAY_LANGUAGE_MODEL_ERROR_FRAME_TYPE) {
      const errorFrame = frame as GatewayLanguageModelErrorFrame;
      const error = await createGatewayErrorFromResponse({
        response: errorFrame.body,
        statusCode:
          typeof errorFrame.statusCode === 'number'
            ? errorFrame.statusCode
            : 500,
        authMethod: request.authMethod,
        isRetryable:
          typeof errorFrame.isRetryable === 'boolean'
            ? errorFrame.isRetryable
            : undefined,
      });
      this.settleActiveRequestWithError(request, error);
      return;
    }

    if (request.mode === 'generate') {
      request.settled = true;
      request.generate?.resolve(
        frame as unknown as LanguageModelV4GenerateResult,
      );
      this.clearActiveRequest(request);
      return;
    }

    if (typeof frame.type !== 'string') {
      throw new Error(
        'AI Gateway language model WebSocket stream part is missing a type.',
      );
    }

    const part = frame as LanguageModelV4StreamPart;
    request.controller?.enqueue(part);

    if (part.type === 'finish') {
      request.settled = true;
      request.controller?.close();
      this.clearActiveRequest(request);
    }
  }

  private settleActiveRequestWithError(
    request: ActiveRequest,
    error: unknown,
  ): void {
    if (request.settled || this.activeRequest !== request) return;

    request.settled = true;
    request.generate?.reject(error);
    request.controller?.error(error);
    this.clearActiveRequest(request);
  }

  private failActiveRequest(
    error: unknown,
    { postSend = false }: { postSend?: boolean } = {},
  ): unknown {
    const request = this.activeRequest;
    if (request == null || request.settled) return error;

    const requestError = postSend
      ? new GatewayResponseError({
          message:
            'AI Gateway language model WebSocket failed after the request was sent.',
          statusCode: 500,
          cause: error,
          isRetryable: false,
        })
      : error;

    request.settled = true;
    request.generate?.reject(requestError);
    request.controller?.error(requestError);
    this.clearActiveRequest(request);
    this.closeConnection();
    return requestError;
  }

  private clearActiveRequest(request: ActiveRequest): void {
    if (request.abortListener != null) {
      request.abortSignal?.removeEventListener('abort', request.abortListener);
    }
    if (this.activeRequest === request) {
      this.activeRequest = undefined;
      this.requestReserved = false;
    }
  }

  private closeConnection(): void {
    const connection = this.connection;
    this.connection = undefined;
    this.socket = undefined;
    this.openPromise = undefined;
    this.identity = undefined;
    this.connectionGeneration++;
    connection?.close();
  }
}

function getProtocolsFromHeaders(headers: Record<string, string>): string[] {
  const authorization = headers.authorization;
  const token = authorization?.match(/^Bearer (.+)$/iu)?.[1];

  return token == null
    ? [GATEWAY_LANGUAGE_MODEL_SUBPROTOCOL]
    : getGatewayLanguageModelProtocols(token, {
        teamIdOrSlug: headers[VERCEL_AI_GATEWAY_TEAM_HEADER],
      });
}

function removeAuthenticationHeaders(
  headers: Record<string, string | undefined>,
): Record<string, string> {
  const normalized = normalizeHeaders(headers);
  delete normalized.authorization;
  delete normalized[VERCEL_AI_GATEWAY_TEAM_HEADER];
  return normalized;
}

function connectionIdentitiesEqual(
  left: ConnectionIdentity,
  right: ConnectionIdentity,
): boolean {
  return (
    left.url === right.url &&
    left.constructor === right.constructor &&
    arraysEqual(left.protocols, right.protocols) &&
    recordsEqual(left.headers, right.headers)
  );
}

function arraysEqual(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function recordsEqual(
  left: Record<string, string>,
  right: Record<string, string>,
): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();

  return (
    arraysEqual(leftKeys, rightKeys) &&
    leftKeys.every(key => left[key] === right[key])
  );
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function waitForOpenOrAbort(
  openPromise: Promise<void>,
  abortSignal: AbortSignal | undefined,
): Promise<void> {
  if (abortSignal == null) return openPromise;
  if (abortSignal.aborted) {
    return Promise.reject(
      abortSignal.reason ?? new Error('The operation was aborted.'),
    );
  }

  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      reject(abortSignal.reason ?? new Error('The operation was aborted.'));
    };
    abortSignal.addEventListener('abort', onAbort, { once: true });
    void openPromise.then(resolve, reject).finally(() => {
      abortSignal.removeEventListener('abort', onAbort);
    });
  });
}
