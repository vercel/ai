import { APICallError } from '@ai-sdk/provider';
import { loadApiKey } from '@ai-sdk/provider-utils';
import {
  GradiumClient,
  GradiumAPIError,
  GradiumWebSocketError,
  type ServerMessage,
  type WebSocketLike,
} from '@gradium/sdk';
import type { GradiumConfig } from './gradium-config';

/** Each call owns its sockets so cancellation never affects another call. */
class RequestClient extends GradiumClient {
  private sockets: WebSocketLike[] = [];
  private disposed = false;

  async connect(route: string): Promise<WebSocketLike> {
    const socket = await super.connect(route);
    if (this.disposed) {
      socket.close();
      throw new DOMException('The operation was aborted.', 'AbortError');
    }
    this.sockets.push(socket);
    return socket;
  }

  // The protocol's end_of_stream completes the request even if the server
  // keeps the connection open. Returning also runs the SDK's socket cleanup.
  async *stream<T>(
    route: string,
    setup: Record<string, unknown>,
    input: Iterable<T> | AsyncIterable<T>,
    mapInput?: (item: T) => Record<string, unknown> | null,
  ): AsyncGenerator<ServerMessage> {
    for await (const message of super.stream(route, setup, input, mapInput)) {
      if (message.type === 'end_of_stream') return;
      yield message;
    }
  }

  dispose() {
    this.disposed = true;
    for (const socket of this.sockets) socket.close();
    this.sockets = [];
  }
}

export async function callGradium<T>(
  config: GradiumConfig,
  route: string,
  setup: unknown,
  signal: AbortSignal | undefined,
  call: (client: GradiumClient) => Promise<T>,
): Promise<T> {
  signal?.throwIfAborted();
  const client = new RequestClient({
    baseUrl: config.baseURL,
    apiKey:
      config.apiKey?.() ??
      loadApiKey({
        apiKey: undefined,
        environmentVariableName: 'GRADIUM_API_KEY',
        description: 'Gradium',
      }),
    token: config.token?.(),
    fetch: config.fetch,
    webSocketFactory: config.webSocketFactory,
    ttsRoute: config.ttsRoute,
    sttRoute: config.sttRoute,
  });
  let onAbort: (() => void) | undefined;
  try {
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => {
        reject(
          signal?.reason ??
            new DOMException('The operation was aborted.', 'AbortError'),
        );
        client.dispose();
      };
      signal?.addEventListener('abort', onAbort, { once: true });
    });
    return await Promise.race([call(client), aborted]);
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    if (
      error instanceof GradiumAPIError ||
      error instanceof GradiumWebSocketError
    ) {
      throw new APICallError({
        message: error.message,
        url: client.wsUrl(route),
        requestBodyValues: setup,
        statusCode: error instanceof GradiumAPIError ? error.status : undefined,
        isRetryable:
          error instanceof GradiumAPIError
            ? error.status === 429 || error.status >= 500
            : error.code === undefined ||
              error.code === 1006 ||
              error.code === 1011,
        cause: error,
      });
    }
    throw error;
  } finally {
    if (onAbort) signal?.removeEventListener('abort', onAbort);
    client.dispose();
  }
}
