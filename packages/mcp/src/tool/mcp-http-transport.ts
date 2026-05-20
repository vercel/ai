import {
  EventSourceParserStream,
  withUserAgentSuffix,
  getRuntimeEnvironmentUserAgent,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { MCPClientError } from '../error/mcp-client-error';
import {
  JSONRPCMessageSchema,
  parseJSONRPCMessage,
  type JSONRPCMessage,
} from './json-rpc-message';
import type { MCPTransport } from './mcp-transport';
import { VERSION } from '../version';
import {
  extractResourceMetadataUrl,
  UnauthorizedError,
  auth,
  type AuthResult,
  type OAuthClientProvider,
} from './oauth';
import { LATEST_PROTOCOL_VERSION } from './types';

const authorizationPromises = new WeakMap<
  OAuthClientProvider,
  Map<string, Promise<AuthResult>>
>();

function authorizationKey(serverUrl: URL, resourceMetadataUrl?: URL): string {
  return resourceMetadataUrl?.href ?? serverUrl.href;
}

/**
 * HTTP MCP transport implementing the Streamable HTTP style.
 *
 * Client transport for Streamable HTTP: this implements the MCP Streamable HTTP transport specification.
 * It will connect to a server using HTTP POST for sending messages and HTTP GET with Server-Sent Events
 * for receiving messages.
 */
export class HttpMCPTransport implements MCPTransport {
  private url: URL;
  private abortController?: AbortController;
  private headers?: Record<string, string>;
  private authProvider?: OAuthClientProvider;
  private resourceMetadataUrl?: URL;
  private sessionId?: string;
  private inboundSseConnection?: { close: () => void };
  private inboundSsePromise?: Promise<void>;
  private inboundSseUnavailable = false;
  private inboundSseForcedRetryPending = false;
  private redirectMode: RequestRedirect;
  private fetchFn: FetchFunction;

  // Inbound SSE resumption and reconnection state
  private lastInboundEventId?: string;
  private inboundReconnectAttempts = 0;
  private readonly reconnectionOptions = {
    initialReconnectionDelay: 1000,
    maxReconnectionDelay: 30000,
    reconnectionDelayGrowFactor: 1.5,
    maxRetries: 2,
  } as const;

  onclose?: () => void;
  onerror?: (error: unknown) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  protocolVersion?: string;

  constructor({
    url,
    headers,
    authProvider,
    redirect = 'error',
    fetch: fetchFn,
  }: {
    url: string;
    headers?: Record<string, string>;
    authProvider?: OAuthClientProvider;
    redirect?: 'follow' | 'error';
    fetch?: FetchFunction;
  }) {
    this.url = new URL(url);
    this.headers = headers;
    this.authProvider = authProvider;
    this.redirectMode = redirect;
    this.fetchFn = fetchFn ?? globalThis.fetch;
  }

  private async commonHeaders(
    base: Record<string, string>,
  ): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      ...this.headers,
      ...base,
      'mcp-protocol-version': this.protocolVersion ?? LATEST_PROTOCOL_VERSION,
    };

    if (this.sessionId) {
      headers['mcp-session-id'] = this.sessionId;
    }

    if (this.authProvider) {
      const tokens = await this.authProvider.tokens();
      if (tokens?.access_token) {
        headers['Authorization'] = `Bearer ${tokens.access_token}`;
      }
    }

    return withUserAgentSuffix(
      headers,
      `ai-sdk/${VERSION}`,
      getRuntimeEnvironmentUserAgent(),
    );
  }

  async start(): Promise<void> {
    if (this.abortController) {
      throw new MCPClientError({
        message:
          'MCP HTTP Transport Error: Transport already started. Note: client.connect() calls start() automatically.',
      });
    }
    this.inboundSseConnection = undefined;
    this.inboundSsePromise = undefined;
    this.inboundSseUnavailable = false;
    this.inboundSseForcedRetryPending = false;
    this.lastInboundEventId = undefined;
    this.inboundReconnectAttempts = 0;
    this.abortController = new AbortController();
  }

  async close(): Promise<void> {
    this.inboundSseConnection?.close();
    this.inboundSseConnection = undefined;
    this.inboundSseForcedRetryPending = false;
    try {
      if (
        this.sessionId &&
        this.abortController &&
        !this.abortController.signal.aborted
      ) {
        const headers = await this.commonHeaders({});
        await this.fetchFn(this.url.href, {
          method: 'DELETE',
          headers,
          signal: this.abortController.signal,
          redirect: this.redirectMode,
        }).catch(() => undefined);
      }
    } catch {}

    this.abortController?.abort();
    this.onclose?.();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    const attempt = async (triedAuth: boolean = false): Promise<void> => {
      try {
        const headers = await this.commonHeaders({
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        });

        const init = {
          method: 'POST',
          headers,
          body: JSON.stringify(message),
          signal: this.abortController?.signal,
          redirect: this.redirectMode,
        } satisfies RequestInit;

        const response = await this.fetchFn(this.url.href, init);

        const sessionId = response.headers.get('mcp-session-id');
        if (sessionId) {
          this.sessionId = sessionId;
        }

        if (response.status === 401 && this.authProvider && !triedAuth) {
          const resourceMetadataUrl = extractResourceMetadataUrl(response);
          this.resourceMetadataUrl = resourceMetadataUrl;
          try {
            const result = await this.authorize(resourceMetadataUrl);
            if (result !== 'AUTHORIZED') {
              const error = new UnauthorizedError();
              throw error;
            }
          } catch (error) {
            this.onerror?.(error);
            throw error;
          }
          return attempt(true);
        }

        // If server accepted the message (e.g. initialized notification), optionally (re)start inbound SSE
        if (response.status === 202) {
          // If inbound SSE was not available earlier (e.g. 405 before init), try again now
          // Do not await to avoid blocking send()
          if (!this.inboundSseConnection) {
            this.openInboundSseIfNeeded({ force: true });
          }
          return;
        }

        if (!response.ok) {
          const text = await response.text().catch(() => null);
          let errorMessage = `MCP HTTP Transport Error: POSTing to endpoint (HTTP ${response.status}): ${text}`;

          // 404 since this is a GET request which the server does not support
          if (response.status === 404) {
            errorMessage +=
              '. This server does not support HTTP transport. Try using `sse` transport instead';
          }

          const error = new MCPClientError({
            message: errorMessage,
          });
          this.onerror?.(error);
          throw error;
        }

        // Notifications (messages without 'id') don't expect a JSON-RPC response
        // Some servers return 200 with acknowledgment JSON instead of 202
        const isNotification = !('id' in message);
        if (isNotification) {
          this.openInboundSseIfNeeded();
          return;
        }

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await response.json();
          const messages: JSONRPCMessage[] = Array.isArray(data)
            ? data.map((m: unknown) => JSONRPCMessageSchema.parse(m))
            : [JSONRPCMessageSchema.parse(data)];
          for (const m of messages) this.onmessage?.(m);
          this.openInboundSseIfNeeded();
          return;
        }

        if (contentType.includes('text/event-stream')) {
          if (!response.body) {
            const error = new MCPClientError({
              message:
                'MCP HTTP Transport Error: text/event-stream response without body',
            });
            this.onerror?.(error);
            throw error;
          }

          const stream = response.body
            .pipeThrough(new TextDecoderStream())
            .pipeThrough(new EventSourceParserStream());
          const reader = stream.getReader();

          const processEvents = async () => {
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) return;
                const { event, data } = value;
                if (event === 'message') {
                  try {
                    const msg = await parseJSONRPCMessage(data);
                    this.onmessage?.(msg);
                  } catch (error) {
                    const e = new MCPClientError({
                      message:
                        'MCP HTTP Transport Error: Failed to parse message',
                      cause: error,
                    });
                    this.onerror?.(e);
                  }
                }
              }
            } catch (error) {
              if (error instanceof Error && error.name === 'AbortError') {
                return;
              }
              this.onerror?.(error);
            }
          };

          processEvents();
          this.openInboundSseIfNeeded();
          return;
        }

        const error = new MCPClientError({
          message: `MCP HTTP Transport Error: Unexpected content type: ${contentType}`,
        });
        this.onerror?.(error);
        throw error;
      } catch (error) {
        this.onerror?.(error);
        throw error;
      }
    };

    await attempt();
  }

  private getNextReconnectionDelay(attempt: number): number {
    const {
      initialReconnectionDelay,
      reconnectionDelayGrowFactor,
      maxReconnectionDelay,
    } = this.reconnectionOptions;
    return Math.min(
      initialReconnectionDelay * Math.pow(reconnectionDelayGrowFactor, attempt),
      maxReconnectionDelay,
    );
  }

  private scheduleInboundSseReconnection(): void {
    const { maxRetries } = this.reconnectionOptions;
    if (maxRetries > 0 && this.inboundReconnectAttempts >= maxRetries) {
      this.onerror?.(
        new MCPClientError({
          message: `MCP HTTP Transport Error: Maximum reconnection attempts (${maxRetries}) exceeded.`,
        }),
      );
      return;
    }

    const delay = this.getNextReconnectionDelay(this.inboundReconnectAttempts);
    this.inboundReconnectAttempts += 1;
    setTimeout(async () => {
      if (this.abortController?.signal.aborted) return;
      await this.openInboundSse(false, this.lastInboundEventId);
    }, delay);
  }

  private async authorize(resourceMetadataUrl?: URL): Promise<AuthResult> {
    const authProvider = this.authProvider;
    if (!authProvider) {
      return 'REDIRECT';
    }

    const key = authorizationKey(this.url, resourceMetadataUrl);
    let providerPromises = authorizationPromises.get(authProvider);
    if (!providerPromises) {
      providerPromises = new Map();
      authorizationPromises.set(authProvider, providerPromises);
    }

    let authorizationPromise = providerPromises.get(key);
    if (!authorizationPromise) {
      authorizationPromise = auth(authProvider, {
        serverUrl: this.url,
        resourceMetadataUrl,
        fetchFn: this.fetchFn,
      }).finally(() => {
        providerPromises.delete(key);
        if (providerPromises.size === 0) {
          authorizationPromises.delete(authProvider);
        }
      });
      providerPromises.set(key, authorizationPromise);
    }

    return authorizationPromise;
  }

  private openInboundSseIfNeeded({ force = false } = {}): void {
    if (force) {
      this.inboundSseUnavailable = false;
    } else if (this.inboundSseUnavailable) {
      return;
    }

    if (this.inboundSseConnection) {
      return;
    }

    if (this.inboundSsePromise) {
      if (force) {
        this.inboundSseForcedRetryPending = true;
      }
      return;
    }

    this.inboundSsePromise = this.openInboundSse().finally(() => {
      this.inboundSsePromise = undefined;
      const shouldRetry =
        this.inboundSseForcedRetryPending && !this.inboundSseConnection;
      this.inboundSseForcedRetryPending = false;
      if (shouldRetry) {
        this.openInboundSseIfNeeded({ force: true });
      }
    });
    void this.inboundSsePromise;
  }

  // Open optional inbound SSE stream; best-effort and resumable
  private async openInboundSse(
    triedAuth: boolean = false,
    resumeToken?: string,
  ): Promise<void> {
    try {
      const headers = await this.commonHeaders({
        Accept: 'text/event-stream',
      });
      if (resumeToken) {
        headers['last-event-id'] = resumeToken;
      }

      const response = await this.fetchFn(this.url.href, {
        method: 'GET',
        headers,
        signal: this.abortController?.signal,
        redirect: this.redirectMode,
      });

      const sessionId = response.headers.get('mcp-session-id');
      if (sessionId) {
        this.sessionId = sessionId;
      }

      if (response.status === 401 && this.authProvider && !triedAuth) {
        const resourceMetadataUrl = extractResourceMetadataUrl(response);
        this.resourceMetadataUrl = resourceMetadataUrl;
        try {
          const result = await this.authorize(resourceMetadataUrl);
          if (result !== 'AUTHORIZED') {
            const error = new UnauthorizedError();
            this.onerror?.(error);
            return;
          }
        } catch (error) {
          this.onerror?.(error);
          return;
        }
        return this.openInboundSse(true, resumeToken);
      }

      if (response.status === 405) {
        this.inboundSseUnavailable = true;
        return;
      }

      if (!response.ok || !response.body) {
        const error = new MCPClientError({
          message: `MCP HTTP Transport Error: GET SSE failed: ${response.status} ${response.statusText}`,
        });
        this.onerror?.(error);
        return;
      }

      const stream = response.body
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(new EventSourceParserStream());
      const reader = stream.getReader();

      const processEvents = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) return;
            const { event, data, id } = value as {
              event?: string;
              data: string;
              id?: string;
            };

            if (id) {
              this.lastInboundEventId = id;
            }

            if (event === 'message') {
              try {
                const msg = await parseJSONRPCMessage(data);
                this.onmessage?.(msg);
              } catch (error) {
                const e = new MCPClientError({
                  message: 'MCP HTTP Transport Error: Failed to parse message',
                  cause: error,
                });
                this.onerror?.(e);
              }
            }
          }
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            return;
          }
          this.onerror?.(error);
          if (!this.abortController?.signal.aborted) {
            this.scheduleInboundSseReconnection();
          }
        }
      };

      this.inboundSseConnection = {
        close: () => reader.cancel(),
      };
      this.inboundSseUnavailable = false;
      this.inboundReconnectAttempts = 0;
      processEvents();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      this.onerror?.(error);
      if (!this.abortController?.signal.aborted) {
        this.scheduleInboundSseReconnection();
      }
    }
  }
}
