import {
  EventSourceParserStream,
  withUserAgentSuffix,
  getRuntimeEnvironmentUserAgent,
} from '@ai-sdk/provider-utils';
import { MCPClientError } from '../error/mcp-client-error';
import { JSONRPCMessage, JSONRPCMessageSchema } from './json-rpc-message';
import { MCPTransport } from './mcp-transport';
import { VERSION } from '../version';
import {
  OAuthClientProvider,
  extractResourceMetadataUrl,
  UnauthorizedError,
  auth,
} from './oauth';
import { LATEST_PROTOCOL_VERSION } from './types';

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

  constructor({
    url,
    headers,
    authProvider,
  }: {
    url: string;
    headers?: Record<string, string>;
    authProvider?: OAuthClientProvider;
  }) {
    this.url = new URL(url);
    this.headers = headers;
    this.authProvider = authProvider;
  }

  private async commonHeaders(
    base: Record<string, string>,
  ): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      ...this.headers,
      ...base,
      'mcp-protocol-version': LATEST_PROTOCOL_VERSION,
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
    this.abortController = new AbortController();

    void this.openInboundSse();
  }

  async close(): Promise<void> {
    this.inboundSseConnection?.close();
    try {
      if (
        this.sessionId &&
        this.abortController &&
        !this.abortController.signal.aborted
      ) {
        const headers = await this.commonHeaders({});
        await fetch(this.url, {
          method: 'DELETE',
          headers,
          signal: this.abortController.signal,
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
        } satisfies RequestInit;

        const response = await fetch(this.url, init);

        const sessionId = response.headers.get('mcp-session-id');
        if (sessionId) {
          this.sessionId = sessionId;
        }

        if (response.status === 401 && this.authProvider && !triedAuth) {
          this.resourceMetadataUrl = extractResourceMetadataUrl(response);
          try {
            const result = await auth(this.authProvider, {
              serverUrl: this.url,
              resourceMetadataUrl: this.resourceMetadataUrl,
            });
            if (result !== 'AUTHORIZED') {
              const error = new UnauthorizedError();
              throw error;
            }
          } catch (error) {
            this.onerror?.(error);
            return;
          }
          return attempt(true);
        }

        // If server accepted the message (e.g. initialized notification), optionally (re)start inbound SSE
        if (response.status === 202) {
          // If inbound SSE was not available earlier (e.g. 405 before init), try again now
          // Do not await to avoid blocking send()
          if (!this.inboundSseConnection) {
            void this.openInboundSse();
          }
          return;
        }

        if (!response.ok) {
          const text = await response.text().catch(() => null);
          const error = new MCPClientError({
            message: `MCP HTTP Transport Error: POSTing to endpoint (HTTP ${response.status}): ${text}`,
          });
          this.onerror?.(error);
          return;
        }

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await response.json();
          const messages: JSONRPCMessage[] = Array.isArray(data)
            ? data.map((m: unknown) => JSONRPCMessageSchema.parse(m))
            : [JSONRPCMessageSchema.parse(data)];
          for (const m of messages) this.onmessage?.(m);
          return;
        }

        if (contentType.includes('text/event-stream')) {
          if (!response.body) {
            const error = new MCPClientError({
              message:
                'MCP HTTP Transport Error: text/event-stream response without body',
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
                const { event, data } = value;
                if (event === 'message') {
                  try {
                    const msg = JSONRPCMessageSchema.parse(JSON.parse(data));
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
          return;
        }

        const error = new MCPClientError({
          message: `MCP HTTP Transport Error: Unexpected content type: ${contentType}`,
        });
        this.onerror?.(error);
      } catch (error) {
        this.onerror?.(error);
        if (error instanceof UnauthorizedError) {
          throw error;
        }
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

      const response = await fetch(this.url.href, {
        method: 'GET',
        headers,
        signal: this.abortController?.signal,
      });

      const sessionId = response.headers.get('mcp-session-id');
      if (sessionId) {
        this.sessionId = sessionId;
      }

      if (response.status === 401 && this.authProvider && !triedAuth) {
        this.resourceMetadataUrl = extractResourceMetadataUrl(response);
        try {
          const result = await auth(this.authProvider, {
            serverUrl: this.url,
            resourceMetadataUrl: this.resourceMetadataUrl,
          });
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
                const msg = JSONRPCMessageSchema.parse(JSON.parse(data));
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
