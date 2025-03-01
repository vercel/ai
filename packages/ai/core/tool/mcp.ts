import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

import { jsonSchema, Schema } from '@ai-sdk/ui-utils';
import { AISDKError, JSONSchema7 } from '@ai-sdk/provider';

import { ToolSet } from './../generate-text/tool-set';
import { inferParameters, Tool, tool } from './tool';
import { z } from 'zod';
import { IOType } from 'node:child_process';
import { Stream } from 'node:stream';
import { SimpleMcpClient } from './mcp/client';
import {
  CallToolRequest,
  CallToolResult,
  CallToolResultSchema,
  CompatibilityCallToolResultSchema,
  Implementation,
  ListToolsRequest,
  ListToolsResult,
  RequestOptions,
} from './mcp/types';

interface McpStdioServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  stderr?: IOType | Stream | number;
  cwd?: string;
  type: 'stdio';
}
interface McpSSEServerConfig {
  type: 'sse';
  url: string;
  options?: {
    // authProvider?: OAuthClientProvider;
    eventSourceInit?: EventSourceInit;
    requestInit?: RequestInit;
  };
}

const DEFAULT_CLIENT_CONFIG = {
  name: 'ai-sdk-mcp-client',
  version: '1.0.0',
  connectionTimeoutMs: 6000,
  requestTimeoutMs: 3000,
};

/**
 * An interface that defines the minimum required MCP client properties.
 * Used when endusers provide their own MCP Client for more granular control.
 */
interface McpClientInterface {
  listTools(
    params?: ListToolsRequest['params'],
    options?: RequestOptions,
  ): Promise<ListToolsResult>;
  callTool(
    params: CallToolRequest['params'],
    resultSchema?:
      | typeof CallToolResultSchema
      | typeof CompatibilityCallToolResultSchema,
    options?: RequestOptions,
  ): Promise<any>;
}

interface AdapterConfig {
  server: McpStdioServerConfig | McpSSEServerConfig;
  customClient?: McpClientInterface;
  clientConfig?: Implementation;
  toolCallOptions?: RequestOptions;
}

interface AdapterReturnType<TOOL_SCHEMAS extends ToolSchemas = {}> {
  toolSet: McpToolSet<TOOL_SCHEMAS>;
  cleanup: () => Promise<void>;
}

type ToolSchemas = Record<string, { input: z.ZodTypeAny | Schema<any> }>;

type McpToolSet<TOOL_SCHEMAS extends ToolSchemas = {}> = ToolSet & {
  [K in keyof TOOL_SCHEMAS]: Tool<
    inferParameters<TOOL_SCHEMAS[K]['input']>,
    CallToolResult
  > & {
    execute: (
      args: inferParameters<TOOL_SCHEMAS[K]['input']>,
      // options?
    ) => Promise<CallToolResult>;
  };
} & {
  [key: string]: Tool<any, CallToolResult> & {
    execute: (
      args: any,
      // options?
    ) => Promise<CallToolResult>;
  };
};

export async function createMcpTools<TOOL_SCHEMAS extends ToolSchemas = {}>(
  config: AdapterConfig,
  toolSchemas: TOOL_SCHEMAS,
): Promise<AdapterReturnType<TOOL_SCHEMAS>> {
  const tools: Record<string, Tool> = {};
  const { client, cleanup } = await setupClient(config);

  try {
    const listToolsResult = await client.listTools();

    for (const { name, description, inputSchema } of listToolsResult.tools) {
      const parameters = toolSchemas[name]
        ? toolSchemas[name].input
        : jsonSchema(inputSchema as JSONSchema7);

      const baseTool = tool({
        description,
        parameters,
      });

      const toolWithExecute = {
        ...baseTool,
        execute: async (
          args: inferParameters<typeof parameters>,
        ): Promise<CallToolResult> => {
          const result = await client.callTool(
            {
              name,
              arguments: args,
            },
            CallToolResultSchema,
            config.toolCallOptions,
          );
          const parsedResult = CallToolResultSchema.parse(result);
          return parsedResult as CallToolResult;
        },
      };

      tools[name] = toolWithExecute;
    }

    return {
      toolSet: tools as McpToolSet<TOOL_SCHEMAS>,
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw new AISDKError({
      name: 'McpToolAdapterError',
      message: `Failed to generate tools for ${config.server.type} MCP server`,
      cause: error,
    });
  }
}

async function setupClient(config: AdapterConfig) {
  if (config.customClient)
    return {
      client: config.customClient,
      cleanup: async () => {
        // noop - no clean up for custom clients
        return Promise.resolve();
      },
    };

  try {
    const client = new SimpleMcpClient(
      config.clientConfig || DEFAULT_CLIENT_CONFIG,
    );

    const transport =
      config.server.type === 'sse'
        ? new SSEClientTransport(
            new URL(config.server.url),
            config.server.options,
          )
        : new StdioClientTransport({
            ...config.server,
            env: {
              ...process.env,
              ...config.server.env,
            } as Record<string, string>,
          });

    await client.connect(transport);
    return {
      client,
      cleanup: async () => {
        await client.close();
      },
    };
  } catch (error) {
    throw new AISDKError({
      name: 'McpClientSetupError',
      message: `Failed to connect to ${config.server.type} MCP server`,
      cause: error,
    });
  }
}

// To address:

/**
 * Refreshing tools:
 * 
 * - Would it be better to ship a global "tool/client manager" class? 
 * - Gives users more granular control over clients, refreshing tools
 * (e.g. getTools, refreshTools, closeConnections)
 * - Even in non-serverless environments, we need a way to refresh tools (custom Transport?)
 * 
 * const toolManager = new McpToolManager({
  sse: {
  sse: {
    type: 'sse',
    url: 'https://server.com/sse'
  },
  local: {
    type: 'stdio',
    command: 'npx'
  }
});
 */

/**
 * Add tests, web socket impl. for `msw`
 * Read: https://mswjs.io/docs/basics/handling-websocket-events
 * Also add new example(s) for MCP stdio (and SSE?)
 */
