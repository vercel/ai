import { EventSourceParserStream } from '@ai-sdk/provider-utils';
import { MCPClientError } from '../../error/mcp-client-error';
import { JSONRPCMessage, JSONRPCMessageSchema } from './json-rpc-message';
import { MCPTransport } from './mcp-transport';

export class SseMCPTransport implements MCPTransport {
  private endpoint?: URL;
  private abortController?: AbortController;
  private url: URL;
  private connected = false;
  private sseConnection?: {
    close: () => void;
  };
  private headers?: Record<string, string>;

  onclose?: () => void;
  onerror?: (error: unknown) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor({
    url,
    headers,
  }: {
    url: string;
    headers?: Record<string, string>;
  }) {
    this.url = new URL(url);
    this.headers = headers;
  }

  async start(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.connected) {
        return resolve();
      }

      this.abortController = new AbortController();

      const establishConnection = async () => {
        try {
          const headers = new Headers(this.headers);
          headers.set('Accept', 'text/event-stream');
          const response = await fetch(this.url.href, {
            headers,
            signal: this.abortController?.signal,
          });

          if (!response.ok || !response.body) {
            const error = new MCPClientError({
              message: `MCP SSE Transport Error: ${response.status} ${response.statusText}`,
            });
            this.onerror?.(error);
            return reject(error);
          }

          const stream = response.body
            .pipeThrough(new TextDecoderStream())
            .pipeThrough(new EventSourceParserStream());

          const reader = stream.getReader();

          const processEvents = async () => {
            try {
              while (true) {
                const { done, value } = await reader.read();

                if (done) {
                  if (this.connected) {
                    this.connected = false;
                    throw new MCPClientError({
                      message:
                        'MCP SSE Transport Error: Connection closed unexpectedly',
                    });
                  }
                  return;
                }

                const { event, data } = value;

                if (event === 'endpoint') {
                  this.endpoint = new URL(data, this.url);

                  if (this.endpoint.origin !== this.url.origin) {
                    throw new MCPClientError({
                      message: `MCP SSE Transport Error: Endpoint origin does not match connection origin: ${this.endpoint.origin}`,
                    });
                  }

                  this.connected = true;
                  resolve();
                } else if (event === 'message') {
                  try {
                    const message = JSONRPCMessageSchema.parse(
                      JSON.parse(data),
                    );
                    this.onmessage?.(message);
                  } catch (error) {
                    const e = new MCPClientError({
                      message:
                        'MCP SSE Transport Error: Failed to parse message',
                      cause: error,
                    });
                    this.onerror?.(e);
                    // We do not throw here so we continue processing events after reporting the error
                  }
                }
              }
            } catch (error) {
              if (error instanceof Error && error.name === 'AbortError') {
                return;
              }

              this.onerror?.(error);
              reject(error);
            }
          };

          this.sseConnection = {
            close: () => reader.cancel(),
          };

          processEvents();
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            return;
          }

          this.onerror?.(error);
          reject(error);
        }
      };

      establishConnection();
    });
  }

  async close(): Promise<void> {
    this.connected = false;
    this.sseConnection?.close();
    this.abortController?.abort();
    this.onclose?.();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.endpoint || !this.connected) {
      throw new MCPClientError({
        message: 'MCP SSE Transport Error: Not connected',
      });
    }

    try {
      const headers = new Headers(this.headers);
      headers.set('Content-Type', 'application/json');
      const init = {
        method: 'POST',
        headers,
        body: JSON.stringify(message),
        signal: this.abortController?.signal,
      };

      const response = await fetch(this.endpoint, init);

      if (!response.ok) {
        const text = await response.text().catch(() => null);
        const error = new MCPClientError({
          message: `MCP SSE Transport Error: POSTing to endpoint (HTTP ${response.status}): ${text}`,
        });
        this.onerror?.(error);
        return;
      }
    } catch (error) {
      this.onerror?.(error);
      return;
    }
  }
}

export function deserializeMessage(line: string): JSONRPCMessage {
  return JSONRPCMessageSchema.parse(JSON.parse(line));
}
