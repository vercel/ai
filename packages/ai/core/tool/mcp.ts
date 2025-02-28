import { ToolSet } from './../generate-text/tool-set';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import {
  CallToolResultSchema,
  CallToolResult,
} from '@modelcontextprotocol/sdk/types';
import { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol';

import { jsonSchema, Schema } from '@ai-sdk/ui-utils';
import { AISDKError, JSONSchema7 } from '@ai-sdk/provider';

import { inferParameters, Tool, tool } from './tool';
import { z } from 'zod';
import { IOType } from 'node:child_process';
import { Stream } from 'node:stream';

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
interface McpClientConfig {
  name: string;
  version: string;
  capabilities: Record<string, string>;
  /**
   * Timeout in milliseconds for connecting to an MCP server
   * @default 5000
   */
  connectTimeoutMs: number;
}

interface AdapterConfig {
  server: McpStdioServerConfig | McpSSEServerConfig;
  clientConfig?: McpClientConfig;
  toolCallOptions?: RequestOptions;
}
interface AdapterReturnType<TOOL_SCHEMAS extends ToolSchemas = {}> {
  tools: McpToolSet<TOOL_SCHEMAS>;
  client: Client;
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

// Heavily inspired by: https://github.com/dnakov/claude-code/blob/da716d77b251868918bb5776377f85a18a47ffdf/src/services/mcpClient.ts#L224
async function connectToServer(
  serverConfig: McpStdioServerConfig | McpSSEServerConfig,
  clientConfig: McpClientConfig = {
    name: 'ai-sdk-mcp-client',
    version: '1.0.0',
    capabilities: {},
    connectTimeoutMs: 5000,
  },
): Promise<Client> {
  const transport =
    serverConfig.type === 'sse'
      ? new SSEClientTransport(new URL(serverConfig.url), serverConfig.options)
      : new StdioClientTransport({
          ...serverConfig,
          env: {
            ...process.env,
            ...serverConfig.env,
          } as Record<string, string>,
        });

  const { name, version, capabilities, connectTimeoutMs } = clientConfig;

  const client = new Client(
    {
      name,
      version,
    },
    {
      capabilities,
    },
  );

  const connectPromise = client.connect(transport);
  const timeoutPromise = new Promise<never>((_, reject) => {
    const timeoutId = setTimeout(() => {
      reject(
        new AISDKError({
          name: 'McpToolAdapterError',
          message: `Connection to ${serverConfig.type} MCP server timed out after ${connectTimeoutMs}ms`,
        }),
      );
    }, connectTimeoutMs);

    connectPromise.then(
      () => clearTimeout(timeoutId),
      error => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });

  try {
    await Promise.race([connectPromise, timeoutPromise]);
  } catch (error) {
    throw new AISDKError({
      name: 'McpToolAdapterError',
      message: `Failed to connect to ${serverConfig.type} MCP server`,
      cause: error,
    });
  }

  return client;
}

export async function createMcpTools<TOOL_SCHEMAS extends ToolSchemas = {}>(
  config: AdapterConfig,
  toolSchemas: TOOL_SCHEMAS,
): Promise<AdapterReturnType<TOOL_SCHEMAS>> {
  const tools: Record<string, Tool> = {};

  try {
    const client = await connectToServer(config.server, config.clientConfig);
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
          return result as CallToolResult;
        },
      };

      tools[name] = toolWithExecute;
    }

    return {
      tools: tools as McpToolSet<TOOL_SCHEMAS>,
      client,
    };
  } catch (error) {
    throw new AISDKError({
      name: 'McpToolAdapterError',
      message: `Failed to generate tools for ${config.server.type} MCP server`,
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
