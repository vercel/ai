import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  StdioClientTransport,
  StdioServerParameters,
} from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  SSEClientTransport,
  SSEClientTransportOptions,
} from '@modelcontextprotocol/sdk/client/sse.js';
import {
  ListToolsResult,
  CallToolResultSchema,
  CallToolResult,
} from '@modelcontextprotocol/sdk/types';
import { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol';

import { jsonSchema, Schema } from '@ai-sdk/ui-utils';
import { JSONSchema7 } from '@ai-sdk/provider';

import { inferParameters, Tool } from './tool';
import { z } from 'zod';

type McpStdioServerConfig = StdioServerParameters & {
  type: 'stdio';
};
interface McpSSEServerConfig {
  type: 'sse';
  url: string;
  options?: SSEClientTransportOptions;
}
type McpServerConfig = McpStdioServerConfig | McpSSEServerConfig;

interface CreateMcpToolsConfig {
  servers: Record<string, McpServerConfig>;
  toolCallOptions?: RequestOptions;
}

type McpCallToolInputSchema = z.ZodType<any, any, any> | Schema<any>;
type McpToolSchemaMap = Record<string, { input: McpCallToolInputSchema }>;
interface McpToolset<TToolSchemas extends McpToolSchemaMap = {}> {
  tools: {
    [K in keyof TToolSchemas]: Tool<
      inferParameters<TToolSchemas[K]['input']>,
      CallToolResult
    >;
  };
  clients: Record<string, Client>;
}

// Based off: https://github.com/dnakov/claude-code/blob/da716d77b251868918bb5776377f85a18a47ffdf/src/services/mcpClient.ts#L224
async function connectToServer(
  name: string,
  serverConfig: McpServerConfig,
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

  const client = new Client(
    {
      name: `${name}-client`,
      version: '0.1.0',
    },
    {
      capabilities: {},
    },
  );

  const CONNECTION_TIMEOUT_MS = 5000;
  const connectPromise = client.connect(transport);
  const timeoutPromise = new Promise<never>((_, reject) => {
    const timeoutId = setTimeout(() => {
      reject(
        new Error(
          `Connection to MCP server "${name}" timed out after ${CONNECTION_TIMEOUT_MS}ms`,
        ),
      );
    }, CONNECTION_TIMEOUT_MS);

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
    if (error instanceof Error) {
      throw new Error(
        `Failed to connect to MCP server "${name}". ${error.message}`,
        { cause: error },
      );
    }
    throw error;
  }

  return client;
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
 * Get Lars review on:
 * - Generic type approach for dynamic input parameters
 * - Which package to add to? Core is okie?
 */

/**
 * Add tests, web socket impl. for `msw`
 * Read: https://mswjs.io/docs/basics/handling-websocket-events
 * Also add new example(s) for MCP stdio (and SSE?)
 */

/**
 * Overall improvement of error handling
 */

export async function createMcpTools<
  TToolSchemas extends McpToolSchemaMap = {},
>(config: CreateMcpToolsConfig): Promise<McpToolset<TToolSchemas>> {
  const toolSet: McpToolset<TToolSchemas> = {
    tools: {} as McpToolset<TToolSchemas>['tools'],
    clients: {},
  };

  const clientConnections = await Promise.allSettled(
    Object.entries(config.servers).map(async ([name, serverConfig]) => {
      const client = await connectToServer(name, serverConfig);
      return { name, client };
    }),
  );

  await Promise.all(
    clientConnections.map(async result => {
      if (result.status === 'fulfilled') {
        const { name, client } = result.value;
        toolSet.clients[name] = client;

        try {
          const listToolsResult: ListToolsResult = await client.listTools();

          for (const tool of listToolsResult.tools) {
            const toolName = `${name}:${tool.name}` as keyof TToolSchemas;
            const parameters = jsonSchema(tool.inputSchema as JSONSchema7);

            (toolSet.tools[toolName] as any) = {
              description: tool.description,
              parameters,
              execute: async <T extends inferParameters<typeof parameters>>(
                args: T,
              ): Promise<CallToolResult> => {
                const result = await client.callTool(
                  {
                    name: tool.name,
                    arguments: args as Record<string, unknown>,
                  },
                  CallToolResultSchema,
                  config.toolCallOptions,
                );
                return result as CallToolResult;
              },
            };
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          throw new Error(
            `Failed to list tools for server ${name}: ${errorMessage}`,
          );
        }
      } else {
        throw new Error(`Failed to connect to server: ${result.reason}`);
      }
    }),
  );

  return toolSet;
}
