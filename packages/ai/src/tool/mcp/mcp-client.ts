import { JSONSchema7 } from '@ai-sdk/provider';
import {
  dynamicTool,
  jsonSchema,
  Tool,
  tool,
  ToolCallOptions,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
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
  ListResourcesResult,
  ListResourcesResultSchema,
  ListResourceTemplatesResult,
  ListResourceTemplatesResultSchema,
  ListToolsResult,
  ListToolsResultSchema,
  McpToolSet,
  Notification,
  PaginatedRequest,
  ReadResourceResult,
  ReadResourceResultSchema,
  Request,
  RequestOptions,
  Resource,
  ResourceTemplate,
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
    includeResources?: boolean;
  }): Promise<McpToolSet<TOOL_SCHEMAS>>;

  listResources(params?: PaginatedRequest['params']): Promise<ListResourcesResult>;

  listResourceTemplates(params?: PaginatedRequest['params']): Promise<ListResourceTemplatesResult>;

  readResource(params: { uri: string } | string): Promise<ReadResourceResult>;

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
      case 'resources/list':
      case 'resources/templates/list':
      case 'resources/read':
        if (!this.serverCapabilities.resources) {
          throw new MCPClientError({
            message: `Server does not support resources`,
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

  private async listResourceTemplatesInternal({
    params,
    options,
  }: {
    params?: PaginatedRequest['params'];
    options?: RequestOptions;
  } = {}): Promise<ListResourceTemplatesResult> {
    try {
      return this.request({
        request: { method: 'resources/templates/list', params },
        resultSchema: ListResourceTemplatesResultSchema,
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
    includeResources = false,
  }: {
    schemas?: TOOL_SCHEMAS;
    includeResources?: boolean;
  } = {}): Promise<McpToolSet<TOOL_SCHEMAS>> {
    const tools: Record<string, Tool> = {};

    try {
      // Add tools from tools/list
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

      // Optionally add resources as tools
      if (includeResources && this.serverCapabilities.resources) {
        const self = this;

        // Add direct resources as tools
        try {
          // Fetch all pages of resources
          let cursor: string | undefined;
          const allResources: Resource[] = [];
          do {
            const result = await this.listResources(cursor ? { cursor } : undefined);
            allResources.push(...result.resources);
            cursor = result.nextCursor;
          } while (cursor);

          for (const resource of allResources) {
            const toolName = `resource_${resource.name}`;

            if (schemas !== 'automatic' && !(toolName in schemas)) {
              continue;
            }

            const execute = async (
              _args: any,
              options: ToolCallOptions,
            ): Promise<ReadResourceResult> => {
              options?.abortSignal?.throwIfAborted();
              return self.readResource(resource.uri);
            };

            const resourceTool =
              schemas === 'automatic'
                ? dynamicTool({
                    description: resource.description || `Read resource: ${resource.name}`,
                    inputSchema: jsonSchema({
                      type: 'object',
                      properties: {},
                      additionalProperties: false,
                    } as JSONSchema7),
                    execute,
                  })
                : tool({
                    description: resource.description || `Read resource: ${resource.name}`,
                    inputSchema: schemas[toolName].inputSchema,
                    execute,
                  });

            tools[toolName] = resourceTool;
          }
        } catch (error) {
          // If resources fail, continue with tools only
        }

        // Add resource templates as tools
        try {
          // Fetch all pages of resource templates
          let cursor: string | undefined;
          const allTemplates: ResourceTemplate[] = [];
          do {
            const result = await this.listResourceTemplates(cursor ? { cursor } : undefined);
            allTemplates.push(...result.resourceTemplates);
            cursor = result.nextCursor;
          } while (cursor);

          for (const template of allTemplates) {
            const toolName = `resource_template_${template.name}`;

            if (schemas !== 'automatic' && !(toolName in schemas)) {
              continue;
            }

            // Parse URI template to extract parameters
            const params = this.extractTemplateParams(template.uriTemplate);
            const properties: Record<string, any> = {};
            const required: string[] = [];

            for (const param of params) {
              properties[param] = {
                type: 'string',
                description: `Value for ${param} in URI template`,
              };
              required.push(param);
            }

            const execute = async (
              args: any,
              options: ToolCallOptions,
            ): Promise<ReadResourceResult> => {
              options?.abortSignal?.throwIfAborted();
              const uri = this.expandTemplate(template.uriTemplate, args);
              return self.readResource(uri);
            };

            const templateTool =
              schemas === 'automatic'
                ? dynamicTool({
                    description: template.description || `Read resource template: ${template.name}`,
                    inputSchema: jsonSchema({
                      type: 'object',
                      properties,
                      required,
                      additionalProperties: false,
                    } as JSONSchema7),
                    execute,
                  })
                : tool({
                    description: template.description || `Read resource template: ${template.name}`,
                    inputSchema: schemas[toolName].inputSchema,
                    execute,
                  });

            tools[toolName] = templateTool;
          }
        } catch (error) {
          // If resource templates fail, continue with other tools
        }
      }

      return tools as McpToolSet<TOOL_SCHEMAS>;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Extract parameters from URI template (RFC 6570 simple expansion)
   */
  private extractTemplateParams(template: string): string[] {
    const matches = template.match(/{([^}]+)}/g);
    if (!matches) return [];
    return matches.map(match => match.slice(1, -1));
  }

  /**
   * Expand URI template with provided values
   */
  private expandTemplate(template: string, values: Record<string, string>): string {
    return template.replace(/{([^}]+)}/g, (match, key) => {
      return values[key] || match;
    });
  }

  /**
   * List available resources from the MCP server
   * @param params Optional pagination params (cursor)
   * @returns Paginated list of resource descriptors
   */
  async listResources(params?: PaginatedRequest['params']): Promise<ListResourcesResult> {
    try {
      return this.listResourcesInternal({ params });
    } catch (error) {
      throw error;
    }
  }

  /**
   * List available resource templates from the MCP server
   * @param params Optional pagination params (cursor)
   * @returns Paginated list of resource template descriptors
   */
  async listResourceTemplates(params?: PaginatedRequest['params']): Promise<ListResourceTemplatesResult> {
    try {
      return this.listResourceTemplatesInternal({ params });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Read a resource from the MCP server
   * @param params URI or object with uri property
   * @returns The resource content
   */
  async readResource(params: { uri: string } | string): Promise<ReadResourceResult> {
    try {
      const uri = typeof params === 'string' ? params : params.uri;
      return this.readResourceInternal({ uri });
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
            code: response.error.code,
            data: response.error.data,
            cause: response.error,
          }),
    );
  }
}
