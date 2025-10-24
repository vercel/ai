import { Resolvable, resolve } from '@ai-sdk/provider-utils';
import { ChatTransport } from './chat-transport';
import { UIMessage } from './ui-messages';
import { UIMessageChunk } from '../ui-message-stream/ui-message-chunks';

export type WebSocketFactory = (url: string, protocols?: string[]) => WebSocket;

export type PrepareSendMessagesRequest<UI_MESSAGE extends UIMessage> = (
  options: {
    id: string;
    messages: UI_MESSAGE[];
    requestMetadata: unknown;
    body: Record<string, any> | undefined;
    headers: Record<string, string> | Headers | undefined;
  } & {
    trigger: 'submit-message' | 'regenerate-message';
    messageId: string | undefined;
  },
) =>
  | {
      body?: object;
      headers?: Record<string, string> | Headers;
      /** Optional URL override. */
      url?: string;
    }
  | PromiseLike<{
      body?: object;
      headers?: Record<string, string> | Headers;
      url?: string;
    }>;

export type PrepareReconnectToStreamRequest = (options: {
  id: string;
  requestMetadata: unknown;
  body: Record<string, any> | undefined;
  headers: Record<string, string> | Headers | undefined;
}) =>
  | {
      headers?: Record<string, string> | Headers;
      /** Optional URL override. */
      url?: string;
    }
  | PromiseLike<{
      headers?: Record<string, string> | Headers;
      url?: string;
    }>;

export type WebSocketChatTransportInitOptions<UI_MESSAGE extends UIMessage> = {
  /** WebSocket endpoint URL (e.g., wss://example.com/api/chat). */
  url: string;

  /** Optional WebSocket subprotocols. */
  protocols?: string[];

  /** Optional query params to append to the URL. */
  params?: Resolvable<Record<string, string>>;

  /** Optional headers to be included in outbound WS messages. */
  headers?: Resolvable<Record<string, string> | Headers>;

  /** Optional extra body to include in outbound WS messages. */
  body?: Resolvable<object>;

  /** Custom WebSocket factory for testing or alternative runtimes. */
  makeWebSocket?: WebSocketFactory;

  /** Transform the outbound send request. */
  prepareSendMessagesRequest?: PrepareSendMessagesRequest<UI_MESSAGE>;

  /** Transform the outbound resume request. */
  prepareReconnectToStreamRequest?: PrepareReconnectToStreamRequest;

  /** Automatically reconnect when socket closes. Default false. */
  autoReconnect?: boolean;
};

type InboundEnvelope =
  | { type: 'chunk'; requestId: string; chunk: UIMessageChunk }
  | { type: 'end'; requestId: string }
  | { type: 'error'; requestId: string; errorText?: string }
  | { type: 'no-active'; requestId: string };

