import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import {
  CallToolResultSchema,
  CallToolResult,
} from '@modelcontextprotocol/sdk/types';

import { jsonSchema, Schema } from '@ai-sdk/ui-utils';
import { AISDKError, JSONSchema7 } from '@ai-sdk/provider';

import { ToolSet } from './../generate-text/tool-set';
import { inferParameters, Tool, tool } from './tool';
import { z } from 'zod';
import { IOType } from 'node:child_process';
import { Stream } from 'node:stream';
import { SimpleMcpClient } from './mcp/client';
import { Implementation, RequestOptions } from './mcp/types';

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

interface AdapterConfig {
  server: McpStdioServerConfig | McpSSEServerConfig;
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
  const clientConfig = config.clientConfig || DEFAULT_CLIENT_CONFIG;
  const client = new SimpleMcpClient(clientConfig);
  const tools: Record<string, Tool> = {};

  try {
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
      toolSet: tools as McpToolSet<TOOL_SCHEMAS>,
      cleanup: async () => {
        await client.close();
      },
    };
  } catch (error) {
    await client.close();
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
