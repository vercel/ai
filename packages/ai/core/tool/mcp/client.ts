import { z, ZodType } from 'zod';
import { jsonSchema } from '@ai-sdk/ui-utils';
import { JSONSchema7 } from '@ai-sdk/provider';
import { MCPClientError } from '../../../errors';
import { inferParameters, tool, ToolExecutionOptions } from '../tool';
import { Tool } from '../tool';
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
  McpToolSet,
  ToolSchemas,
  ServerCapabilities,
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

export async function createMCPClient(
  config: MCPClientConfig,
): Promise<MCPClient> {
  const client = new MCPClient(config);
  await client.init();
  return client;
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
 * Not supported:
 * - Client options (e.g. sampling, roots) as they are not needed for tool conversion
 * - Accepting notifications
 */
class MCPClient {
  private transport: MCPTransport;
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
    version = '1.0.0',
  }: MCPClientConfig) {
    this.transport = createMcpTransport(transportConfig);
    this.transport.onClose = () => {
      this.onClose();
    };
    this.transport.onError = (error: Error) => {
      this.onError(error);
    };
    this.transport.onMessage = message => {
      if ('method' in message) {
        // This lightweight client implementation does not support
        // receiving notifications or requests from server:
        throw new MCPClientError({
          message: 'Unsupported message type',
        });
      }

      this.onResponse(message);
    };
    this.clientInfo = {
      name,
      version,
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
    await this.transport?.close();
    this.onClose();
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

  private async listTools({
    params,
    options,
  }: {
    params?: ListToolsRequest['params'];
    options?: RequestOptions;
  } = {}): Promise<ListToolsResult> {
    if (!this.serverCapabilities.tools) {
      throw new MCPClientError({
        message: `Server does not support tools`,
      });
    }

    return this.request({
      request: { method: 'tools/list', params },
      resultSchema: ListToolsResultSchema,
      options,
    });
  }

  private async callTool({
    params,
    resultSchema,
    options,
  }: {
    params: CallToolRequest['params'];
    resultSchema: typeof CallToolResultSchema;
    options?: RequestOptions;
  }): Promise<CallToolResult> {
    if (!this.serverCapabilities.tools) {
      throw new MCPClientError({
        message: `Server does not support tools`,
      });
    }

    return this.request({
      request: { method: 'tools/call', params },
      resultSchema,
      options,
    });
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
    const listToolsResult = await this.listTools();

    for (const { name, description, inputSchema } of listToolsResult.tools) {
      if (schemas !== 'automatic' && !(name in schemas)) {
        continue;
      }

      const parameters =
        schemas === 'automatic'
          ? jsonSchema(inputSchema as JSONSchema7)
          : schemas[name].parameters;

      const toolWithExecute = tool({
        description,
        parameters,
        execute: async (
          args: inferParameters<typeof parameters>,
          options: ToolExecutionOptions,
        ): Promise<CallToolResult> => {
          options?.abortSignal?.throwIfAborted();

          const result = await this.callTool({
            params: {
              name,
              arguments: args,
            },
            resultSchema: CallToolResultSchema,
            options: {
              signal: options.abortSignal,
            },
          });

          return result;
        },
      });

      tools[name] = toolWithExecute;
    }

    return tools as McpToolSet<TOOL_SCHEMAS>;
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

  private onError(error: Error): void {
    throw new MCPClientError({
      message: error.message,
      cause: error,
    });
  }

  private onResponse(response: JSONRPCResponse | JSONRPCError): void {
    const messageId = Number(response.id);
    const handler = this.responseHandlers.get(messageId);
    if (handler === undefined) {
      this.onError(
        new Error(
          `Received a response for an unknown message ID: ${JSON.stringify(
            response,
          )}`,
        ),
      );
      return;
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
