import { jsonSchema } from '@ai-sdk/ui-utils';
import { AISDKError, JSONSchema7 } from '@ai-sdk/provider';
import {
  inferParameters,
  Parameters,
  Tool,
  tool,
  ToolExecutionOptions,
} from './tool';
import { IOType } from 'node:child_process';
import { Stream } from 'node:stream';
import { MCPClient } from './mcp/client';
import {
  CallToolRequest,
  CallToolResult,
  CallToolResultSchema,
  CompatibilityCallToolResultSchema,
  ListToolsRequest,
  ListToolsResult,
  RequestOptions,
} from './mcp/types';
import { ToToolsWithDefinedExecute } from '../generate-text/tool-result';

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
}
export type TransportConfig = McpStdioServerConfig | McpSSEServerConfig;

interface AdapterConfig<TOOL_SCHEMAS extends ToolSchemas = {}> {
  transport: TransportConfig;
  tools?: TOOL_SCHEMAS;
}

interface AdapterReturnType<TOOL_SCHEMAS extends ToolSchemas = {}> {
  toolSet: McpToolSet<TOOL_SCHEMAS>;
  cleanup: () => Promise<void>;
}

type ToolSchemas = Record<string, { parameters: Parameters }>;

type McpToolSet<TOOL_SCHEMAS extends ToolSchemas = {}> =
  ToToolsWithDefinedExecute<{
    [K in keyof TOOL_SCHEMAS]: Tool<
      inferParameters<TOOL_SCHEMAS[K]['parameters']>,
      CallToolResult
    > & {
      execute: (
        args: inferParameters<TOOL_SCHEMAS[K]['parameters']>,
        options: ToolExecutionOptions,
      ) => PromiseLike<CallToolResult>;
    };
  }>;

export async function createMcpTools<TOOL_SCHEMAS extends ToolSchemas = {}>(
  config: AdapterConfig<TOOL_SCHEMAS>,
): Promise<AdapterReturnType<TOOL_SCHEMAS>> {
  const tools: Record<string, Tool> = {};
  const { client, cleanup } = await setupClient(config);

  try {
    const listToolsResult = await client.listTools();

    for (const { name, description, inputSchema } of listToolsResult.tools) {
      const parameters = config.tools?.[name]
        ? config.tools[name].parameters
        : jsonSchema(inputSchema as JSONSchema7);

      const toolWithExecute = tool({
        description,
        parameters,
        execute: async (
          args: inferParameters<typeof parameters>,
          options: ToolExecutionOptions,
        ): Promise<CallToolResult> => {
          options?.abortSignal?.throwIfAborted();

          const result = await client.callTool(
            {
              name,
              arguments: args,
            },
            CallToolResultSchema,
            {
              signal: options.abortSignal,
            },
          );
          const parsedResult = CallToolResultSchema.parse(result);
          return parsedResult as CallToolResult;
        },
      });

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
      message: `Failed to generate tools for ${config.transport.type} MCP server`,
      cause: error,
    });
  }
}

async function setupClient<TOOL_SCHEMAS extends ToolSchemas = {}>(
  config: AdapterConfig<TOOL_SCHEMAS>,
): Promise<{
  client: MCPClient;
  cleanup: () => Promise<void>;
}> {
  try {
    const client = await new MCPClient({
      transport: config.transport,
    }).init();

    return {
      client,
      cleanup: async () => {
        await client.close();
      },
    };
  } catch (error) {
    throw new AISDKError({
      name: 'McpClientSetupError',
      message: `Failed to connect to ${config.transport.type} MCP server`,
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
