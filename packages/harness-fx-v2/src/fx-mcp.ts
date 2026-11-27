import type {
  HarnessV2ToolExecutionValue,
  HarnessV2TurnSettings,
} from '@ai-sdk/harness';
import {
  createMCPClient,
  type MCPClient,
  type ListToolsResult,
} from '@ai-sdk/mcp';
import type { JSONValue } from '@ai-sdk/provider';
import { createMcpAdapter } from 'libfx/mcp';
import type { FxHostTool, FxToolResult } from 'libfx/node';

/**
 * Serializable discovery snapshot; executable tools and connections never enter
 * this value, so it can be restored without contacting a server.
 */
export type FxMcpCatalog = {
  /**
   * Servers in configuration order, which also determines instruction order.
   */
  servers: Array<{
    /**
     * Local configuration key, not the server's self-reported identity.
     */
    name: string;
    /**
     * Instructions from the recorded initialization handshake.
     */
    instructions?: string;
    /**
     * Original definitions paired with stable, model-facing names.
     */
    tools: Array<{
      /**
       * Name resolved by this adapter before the model sees the tool.
       */
      name: string;
      /**
       * Original MCP definition, retained for native tool reconstruction.
       */
      definition: ListToolsResult['tools'][number];
    }>;
  }>;
};

/**
 * Turn-local native MCP access with discovery separated from executable tools.
 * Creating tools from a catalog does not open connections.
 */
export type FxMcpRuntime = {
  discover(options: { abortSignal: AbortSignal }): Promise<FxMcpCatalog>;
  createTools(options: { catalog: FxMcpCatalog }): Promise<FxHostTool[]>;
  close(): Promise<void>;
};

/**
 * Owns HTTP clients for one turn. Native libfx naming and conversion are reused
 * with cached definitions during replay, while real calls connect lazily.
 */
export function createFxMcpRuntime(options: {
  mcpServers: NonNullable<HarnessV2TurnSettings['mcpServers']>;
  abortSignal: AbortSignal;
}): FxMcpRuntime {
  const connections = new Map<string, Promise<MCPClient>>();
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    options.abortSignal.removeEventListener('abort', onAbort);
    await Promise.allSettled(
      [...connections.values()].map(async connection =>
        (await connection).close(),
      ),
    );
  };
  const onAbort = () => {
    void close();
  };
  options.abortSignal.addEventListener('abort', onAbort, { once: true });

  const connect = (name: string): Promise<MCPClient> => {
    options.abortSignal.throwIfAborted();
    if (closed) throw new Error('fx MCP runtime is closed.');
    let connection = connections.get(name);
    if (connection != null) return connection;
    const config = options.mcpServers[name];
    if (
      config == null ||
      (config.type !== undefined && config.type !== 'http')
    ) {
      throw new Error('fx MCP servers must use Streamable HTTP.');
    }
    connection = createMCPClient({
      transport: {
        type: 'http',
        url: config.url,
        headers: config.headers == null ? undefined : { ...config.headers },
      },
      initializationOptions: { signal: options.abortSignal },
    });
    connections.set(name, connection);
    return connection;
  };
  const prefix = (name: string) =>
    `mcp_${name.replace(/[^A-Za-z0-9_-]/g, '_')}_`;

  return {
    async discover({ abortSignal }) {
      try {
        const servers: FxMcpCatalog['servers'] = [];
        for (const name of Object.keys(options.mcpServers)) {
          const client = await connect(name);
          const definitions: ListToolsResult['tools'] = [];
          const adapter = await createMcpAdapter(
            {
              listTools: async params => {
                const page = await client.listTools({
                  params,
                  options: { signal: abortSignal },
                });
                definitions.push(...page.tools);
                return page;
              },
              callTool: () => {
                throw new Error('MCP discovery cannot execute tools.');
              },
            },
            { prefix: prefix(name) },
          );
          servers.push({
            name,
            instructions: client.instructions,
            tools: adapter.tools.map((tool, index) => ({
              name: tool.name,
              definition: definitions[index],
            })),
          });
        }
        return { servers };
      } catch (error) {
        await close();
        throw error;
      }
    },
    async createTools({ catalog }) {
      const tools: FxHostTool[] = [];
      for (const server of catalog.servers) {
        const adapter = await createMcpAdapter(
          {
            listTools: () => ({
              tools: server.tools.map(tool => tool.definition),
            }),
            callTool: async (input, _schema, context) =>
              (await connect(server.name)).callTool({
                name: input.name,
                arguments: input.arguments as Record<string, unknown>,
                options: {
                  signal:
                    context?.signal == null
                      ? options.abortSignal
                      : AbortSignal.any([options.abortSignal, context.signal]),
                },
              }),
          },
          { prefix: prefix(server.name) },
        );
        adapter.tools.forEach((tool, index) => {
          if (tool.name !== server.tools[index].name)
            throw new Error('fx MCP catalog names changed during replay.');
          tools.push({ ...tool, writes: true });
        });
      }
      return tools;
    },
    close,
  };
}

/**
 * Records native content conversion inside the tool effect, including the rich
 * content attached to a returned MCP error, so libfx receives it on replay too.
 */
export async function executeFxMcpTool(options: {
  tool: FxHostTool;
  input: unknown;
  executionId: string;
  sessionId: string;
  abortSignal: AbortSignal;
}): Promise<HarnessV2ToolExecutionValue> {
  let result: unknown;
  let isError = false;
  try {
    result = await options.tool.execute(options.input, {
      executionId: options.executionId,
      sessionId: options.sessionId,
      signal: options.abortSignal,
    });
  } catch (error) {
    if (options.abortSignal.aborted) throw error;
    const rich =
      error instanceof Error
        ? (error as Error & { toolResult?: FxToolResult }).toolResult
        : undefined;
    if (rich == null) throw error;
    result = rich;
    isError = true;
  }
  const rich =
    typeof result === 'object' &&
    result !== null &&
    'type' in result &&
    result.type === 'libfx.tool-result'
      ? (result as FxToolResult)
      : undefined;
  return {
    raw: result as JSONValue,
    modelOutput: {
      type: 'content',
      value: [
        {
          type: 'text',
          text:
            rich?.text ??
            (typeof result === 'string' ? result : JSON.stringify(result)),
        },
        ...(rich?.images ?? []).flatMap(image =>
          image.data === undefined
            ? []
            : [
                {
                  type: 'image-data' as const,
                  data: image.data,
                  mediaType: image.mimeType,
                },
              ],
        ),
      ],
    },
    isError,
  };
}
