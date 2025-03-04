import { z } from 'zod';
import { jsonSchema } from '@ai-sdk/ui-utils';
import { MCPClientError, JSONSchema7 } from '@ai-sdk/provider';
import { ToToolsWithDefinedExecute } from '../../generate-text/tool-result';
import {
  inferParameters,
  ToolParameters,
  Tool,
  tool,
  ToolExecutionOptions,
} from '../tool';
import { MCPClient } from './client';
import { CallToolResult, CallToolResultSchema, TransportConfig } from './types';

type ToolSchemas =
  | Record<string, { parameters: ToolParameters }>
  | 'automatic'
  | undefined;

interface AdapterConfig<TOOL_SCHEMAS extends ToolSchemas = 'automatic'> {
  transport: TransportConfig;
  tools?: TOOL_SCHEMAS;
}

interface AdapterReturnType<TOOL_SCHEMAS extends ToolSchemas = 'automatic'> {
  tools: McpToolSet<TOOL_SCHEMAS>;
  close: () => Promise<void>;
}

type McpToolSet<TOOL_SCHEMAS extends ToolSchemas = 'automatic'> =
  TOOL_SCHEMAS extends Record<string, { parameters: ToolParameters }>
    ? ToToolsWithDefinedExecute<{
        [K in keyof TOOL_SCHEMAS]: Tool<
          inferParameters<TOOL_SCHEMAS[K]['parameters']>,
          CallToolResult
        > & {
          execute: (
            args: inferParameters<TOOL_SCHEMAS[K]['parameters']>,
            options: ToolExecutionOptions,
          ) => PromiseLike<CallToolResult>;
        };
      }>
    : ToToolsWithDefinedExecute<{
        [k: string]: Tool<z.ZodUnknown, CallToolResult> & {
          execute: (
            args: unknown,
            options: ToolExecutionOptions,
          ) => PromiseLike<CallToolResult>;
        };
      }>;

export async function createMcpTools<
  TOOL_SCHEMAS extends ToolSchemas = 'automatic',
>({
  transport,
  tools: toolsConfig = 'automatic',
}: AdapterConfig<TOOL_SCHEMAS>): Promise<AdapterReturnType<TOOL_SCHEMAS>> {
  const tools: Record<string, Tool> = {};
  const client = await new MCPClient({
    transport,
  }).init();

  try {
    const listToolsResult = await client.listTools();

    // TODO(Grace): What if a user-provided tool is not listed?
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
    throw new MCPClientError({
      message: `Failed to generate tools for ${transport.type} MCP server`,
      cause: error,
    });
  }
}
