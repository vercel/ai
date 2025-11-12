import { JSONSchema7 } from '@ai-sdk/provider';
import {
  dynamicTool,
  jsonSchema,
  Tool,
  tool,
  ToolCallOptions,
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
  Configuration as ClientConfiguration,
  ElicitationAction,
  ElicitationActionSchema,
  ElicitationCreateParamsSchema,
  ElicitationCreateRequest,
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
} from './types';

const CLIENT_VERSION = '1.0.0';

export interface MCPClientConfig {
  /** Transport configuration for connecting to the MCP server */
  transport: MCPTransportConfig | MCPTransport;
  /** Optional callback for uncaught errors */
  onUncaughtError?: (error: unknown) => void;
  /** Optional client name, defaults to 'ai-sdk-mcp-client' */
  name?: string;
  /** Optional elicitation handler for server-initiated information requests */
  elicitation?: {
    onCreate: (
      request: ElicitationCreateRequest,
      requestId?: string | number,
    ) => Promise<ElicitationAction>;
  };
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

  listPrompts(options?: {
    params?: PaginatedRequest['params'];
    options?: RequestOptions;
  }): Promise<ListPromptsResult>;

  getPrompt(args: {
    name: string;
    arguments?: Record<string, unknown>;
    options?: RequestOptions;
  }): Promise<GetPromptResult>;

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
  private elicitationOnCreate?: (
    request: ElicitationCreateRequest,
    requestId?: string | number,
  ) => Promise<ElicitationAction>;

  constructor({
    transport: transportConfig,
    name = 'ai-sdk-mcp-client',
    onUncaughtError,
    elicitation,
  }: MCPClientConfig) {
    this.onUncaughtError = onUncaughtError;
    this.elicitationOnCreate = elicitation?.onCreate;

    if (isCustomMcpTransport(transportConfig)) {
      this.transport = transportConfig;
    } else {
      this.transport = createMcpTransport(transportConfig);
    }

    this.transport.onclose = () => this.onClose();
    this.transport.onerror = (error: Error) => this.onError(error);
    this.transport.onmessage = message => {
      if ('method' in message) {
        // Handle elicitation/create requests from server
        if (
          'id' in message &&
          message.method === 'elicitation/create' &&
          this.elicitationOnCreate
        ) {
          this.handleElicitationCreate(message as JSONRPCRequest).catch(
            error => {
              this.onError(error);
            },
          );
          return;
        }

        // This lightweight client implementation does not support
        // receiving other notifications or requests from server.
        // If we get an unsupported message, we can safely ignore it and pass to the onError handler:
        if ('id' in message && message.method === 'elicitation/create') {
          // Return error response for elicitation/create when no handler configured
          this.sendErrorResponse(
            message.id,
            -32000,
            'Method not supported',
          ).catch(error => {
            this.onError(error);
          });
          return;
        }

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
            capabilities: {
              ...(this.elicitationOnCreate ? { elicitation: {} } : {}),
            },
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
    const tools: Record<string, Tool> = {};

    try {
      const listToolsResult = await this.listTools();
      for (const {
        name,
        description,
        inputSchema,
        annotations,
      } of listToolsResult.tools) {
        const title = annotations?.title;
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

        tools[name] = toolWithExecute;
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

  listPrompts({
    params,
    options,
  }: {
    params?: PaginatedRequest['params'];
    options?: RequestOptions;
  } = {}): Promise<ListPromptsResult> {
    return this.listPromptsInternal({ params, options });
  }

  getPrompt({
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

  private async handleElicitationCreate(
    request: JSONRPCRequest,
  ): Promise<void> {
    if (!this.elicitationOnCreate) {
      await this.sendErrorResponse(request.id, -32000, 'Method not supported');
      return;
    }

    try {
      // Parse and validate the request params
      const params = ElicitationCreateParamsSchema.parse(request.params);

      // Call the user-provided callback with the request ID
      const action = await this.elicitationOnCreate(params, request.id);

      // Validate the action response
      const validatedAction = ElicitationActionSchema.parse(action);

      // Send the response back to the server
      const response: JSONRPCResponse = {
        jsonrpc: '2.0',
        id: request.id,
        result: validatedAction,
      };

      await this.transport.send(response);
    } catch (error) {
      // Handle validation errors or callback errors
      if (error instanceof z.ZodError) {
        await this.sendErrorResponse(
          request.id,
          -32602,
          'Invalid params',
          error.issues,
        );
      } else {
        await this.sendErrorResponse(
          request.id,
          -32603,
          'Internal error',
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }

  private async sendErrorResponse(
    id: string | number,
    code: number,
    message: string,
    data?: unknown,
  ): Promise<void> {
    const errorResponse: JSONRPCError = {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
        ...(data !== undefined ? { data } : {}),
      },
    };

    await this.transport.send(errorResponse);
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
