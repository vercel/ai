import {
  EventSourceParserStream,
  withUserAgentSuffix,
  getRuntimeEnvironmentUserAgent,
} from '@ai-sdk/provider-utils';
import { MCPClientError } from '../../error/mcp-client-error';
import { JSONRPCMessage, JSONRPCMessageSchema } from './json-rpc-message';
import { MCPTransport } from './mcp-transport';
import { VERSION } from '../../version';
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
 * - Sends JSON-RPC requests via HTTP POST to a single endpoint (this.url)
 * - Handles responses as either JSON or text/event-stream
 * - Performs OAuth authorization on 401 and retries once
 * - Propagates 'mcp-session-id' headers across requests when provided by server
 */
export class HttpMCPTransport implements MCPTransport {
  private url: URL;
  private abortController?: AbortController;
  private headers?: Record<string, string>;
  private authProvider?: OAuthClientProvider;
  private resourceMetadataUrl?: URL;
  private sessionId?: string;
  private inboundSseConnection?: { close: () => void };

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

    // Attempt to open an optional inbound SSE stream for server-initiated messages.
    // This is best-effort: servers may not support it (405). Auth is attempted once on 401.
    const establishInboundSse = async (triedAuth: boolean = false) => {
      try {
        const headers = await this.commonHeaders({
          Accept: 'text/event-stream',
        });

        const response = await fetch(this.url.href, {
          method: 'GET',
          headers,
          signal: this.abortController?.signal,
        });

        // Capture session id if provided
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
          return establishInboundSse(true);
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

        this.inboundSseConnection = {
          close: () => reader.cancel(),
        };

        processEvents();
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        this.onerror?.(error);
      }
    };

    void establishInboundSse();
  }

  async close(): Promise<void> {
    this.inboundSseConnection?.close();
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
              this.onerror?.(error);
              return;
            }
          } catch (error) {
            this.onerror?.(error);
            return;
          }
          return attempt(true);
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
      }
    };

    await attempt();
  }
}
