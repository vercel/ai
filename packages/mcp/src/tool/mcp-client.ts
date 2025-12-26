import { JSONSchema7 } from '@ai-sdk/provider';
import {
  dynamicTool,
  jsonSchema,
  Tool,
  tool,
  ToolExecutionOptions,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { MCPClientError } from '../error/mcp-client-error';
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
  ClientCapabilities,
  Configuration as ClientConfiguration,
  ElicitationRequest,
  ElicitationRequestSchema,
  ElicitResult,
  ElicitResultSchema,
  InitializeResultSchema,
  LATEST_PROTOCOL_VERSION,
  ListResourceTemplatesResult,
  ListResourceTemplatesResultSchema,
  ListResourcesResult,
  ListResourcesResultSchema,
  ListPromptsResult,
  ListPromptsResultSchema,
  ListToolsResult,
  ListToolsResultSchema,
  McpToolSet,
  Notification,
  PaginatedRequest,
  ReadResourceResult,
  ReadResourceResultSchema,
  GetPromptResult,
  GetPromptResultSchema,
  Request,
  RequestOptions,
  ServerCapabilities,
  SUPPORTED_PROTOCOL_VERSIONS,
  ToolSchemas,
  ToolMeta,
} from './types';

const CLIENT_VERSION = '1.0.0';

export interface MCPClientConfig {
  /** Transport configuration for connecting to the MCP server */
  transport: MCPTransportConfig | MCPTransport;
  /** Optional callback for uncaught errors */
  onUncaughtError?: (error: unknown) => void;
  /** Optional client name, defaults to 'ai-sdk-mcp-client' */
  name?: string;
  /** Optional client version, defaults to '1.0.0' */
  version?: string;
  /**
   * Optional client capabilities to advertise during initialization
   *
   * NOTE: It is up to the client application to handle the requests properly. This parameter just helps surface the request from the server
   */
  capabilities?: ClientCapabilities;
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

  listResources(options?: {
    params?: PaginatedRequest['params'];
    options?: RequestOptions;
  }): Promise<ListResourcesResult>;

  readResource(args: {
    uri: string;
    options?: RequestOptions;
  }): Promise<ReadResourceResult>;

  listResourceTemplates(options?: {
    options?: RequestOptions;
  }): Promise<ListResourceTemplatesResult>;

  experimental_listPrompts(options?: {
    params?: PaginatedRequest['params'];
    options?: RequestOptions;
  }): Promise<ListPromptsResult>;

  experimental_getPrompt(args: {
    name: string;
    arguments?: Record<string, unknown>;
    options?: RequestOptions;
  }): Promise<GetPromptResult>;

  onElicitationRequest(
    schema: typeof ElicitationRequestSchema,
    handler: (
      request: ElicitationRequest,
    ) => Promise<ElicitResult> | ElicitResult,
  ): void;

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
 * - Accepting notifications
 * - Session management (when passing a sessionId to an instance of the Streamable HTTP transport)
 * - Resumable SSE streams
 */
class DefaultMCPClient implements MCPClient {
  private transport: MCPTransport;
  private onUncaughtError?: (error: unknown) => void;
  private clientInfo: ClientConfiguration;
  private clientCapabilities: ClientCapabilities;
  private requestMessageId = 0;
  private responseHandlers: Map<
    number,
    (response: JSONRPCResponse | Error) => void
  > = new Map();
  private serverCapabilities: ServerCapabilities = {};
  private isClosed = true;
  private elicitationRequestHandler?: (
    request: ElicitationRequest,
  ) => Promise<ElicitResult> | ElicitResult;

