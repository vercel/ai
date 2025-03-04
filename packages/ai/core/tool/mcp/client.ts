import { z, ZodType } from 'zod';
import { MCPClientError } from '../../../errors';
import {
  CallToolRequest,
  CallToolResult,
  CallToolResultSchema,
  Configuration as ClientConfiguration,
  InitializeResultSchema,
  JSONRPCError,
  JSONRPCNotification,
  JSONRPCRequest,
  JSONRPCResponse,
  LATEST_PROTOCOL_VERSION,
  ListToolsRequest,
  ListToolsResult,
  ListToolsResultSchema,
  MCPTransport,
  Notification,
  Request,
  RequestOptions,
  SUPPORTED_PROTOCOL_VERSIONS,
  TransportConfig,
} from './types';
import { createMcpTransport } from './transport';

interface MCPClientConfig {
  /** Transport configuration for connecting to the MCP server */
  transport: TransportConfig;
  /** Optional client name, defaults to 'ai-sdk-mcp-client' */
  name?: string;
  /** Optional client version, defaults to '1.0.0' */
  version?: string;
}

/**
 * A lightweight MCP Client implementation,
 * primarily for tool conversion between MCP<>AI SDK.
 *
 * It is a custom implementation of the MCP Client class.
 *
 * Tool parameters are automatically inferred from the server's JSON schema
 * if not explicitly provided in the tools configuration.
 *
 * Not supported:
 * - Client options (e.g. sampling, roots) as they are not needed for tool conversion
 * - Accepting notifications
 */
export class MCPClient {
  private transport: MCPTransport;
  private clientInfo: ClientConfiguration;
  private requestMessageId = 0;
  private responseHandlers: Map<
    number,
    (response: JSONRPCResponse | Error) => void
  > = new Map();

  constructor({
    transport: transportConfig,
    name = 'ai-sdk-mcp-client',
    version = '1.0.0',
  }: MCPClientConfig) {
    this.transport = createMcpTransport(transportConfig);
    this.transport.onclose = () => {
      this.onclose();
    };
    this.transport.onerror = (error: Error) => {
      this.onerror(error);
    };
    this.transport.onmessage = message => {
      if (!('method' in message)) {
        this.onresponse(message);
      } else {
        // This lightweight client implementation does not support
        // receiving notifications or requests from server:
        throw new MCPClientError({
          message: 'Unsupported message type',
        });
      }
    };
    this.clientInfo = {
      name,
      version,
    };
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
      });

      if (result === undefined) {
        throw new MCPClientError({
          message: 'Server sent invalid initialize result',
        });
      }

      if (!SUPPORTED_PROTOCOL_VERSIONS.includes(result.protocolVersion)) {
        throw new MCPClientError({
          message: `Server's protocol version is not supported: ${result.protocolVersion}`,
        });
      }

      if (!result.capabilities?.tools) {
        throw new MCPClientError({
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
    this.onclose();
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
      const signal = options?.signal;
      signal?.throwIfAborted();

      const messageId = this.requestMessageId++;
      const jsonrpcRequest: JSONRPCRequest = {
        ...request,
        jsonrpc: '2.0',
        id: messageId,
      };

      const cleanup = () => {
        this.responseHandlers.delete(messageId);
      };

      this.responseHandlers.set(messageId, response => {
        if (signal?.aborted) {
          return reject(
            new MCPClientError({
              message: 'Request was aborted',
              cause: signal.reason,
            }),
          );
        }

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

  private onclose(): void {
    const responseHandlers = this.responseHandlers;
    this.responseHandlers = new Map();

    const error = new MCPClientError({
      message: 'Connection closed',
    });

    for (const handler of responseHandlers.values()) {
      handler(error);
    }
  }

  private onerror(error: Error): void {
    throw new MCPClientError({
      message: error.message,
      cause: error,
    });
  }

  private onresponse(response: JSONRPCResponse | JSONRPCError): void {
    const messageId = Number(response.id);
    const handler = this.responseHandlers.get(messageId);
    if (handler === undefined) {
      this.onerror(
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
      const error = new MCPClientError({
        message: response.error.message,
        cause: response.error,
      });
      handler(error);
    }
  }
}
