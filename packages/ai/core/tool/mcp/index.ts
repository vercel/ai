import { jsonSchema } from '@ai-sdk/ui-utils';
import { AISDKError, JSONSchema7 } from '@ai-sdk/provider';
import {
  inferParameters,
  ToolParameters,
  Tool,
  tool,
  ToolExecutionOptions,
} from '../tool';
import { MCPClient } from './client';
import { CallToolResult, CallToolResultSchema, TransportConfig } from './types';
import { ToToolsWithDefinedExecute } from '../../generate-text/tool-result';

interface AdapterConfig<TOOL_SCHEMAS extends ToolSchemas = {}> {
  transport: TransportConfig;
  tools?: TOOL_SCHEMAS;
}

interface AdapterReturnType<TOOL_SCHEMAS extends ToolSchemas = {}> {
  tools: McpToolSet<TOOL_SCHEMAS>;
  close: () => Promise<void>;
}

type ToolSchemas = Record<string, { parameters: ToolParameters }>;

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
  const client = await new MCPClient({
    transport: config.transport,
  }).init();

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

          const result = await client.callTool({
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

    return {
      tools: tools as McpToolSet<TOOL_SCHEMAS>,
      close: async () => {
        await client.close();
      },
    };
  } catch (error) {
    await client.close();
    throw new AISDKError({
      name: 'McpToolAdapterError',
      message: `Failed to generate tools for ${config.transport.type} MCP server`,
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
