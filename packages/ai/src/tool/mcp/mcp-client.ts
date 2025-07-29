import { JSONSchema7 } from '@ai-sdk/provider';
import {
  dynamicTool,
  jsonSchema,
  Tool,
  tool,
  ToolCallOptions,
} from '@ai-sdk/provider-utils';
import { z, ZodType } from 'zod/v4';
import { MCPClientError } from '../../error/mcp-client-error';
import {
  JSONRPCError,
  JSONRPCNotification,
  JSONRPCRequest,
  JSONRPCResponse,
} from './json-rpc-message';
import {
  createMcpTransport,
  isCustomMcpTransport,
  MCPTransport,
  MCPTransportConfig,
} from './mcp-transport';
import {
  CallToolResult,
  CallToolResultSchema,
  Configuration as ClientConfiguration,
  InitializeResultSchema,
  LATEST_PROTOCOL_VERSION,
  ListToolsResult,
  ListToolsResultSchema,
  McpToolSet,
  Notification,
  PaginatedRequest,
  Request,
  RequestOptions,
  ServerCapabilities,
  SUPPORTED_PROTOCOL_VERSIONS,
  ToolSchemas,
} from './types';

const CLIENT_VERSION = '1.0.0';

export interface MCPClientConfig {
  /** Transport configuration for connecting to the MCP server */
  transport: MCPTransportConfig | MCPTransport;
  /** Optional callback for uncaught errors */
  onUncaughtError?: (error: unknown) => void;
  /** Optional client name, defaults to 'ai-sdk-mcp-client' */
  name?: string;
}

export async function createMCPClient(
  config: MCPClientConfig,
): Promise<MCPClient> {
  const client = new DefaultMCPClient(config);
  await client.init();
  return client;
}

export interface MCPClient {
  tools<TOOL_SCHEMAS extends ToolSchemas = 'automatic'>(options?: {
    schemas?: TOOL_SCHEMAS;
  }): Promise<McpToolSet<TOOL_SCHEMAS>>;

  close: () => Promise<void>;
}

/**
 * A lightweight MCP Client implementation
 *
 * The primary purpose of this client is tool conversion between MCP<>AI SDK
 * but can later be extended to support other MCP features
 *
 * Tool parameters are automatically inferred from the server's JSON schema
 * if not explicitly provided in the tools configuration
 *
 * This client is meant to be used to communicate with a single server. To communicate and fetch tools across multiple servers, it's recommended to create a new client instance per server.
 *
 * Not supported:
 * - Client options (e.g. sampling, roots) as they are not needed for tool conversion
 * - Accepting notifications
 * - Session management (when passing a sessionId to an instance of the Streamable HTTP transport)
 * - Resumable SSE streams
 */
class DefaultMCPClient implements MCPClient {
  private transport: MCPTransport;
  private onUncaughtError?: (error: unknown) => void;
  private clientInfo: ClientConfiguration;
  private requestMessageId = 0;
  private responseHandlers: Map<
    number,
    (response: JSONRPCResponse | Error) => void
  > = new Map();
  private serverCapabilities: ServerCapabilities = {};
  private isClosed = true;

  constructor({
    transport: transportConfig,
    name = 'ai-sdk-mcp-client',
    onUncaughtError,
  }: MCPClientConfig) {
    this.onUncaughtError = onUncaughtError;

    if (isCustomMcpTransport(transportConfig)) {
      this.transport = transportConfig;
    } else {
      this.transport = createMcpTransport(transportConfig);
    }

    this.transport.onclose = () => this.onClose();
    this.transport.onerror = (error: Error) => this.onError(error);
    this.transport.onmessage = message => {
      if ('method' in message) {
        // This lightweight client implementation does not support
        // receiving notifications or requests from server.
        // If we get an unsupported message, we can safely ignore it and pass to the onError handler:
        this.onError(
          new MCPClientError({
            message: 'Unsupported message type',
          }),
        );
        return;
      }

      this.onResponse(message);
    };

    this.clientInfo = {
      name,
      version: CLIENT_VERSION,
    };
  }

  async init(): Promise<this> {
    try {
      await this.transport.start();
      this.isClosed = false;

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

      this.serverCapabilities = result.capabilities;

      // Complete initialization handshake:
      await this.notification({
        method: 'notifications/initialized',
      });

      return this;
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.isClosed) return;
    await this.transport?.close();
    this.onClose();
  }