export class WebSocketChatTransport<UI_MESSAGE extends UIMessage>
  implements ChatTransport<UI_MESSAGE>
{
  private url: string;
  private protocols?: string[];
  private params?: WebSocketChatTransportInitOptions<UI_MESSAGE>['params'];
  private headers?: WebSocketChatTransportInitOptions<UI_MESSAGE>['headers'];
  private body?: WebSocketChatTransportInitOptions<UI_MESSAGE>['body'];
  private makeWebSocket?: WebSocketFactory;
  private prepareSendMessagesRequest?: PrepareSendMessagesRequest<UI_MESSAGE>;
  private prepareReconnectToStreamRequest?: PrepareReconnectToStreamRequest;
  private autoReconnect: boolean;

  private ws: WebSocket | undefined;
  private connectionPromise: Promise<void> | undefined;
  private messageHandlers: Map<string, (msg: InboundEnvelope) => void> =
    new Map();

  private static requestCounter = 0;

  constructor(options: WebSocketChatTransportInitOptions<UI_MESSAGE>) {
    this.url = options.url;
    this.protocols = options.protocols;
    this.params = options.params;
    this.headers = options.headers;
    this.body = options.body;
    this.makeWebSocket = options.makeWebSocket;
    this.prepareSendMessagesRequest = options.prepareSendMessagesRequest;
    this.prepareReconnectToStreamRequest =
      options.prepareReconnectToStreamRequest;
    this.autoReconnect = options.autoReconnect ?? false;
  }

  private async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === this.ws.OPEN) {
      return;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise(
      async (resolvePromise, rejectPromise) => {
        try {
          const resolvedParams = await resolve(this.params);
          const urlWithParams = this.buildUrlWithParams(resolvedParams);
          const factory: WebSocketFactory =
            this.makeWebSocket ?? ((u, p) => new WebSocket(u, p));

          const ws = factory(urlWithParams, this.protocols);
          this.ws = ws;

          ws.onopen = () => {
            resolvePromise();
          };

          ws.onmessage = evt => {
            try {
              const data =
                typeof evt.data === 'string' ? evt.data : '' + evt.data;
              const parsed = JSON.parse(data) as
                | InboundEnvelope
                | UIMessageChunk;

              // Support both envelope and raw chunk (assumed single active request).
              if ('type' in parsed && (parsed as any).requestId) {
                const handler = this.messageHandlers.get(
                  (parsed as InboundEnvelope).requestId,
                );
                handler?.(parsed as InboundEnvelope);
              } else if ('type' in parsed) {
                // If raw chunk is received and only one handler exists, forward to it
                const [[, handler]] = Array.from(
                  this.messageHandlers.entries(),
                );
                handler?.({
                  type: 'chunk',
                  requestId: '',
                  chunk: parsed as UIMessageChunk,
                });
              }
            } catch (err) {
              // ignore malformed JSON to avoid breaking all streams
            }
          };

          ws.onclose = () => {
            this.connectionPromise = undefined;
            this.ws = undefined;
            if (this.autoReconnect) {
              // best-effort reconnect; do not block
              this.connect().catch(() => {});
            }
          };

          ws.onerror = error => {
            rejectPromise(new Error(`WebSocket connection error: ${error}`));
          };
        } catch (err) {
          rejectPromise(err as Error);
        }
      },
    );

    return this.connectionPromise;
  }

  private buildUrlWithParams(
    params: Record<string, string> | undefined,
  ): string {
    if (!params || Object.keys(params).length === 0) return this.url;
    const u = new URL(
      this.url,
      typeof location !== 'undefined' ? location.href : undefined,
    );
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return u.toString();
  }

  private nextRequestId(): string {
    return `ws_${Date.now().toString(36)}_${WebSocketChatTransport.requestCounter++}`;
  }

  async sendMessages({
    abortSignal,
    ...options
  }: Parameters<ChatTransport<UI_MESSAGE>['sendMessages']>[0]) {
    const [resolvedHeaders, resolvedBody] = await Promise.all([
      resolve(this.headers),
      resolve(this.body),
    ]);

    const prepared = await this.prepareSendMessagesRequest?.({
      id: options.chatId,
      messages: options.messages,
      body: { ...resolvedBody, ...options.body },
      headers: { ...(resolvedHeaders as any), ...options.headers },
      requestMetadata: options.metadata,
      trigger: options.trigger,
      messageId: options.messageId,
    });

    const headers =
      prepared?.headers !== undefined
        ? prepared.headers
        : { ...(resolvedHeaders as any), ...options.headers };
    const body =
      prepared?.body !== undefined
        ? prepared.body
        : {
            ...resolvedBody,
            ...options.body,
            id: options.chatId,
            messages: options.messages,
            trigger: options.trigger,
            messageId: options.messageId,
          };
    const url = prepared?.url ?? this.url;

    await this.connect();
    if (!this.ws) throw new Error('WebSocket is not connected.');

    const requestId = this.nextRequestId();

    return new ReadableStream<UIMessageChunk>({
      start: controller => {
        const handler = (msg: InboundEnvelope) => {
          if (msg.requestId !== requestId && msg.requestId !== '') return;
          switch (msg.type) {
            case 'chunk':
              controller.enqueue(msg.chunk);
              break;
            case 'end':
              controller.close();
              this.messageHandlers.delete(requestId);
              break;
            case 'no-active':
              // treat as end with no chunks
              controller.close();
              this.messageHandlers.delete(requestId);
              break;
            case 'error':
              controller.error(
                new Error(msg.errorText ?? 'WebSocket stream error'),
              );
              this.messageHandlers.delete(requestId);
              break;
          }
        };

        this.messageHandlers.set(requestId, handler);

        const outbound = {
          type: 'send' as const,
          requestId,
          url,
          id: options.chatId,
          trigger: options.trigger,
          messageId: options.messageId,
          messages: options.messages,
          headers:
            headers instanceof Headers
              ? Object.fromEntries(headers.entries())
              : headers,
          body,
          metadata: options.metadata,
        };

        this.ws!.send(JSON.stringify(outbound));

        if (abortSignal) {
          const onAbort = () => {
            try {
              this.ws?.send(JSON.stringify({ type: 'abort', requestId }));
            } finally {
              controller.close();
              this.messageHandlers.delete(requestId);
            }
          };
          if (abortSignal.aborted) onAbort();
          abortSignal.addEventListener('abort', onAbort, { once: true });
        }
      },
      cancel: () => {
        try {
          this.ws?.send(JSON.stringify({ type: 'abort', requestId }));
        } finally {
          this.messageHandlers.delete(requestId);
        }
      },
    });
  }

  async reconnectToStream(
    options: Parameters<ChatTransport<UI_MESSAGE>['reconnectToStream']>[0],
  ): Promise<ReadableStream<UIMessageChunk> | null> {
    const [resolvedHeaders, resolvedBody] = await Promise.all([
      resolve(this.headers),
      resolve(this.body),
    ]);

    const prepared = await this.prepareReconnectToStreamRequest?.({
      id: options.chatId,
      body: { ...resolvedBody, ...options.body },
      headers: { ...(resolvedHeaders as any), ...options.headers },
      requestMetadata: options.metadata,
    });

    const headers =
      prepared?.headers !== undefined
        ? prepared.headers
        : { ...(resolvedHeaders as any), ...options.headers };
    const url = prepared?.url ?? this.url;

    await this.connect();
    if (!this.ws) throw new Error('WebSocket is not connected.');

    const requestId = this.nextRequestId();

    let resolved:
      | ((value: ReadableStream<UIMessageChunk> | null) => void)
      | undefined;
    let rejected: ((reason?: any) => void) | undefined;

    const outerPromise = new Promise<ReadableStream<UIMessageChunk> | null>(
      (res, rej) => {
        resolved = res;
        rejected = rej;
      },
    );

    // We resolve to null on first no-active; otherwise we return a stream when first chunk arrives
    let streamResolved = false;
    const outStream = new ReadableStream<UIMessageChunk>({
      start: controller => {
        const handler = (msg: InboundEnvelope) => {
          if (msg.requestId !== requestId && msg.requestId !== '') return;
          switch (msg.type) {
            case 'no-active':
              if (!streamResolved) {
                streamResolved = true;
                this.messageHandlers.delete(requestId);
                resolved?.(null);
              }
              break;
            case 'chunk':
              if (!streamResolved) {
                streamResolved = true;
                resolved?.(outStream);
              }
              controller.enqueue(msg.chunk);
              break;
            case 'end':
              controller.close();
              this.messageHandlers.delete(requestId);
              break;
            case 'error':
              controller.error(
                new Error(msg.errorText ?? 'WebSocket stream error'),
              );
              this.messageHandlers.delete(requestId);
              if (!streamResolved) {
                rejected?.(
                  new Error(msg.errorText ?? 'WebSocket stream error'),
                );
              }
              break;
          }
        };

        this.messageHandlers.set(requestId, handler);

        const outbound = {
          type: 'resume' as const,
          requestId,
          url,
          id: options.chatId,
          headers:
            headers instanceof Headers
              ? Object.fromEntries(headers.entries())
              : headers,
          body: { ...resolvedBody, ...options.body },
          metadata: options.metadata,
        };

        this.ws!.send(JSON.stringify(outbound));
      },
      cancel: () => {
        try {
          this.ws?.send(JSON.stringify({ type: 'abort', requestId }));
        } finally {
          this.messageHandlers.delete(requestId);
        }
      },
    });

    return outerPromise;
  }
}