  constructor({
    transport: transportConfig,
    name = 'ai-sdk-mcp-client',
    version = CLIENT_VERSION,
    onUncaughtError,
    capabilities,
  }: MCPClientConfig) {
    this.onUncaughtError = onUncaughtError;
    this.clientCapabilities = capabilities ?? {};

    if (isCustomMcpTransport(transportConfig)) {
      this.transport = transportConfig;
    } else {
      this.transport = createMcpTransport(transportConfig);
    }

    this.transport.onclose = () => this.onClose();
    this.transport.onerror = (error: Error) => this.onError(error);
    this.transport.onmessage = message => {
      if ('method' in message) {
        if ('id' in message) {
          this.onRequestMessage(message);
        } else {
          this.onError(
            new MCPClientError({
              message: 'Unsupported message type',
            }),
          );
        }
        return;
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
            capabilities: this.clientCapabilities,
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
      case 'resources/list':
      case 'resources/read':
      case 'resources/templates/list':
        if (!this.serverCapabilities.resources) {
          throw new MCPClientError({
            message: `Server does not support resources`,
          });
        }
        break;
      case 'prompts/list':
      case 'prompts/get':
        if (!this.serverCapabilities.prompts) {
          throw new MCPClientError({
            message: `Server does not support prompts`,
          });
        }
        break;
      default:
        throw new MCPClientError({
          message: `Unsupported method: ${method}`,
        });
    }
  }

  private async request<T extends z.ZodType<object>>({
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
    options?: ToolExecutionOptions;
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

  private async listResourcesInternal({
    params,
    options,
  }: {
    params?: PaginatedRequest['params'];
    options?: RequestOptions;
  } = {}): Promise<ListResourcesResult> {
    try {
      return this.request({
        request: { method: 'resources/list', params },
        resultSchema: ListResourcesResultSchema,
        options,
      });
    } catch (error) {
      throw error;
    }
  }

  private async readResourceInternal({
    uri,
    options,
  }: {
    uri: string;
    options?: RequestOptions;
  }): Promise<ReadResourceResult> {
    try {
      return this.request({
        request: { method: 'resources/read', params: { uri } },
        resultSchema: ReadResourceResultSchema,
        options,
      });
    } catch (error) {
      throw error;
    }
  }

  private async listResourceTemplatesInternal({
    options,
  }: {
    options?: RequestOptions;
  } = {}): Promise<ListResourceTemplatesResult> {
    try {
      return this.request({
        request: { method: 'resources/templates/list' },
        resultSchema: ListResourceTemplatesResultSchema,
        options,
      });
    } catch (error) {
      throw error;
    }
  }

  private async listPromptsInternal({
    params,
    options,
  }: {
    params?: PaginatedRequest['params'];
    options?: RequestOptions;
  } = {}): Promise<ListPromptsResult> {
    try {
      return this.request({
        request: { method: 'prompts/list', params },
        resultSchema: ListPromptsResultSchema,
        options,
      });
    } catch (error) {
      throw error;
    }
  }

  private async getPromptInternal({
    name,
    args,
    options,
  }: {
    name: string;
    args?: Record<string, unknown>;
    options?: RequestOptions;
  }): Promise<GetPromptResult> {
    try {
      return this.request({
        request: { method: 'prompts/get', params: { name, arguments: args } },
        resultSchema: GetPromptResultSchema,
        options,
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
    const tools: Record<string, Tool & { _meta?: ToolMeta }> = {};

    try {
      const listToolsResult = await this.listTools();
      for (const {
        name,
        description,
        inputSchema,
        annotations,
        _meta,
      } of listToolsResult.tools) {
        const title = annotations?.title;
        if (schemas !== 'automatic' && !(name in schemas)) {
          continue;
        }

        const self = this;

        const execute = async (
          args: any,
          options: ToolExecutionOptions,
        ): Promise<CallToolResult> => {
          options?.abortSignal?.throwIfAborted();
          return self.callTool({ name, args, options });
        };

        const toolWithExecute =
          schemas === 'automatic'
            ? dynamicTool({
                description,
                title,
                inputSchema: jsonSchema({
                  ...inputSchema,
                  properties: inputSchema.properties ?? {},
                  additionalProperties: false,
                } as JSONSchema7),
                execute,
              })
            : tool({
                description,
                title,
                inputSchema: schemas[name].inputSchema,
                execute,
              });

        tools[name] = { ...toolWithExecute, _meta };
      }

      return tools as McpToolSet<TOOL_SCHEMAS>;
    } catch (error) {
      throw error;
    }
  }

  listResources({
    params,
    options,
  }: {
    params?: PaginatedRequest['params'];
    options?: RequestOptions;
  } = {}): Promise<ListResourcesResult> {
    return this.listResourcesInternal({ params, options });
  }

  readResource({
    uri,
    options,
  }: {
    uri: string;
    options?: RequestOptions;
  }): Promise<ReadResourceResult> {
    return this.readResourceInternal({ uri, options });
  }

  listResourceTemplates({
    options,
  }: {
    options?: RequestOptions;
  } = {}): Promise<ListResourceTemplatesResult> {
    return this.listResourceTemplatesInternal({ options });
  }

  experimental_listPrompts({
    params,
    options,
  }: {
    params?: PaginatedRequest['params'];
    options?: RequestOptions;
  } = {}): Promise<ListPromptsResult> {
    return this.listPromptsInternal({ params, options });
  }

  experimental_getPrompt({
    name,
    arguments: args,
    options,
  }: {
    name: string;
    arguments?: Record<string, unknown>;
    options?: RequestOptions;
  }): Promise<GetPromptResult> {
    return this.getPromptInternal({ name, args, options });
  }

  onElicitationRequest(
    schema: typeof ElicitationRequestSchema,
    handler: (
      request: ElicitationRequest,
    ) => Promise<ElicitResult> | ElicitResult,
  ): void {
    if (schema !== ElicitationRequestSchema) {
      throw new MCPClientError({
        message:
          'Unsupported request schema. Only ElicitationRequestSchema is supported.',
      });
    }

    this.elicitationRequestHandler = handler;
  }

  private async onRequestMessage(request: JSONRPCRequest): Promise<void> {
    try {
      if (request.method !== 'elicitation/create') {
        await this.transport.send({
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32601,
            message: `Unsupported request method: ${request.method}`,
          },
        });
        return;
      }

      if (!this.elicitationRequestHandler) {
        await this.transport.send({
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32601,
            message: 'No elicitation handler registered on client',
          },
        });
        return;
      }

      const parsedRequest = ElicitationRequestSchema.safeParse({
        method: request.method,
        params: request.params,
      });

      if (!parsedRequest.success) {
        await this.transport.send({
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32602,
            message: `Invalid elicitation request: ${parsedRequest.error.message}`,
            data: parsedRequest.error.issues,
          },
        });
        return;
      }

      try {
        const result = await this.elicitationRequestHandler(parsedRequest.data);
        const validatedResult = ElicitResultSchema.parse(result);

        await this.transport.send({
          jsonrpc: '2.0',
          id: request.id,
          result: validatedResult,
        });
      } catch (error) {
        await this.transport.send({
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32603,
            message:
              error instanceof Error
                ? error.message
                : 'Failed to handle elicitation request',
          },
        });
        this.onError(error);
      }
    } catch (error) {
      this.onError(error);
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
            code: response.error.code,
            data: response.error.data,
            cause: response.error,
          }),
    );
  }
}
