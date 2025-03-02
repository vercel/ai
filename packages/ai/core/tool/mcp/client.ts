import { z, ZodType } from 'zod';
import {
  CallToolRequest,
  CallToolResult,
  CallToolResultSchema,
  Implementation,
  InitializeResultSchema,
  JSONRPCError,
  JSONRPCNotification,
  JSONRPCRequest,
  JSONRPCResponse,
  LATEST_PROTOCOL_VERSION,
  ListToolsRequest,
  ListToolsResult,
  ListToolsResultSchema,
  Notification,
  Request,
  RequestOptions,
  SUPPORTED_PROTOCOL_VERSIONS,
  Transport,
  TransportConfig,
} from './types';
import { AISDKError } from '@ai-sdk/provider';
import { createMcpTransport } from './transport';

const CONNECTION_TIMEOUT_MS = 6000;
const REQUEST_TIMEOUT_MS = 3000;

interface MCPClientConfig {
  transport: TransportConfig;
  name?: string;
  version?: string;
  connectionTimeoutMs?: number;
  requestTimeoutMs?: number;
}

/**
 * A lightweight MCP Client implementation,
 * primarily for tool conversion between MCP<>AI SDK.
 *
 * It is a custom implementation of the MCP Client (derived from Protocol) class.
 *
 * Not supported:
 * - Client options (e.g. sampling, roots) as they are not needed for tool conversion
 * - Accepting notifications
 */
export class MCPClient {
  private transport: Transport;
  private clientInfo: Implementation;
  private requestMessageId = 0;
  private responseHandlers: Map<
    number,
    (response: JSONRPCResponse | Error) => void
  > = new Map();
  private connectionTimeoutMs: number;
  private requestTimeoutMs: number;

  constructor({
    transport: transportConfig,
    name = 'ai-sdk-mcp-client',
    version = '1.0.0',
    connectionTimeoutMs = CONNECTION_TIMEOUT_MS,
    requestTimeoutMs = REQUEST_TIMEOUT_MS,
  }: MCPClientConfig) {
    this.transport = createMcpTransport(transportConfig);
    this._initTransport();
    this.clientInfo = {
      name,
      version,
    };
    this.connectionTimeoutMs = connectionTimeoutMs;
    this.requestTimeoutMs = requestTimeoutMs;
  }

  async init(): Promise<this> {
    try {
      await this.transport.start();

      const result = await this.request({
        request: {
          method: 'initialize',
          params: {
            protocolVersion: LATEST_PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: this.clientInfo,
          },
        },
        resultSchema: InitializeResultSchema,
        options: { timeout: this.connectionTimeoutMs },
      });

      if (result === undefined) {
        throw new AISDKError({
          name: 'McpClientError',
          message: 'Server sent invalid initialize result',
        });
      }

      if (!SUPPORTED_PROTOCOL_VERSIONS.includes(result.protocolVersion)) {
        throw new AISDKError({
          name: 'McpClientError',
          message: `Server's protocol version is not supported: ${result.protocolVersion}`,
        });
      }

      if (!result.capabilities?.tools) {
        throw new AISDKError({
          name: 'McpClientError',
          message: `Server does not support tools`,
        });
      }

      // Complete initialization handshake:
      await this.notification({
        method: 'notifications/initialized',
      });

      return this;
    } catch (error) {
      void this.close();
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.transport?.close();
    this._onclose();
  }

  async request<T extends ZodType<object>>({
    request,
    resultSchema,
    options,
  }: {
    request: Request;
    resultSchema: T;
    options?: RequestOptions;
  }): Promise<z.infer<T>> {
    return new Promise((resolve, reject) => {
      options?.signal?.throwIfAborted();

      const timeoutSignal = AbortSignal.timeout(
        options?.timeout ?? this.requestTimeoutMs,
      );
      const signal = options?.signal
        ? AbortSignal.any([options.signal, timeoutSignal])
        : timeoutSignal;

      const messageId = this.requestMessageId++;
      const jsonrpcRequest: JSONRPCRequest = {
        ...request,
        jsonrpc: '2.0',
        id: messageId,
      };

      const cleanup = () => {
        this.responseHandlers.delete(messageId);
      };

      signal.addEventListener('abort', () => {
        cleanup();
        reject(
          new AISDKError({
            name: 'McpClientTimeoutError',
            message: 'Request timed out',
            cause: signal?.reason,
          }),
        );
      });

      this.responseHandlers.set(messageId, response => {
        if (signal.aborted) return;

        if (response instanceof Error) {
          return reject(response);
        }

        try {
          const result = resultSchema.parse(response.result);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      this.transport.send(jsonrpcRequest).catch(error => {
        cleanup();
        reject(error);
      });
    });
  }

  async listTools({
    params,
    options,
  }: {
    params?: ListToolsRequest['params'];
    options?: RequestOptions;
  } = {}): Promise<ListToolsResult> {
    return this.request({
      request: { method: 'tools/list', params },
      resultSchema: ListToolsResultSchema,
      options,
    });
  }

  async callTool({
    params,
    resultSchema,
    options,
  }: {
    params: CallToolRequest['params'];
    resultSchema: typeof CallToolResultSchema;
    options?: RequestOptions;
  }): Promise<CallToolResult> {
    return this.request({
      request: { method: 'tools/call', params },
      resultSchema,
      options,
    });
  }

  async notification(notification: Notification): Promise<void> {
    const jsonrpcNotification: JSONRPCNotification = {
      ...notification,
      jsonrpc: '2.0',
    };

    await this.transport.send(jsonrpcNotification);
  }

  private _onclose(): void {
    const responseHandlers = this.responseHandlers;
    this.responseHandlers = new Map();

    const error = new AISDKError({
      name: 'McpClientConnectionClosedError',
      message: 'Connection closed',
    });

    for (const handler of responseHandlers.values()) {
      handler(error);
    }
  }

  private _onerror(error: Error): void {
    throw new AISDKError({
      name: 'McpClientError',
      message: error.message,
      cause: error,
    });
  }

  private _onresponse(response: JSONRPCResponse | JSONRPCError): void {
    const messageId = Number(response.id);
    const handler = this.responseHandlers.get(messageId);
    if (handler === undefined) {
      this._onerror(
        new Error(
          `Received a response for an unknown message ID: ${JSON.stringify(
            response,
          )}`,
        ),
      );
      return;
    }

    this.responseHandlers.delete(messageId);

    if ('result' in response) {
      handler(response);
    } else {
      const error = new AISDKError({
        name: 'McpClientResponseError',
        message: response.error.message,
        cause: response.error,
      });
      handler(error);
    }
  }

  private _initTransport(): void {
    this.transport.onclose = () => {
      this._onclose();
    };
    this.transport.onerror = (error: Error) => {
      this._onerror(error);
    };
    this.transport.onmessage = message => {
      if (!('method' in message)) {
        this._onresponse(message);
      } else {
        // This lightweight client implementation does not support
        // notifications or requests from server:
        throw new AISDKError({
          name: 'McpClientError',
          message: 'Unsupported message type',
        });
      }
    };
  }
}
