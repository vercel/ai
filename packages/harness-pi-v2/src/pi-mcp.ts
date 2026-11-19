import type {
  HarnessV2ToolExecutionValue,
  HarnessV2TurnSettings,
} from '@ai-sdk/harness';
import type { JSONSchema7 } from '@ai-sdk/provider';
import {
  McpClient,
  StreamableHttpTransport,
  toLlmContent,
  type Tool,
} from '@earendil-works/pi-mcp';
import type { AgentToolResult } from '@earendil-works/pi-agent-core';
import { createHash } from 'node:crypto';
import type { PiHostAgentTool } from './pi-host-tools';
import type { PiRecorded } from './pi-log-state';
import { toJSONValue } from './to-json-value';
import { VERSION } from './version';

/**
 * Serializable discovery snapshot; executable tools and connections never enter
 * this value, so it can be restored without contacting a server.
 */
export type PiMcpCatalog = {
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
      definition: PiRecorded<Tool>;
    }>;
  }>;
};

/**
 * Turn-local native MCP access with discovery separated from executable tools.
 * Creating tools from a catalog does not open connections.
 */
export type PiMcpRuntime = {
  discover(options: { abortSignal: AbortSignal }): Promise<PiMcpCatalog>;
  createTools(options: { catalog: PiMcpCatalog }): PiHostAgentTool[];
  close(): Promise<void>;
};

/**
 * Pi's coding-agent MCP extension writes overflow text and binary resources
 * to host files. It offers no public output-writer hook, and those host paths
 * cannot be read by sandbox tools or recovered on another worker. Use Pi's
 * standalone client and filesystem-free content conversion instead. Text is
 * not truncated; images remain inline and unsupported binary content becomes
 * a placeholder. Connections and catalogs belong to one turn, not the host.
 */
export function createPiMcpRuntime(options: {
  mcpServers: NonNullable<HarnessV2TurnSettings['mcpServers']>;
  abortSignal: AbortSignal;
}): PiMcpRuntime {
  const clients = new Map<string, McpClient>();
  const connections = new Map<string, Promise<McpClient>>();
  let closed = false;

  const close = async () => {
    if (closed) return;
    closed = true;
    options.abortSignal.removeEventListener('abort', onAbort);
    await Promise.allSettled(
      [...clients.values()].map(client => client.close()),
    );
  };
  const onAbort = () => {
    void close();
  };
  options.abortSignal.addEventListener('abort', onAbort, { once: true });

  const connect = (name: string): Promise<McpClient> => {
    options.abortSignal.throwIfAborted();
    if (closed) throw new Error('Pi MCP runtime is closed.');
    let connection = connections.get(name);
    if (connection != null) return connection;
    const config = options.mcpServers[name];
    if (
      config == null ||
      (config.type !== undefined && config.type !== 'http')
    ) {
      throw new Error('Pi MCP servers must use Streamable HTTP.');
    }
    const client = new McpClient({
      name: 'ai-sdk-harness-pi',
      version: VERSION,
    });
    clients.set(name, client);
    connection = client
      .connect(
        new StreamableHttpTransport({
          url: config.url,
          headers: config.headers == null ? undefined : { ...config.headers },
          fetch: (input, init) =>
            fetch(input, {
              ...init,
              signal: AbortSignal.any([
                options.abortSignal,
                ...(init?.signal == null ? [] : [init.signal]),
              ]),
            }),
        }),
      )
      .then(() => client);
    connections.set(name, connection);
    return connection;
  };

  return {
    async discover({ abortSignal }) {
      try {
        const names = new Set<string>();
        const servers: PiMcpCatalog['servers'] = [];
        for (const name of Object.keys(options.mcpServers)) {
          abortSignal.throwIfAborted();
          const client = await connect(name);
          const tools = await client.listTools({ signal: abortSignal });
          const mapped = tools.map(definition => {
            const base = `mcp__${name}__${definition.name}`.replace(
              /[^A-Za-z0-9_]/g,
              '_',
            );
            const hash = createHash('sha256')
              .update(`${name}\0${definition.name}`)
              .digest('hex')
              .slice(0, 8);
            const exposed =
              base.length <= 64 && !names.has(base)
                ? base
                : `${base.slice(0, 55)}_${hash}`;
            if (names.has(exposed))
              throw new Error('Pi MCP tool names collide.');
            names.add(exposed);
            return {
              name: exposed,
              definition: toJSONValue({
                value: definition,
              }) as PiRecorded<Tool>,
            };
          });
          servers.push({
            name,
            instructions: client.instructions,
            tools: mapped,
          });
        }
        return { servers };
      } catch (error) {
        await close();
        throw error;
      }
    },
    createTools({ catalog }) {
      return catalog.servers.flatMap(server =>
        server.tools.map(
          ({ name, definition }): PiHostAgentTool => ({
            name,
            label: name,
            description: definition.description ?? '',
            parameters: definition.inputSchema as JSONSchema7,
            execute: async (_toolCallId, input, signal) => {
              const client = await connect(server.name);
              const result = await client.callTool(
                definition.name,
                input as Record<string, unknown>,
                {
                  signal:
                    signal == null
                      ? options.abortSignal
                      : AbortSignal.any([options.abortSignal, signal]),
                },
              );
              return {
                content: toLlmContent(result),
                details: result,
                isError: result.isError === true,
              };
            },
          }),
        ),
      );
    },
    close,
  };
}

/**
 * Preserves the server's complete result and Pi's filesystem-free model content
 * together, so recovery neither reconverts content nor loses returned errors.
 */
export function toPiMcpToolValue(options: {
  result: AgentToolResult<unknown>;
}): HarnessV2ToolExecutionValue {
  const { result } = options;
  return {
    raw: toJSONValue({ value: result.details }),
    modelOutput: {
      type: 'content',
      value: result.content.map(part =>
        part.type === 'text'
          ? { type: 'text', text: part.text }
          : { type: 'image-data', data: part.data, mediaType: part.mimeType },
      ),
    },
    isError: result.isError === true,
  };
}