  private assertCapability(method: string): void {
    switch (method) {
      case 'initialize':
        break;
      case 'tools/list':
      case 'tools/call':
        if (!this.serverCapabilities.tools) {
          throw new MCPClientError({
            message: `Server does not support tools`,
          });
        }
        break;
      default:
        throw new MCPClientError({
          message: `Unsupported method: ${method}`,
        });
    }
  }

  private async request<T extends ZodType<object>>({
    request,
    resultSchema,
    options,
  }: {
    request: Request;
    resultSchema: T;
    options?: RequestOptions;
  }): Promise<z.infer<T>> {
    return new Promise((resolve, reject) => {
      if (this.isClosed) {
        return reject(
          new MCPClientError({
            message: 'Attempted to send a request from a closed client',
          }),
        );
      }

      this.assertCapability(request.method);

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
          const parseError = new MCPClientError({
            message: 'Failed to parse server response',
            cause: error,
          });
          reject(parseError);
        }
      });

      this.transport.send(jsonrpcRequest).catch(error => {
        cleanup();
        reject(error);
      });
    });
  }

  private async listTools({
    params,
    options,
  }: {
    params?: PaginatedRequest['params'];
    options?: RequestOptions;
  } = {}): Promise<ListToolsResult> {
    try {
      return this.request({
        request: { method: 'tools/list', params },
        resultSchema: ListToolsResultSchema,
        options,
      });
    } catch (error) {
      throw error;
    }
  }

  private async callTool({
    name,
    args,
    options,
  }: {
    name: string;
    args: Record<string, unknown>;
    options?: ToolCallOptions;
  }): Promise<CallToolResult> {
    try {
      return this.request({
        request: { method: 'tools/call', params: { name, arguments: args } },
        resultSchema: CallToolResultSchema,
        options: {
          signal: options?.abortSignal,
        },
      });
    } catch (error) {
      throw error;
    }
  }

  private async notification(notification: Notification): Promise<void> {
    const jsonrpcNotification: JSONRPCNotification = {
      ...notification,
      jsonrpc: '2.0',
    };
    await this.transport.send(jsonrpcNotification);
  }

  /**
   * Returns a set of AI SDK tools from the MCP server
   * @returns A record of tool names to their implementations
   */
  async tools<TOOL_SCHEMAS extends ToolSchemas = 'automatic'>({
    schemas = 'automatic',
  }: {
    schemas?: TOOL_SCHEMAS;
  } = {}): Promise<McpToolSet<TOOL_SCHEMAS>> {
    const tools: Record<string, Tool> = {};

    try {
      const listToolsResult = await this.listTools();

      for (const { name, description, inputSchema } of listToolsResult.tools) {
        if (schemas !== 'automatic' && !(name in schemas)) {
          continue;
        }

        const self = this;

        const execute = async (
          args: any,
          options: ToolCallOptions,
        ): Promise<CallToolResult> => {
          options?.abortSignal?.throwIfAborted();
          return self.callTool({ name, args, options });
        };

        const toolWithExecute =
          schemas === 'automatic'
            ? dynamicTool({
                description,
                inputSchema: jsonSchema({
                  ...inputSchema,
                  properties: inputSchema.properties ?? {},
                  additionalProperties: false,
                } as JSONSchema7),
                execute,
              })
            : tool({
                description,
                inputSchema: schemas[name].inputSchema,
                execute,
              });

        tools[name] = toolWithExecute;
      }

      return tools as McpToolSet<TOOL_SCHEMAS>;
    } catch (error) {
      throw error;
    }
  }

  private onClose(): void {
    if (this.isClosed) return;

    this.isClosed = true;
    const error = new MCPClientError({
      message: 'Connection closed',
    });

    for (const handler of this.responseHandlers.values()) {
      handler(error);
    }

    this.responseHandlers.clear();
  }

  private onError(error: unknown): void {
    if (this.onUncaughtError) {
      this.onUncaughtError(error);
    }
  }

  private onResponse(response: JSONRPCResponse | JSONRPCError): void {
    const messageId = Number(response.id);
    const handler = this.responseHandlers.get(messageId);

    if (handler === undefined) {
      throw new MCPClientError({
        message: `Protocol error: Received a response for an unknown message ID: ${JSON.stringify(
          response,
        )}`,
      });
    }

    this.responseHandlers.delete(messageId);

    handler(
      'result' in response
        ? response
        : new MCPClientError({
            message: response.error.message,
            cause: response.error,
          }),
    );
  }
}
