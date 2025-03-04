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
  tools: 'automatic' | TOOL_SCHEMAS;
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

export async function createMcpTools<TOOL_SCHEMAS extends ToolSchemas = {}>({
  transport,
  tools: toolsConfig = 'automatic',
}: AdapterConfig<TOOL_SCHEMAS>): Promise<AdapterReturnType<TOOL_SCHEMAS>> {
  const tools: Record<string, Tool> = {};
  const client = await new MCPClient({
    transport,
  }).init();

  try {
    const listToolsResult = await client.listTools();

    for (const { name, description, inputSchema } of listToolsResult.tools) {
      if (toolsConfig !== 'automatic' && !(name in toolsConfig)) {
        continue;
      }

      // TODO(Grace): What if the user-provided input schema is invalid?
      const parameters =
        toolsConfig === 'automatic'
          ? jsonSchema(inputSchema as JSONSchema7)
          : toolsConfig[name].parameters;

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
      message: `Failed to generate tools for ${transport.type} MCP server`,
      cause: error,
    });
  }
}
