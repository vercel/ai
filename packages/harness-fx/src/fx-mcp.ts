import { HarnessCapabilityUnsupportedError } from '@ai-sdk/harness';
import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';
import type { FxTool } from './fx-runtime';

export type FxMcpRuntime = {
  tools: FxTool[];
  instructions: string;
  close(): Promise<void>;
};

export async function createFxMcpRuntime(options: {
  mcpServers?: Record<string, unknown>;
  abortSignal?: AbortSignal;
}): Promise<FxMcpRuntime> {
  const clients: MCPClient[] = [];
  const tools: FxTool[] = [];
  const instructions: string[] = [];
  const packageName: string = 'libfx/mcp';
  const { createMcpAdapter } = (await import(packageName)) as {
    createMcpAdapter(
      client: unknown,
      options: { prefix: string },
    ): Promise<{ tools: FxTool[] }>;
  };
  const close = async () => {
    await Promise.all(clients.map(client => client.close()));
  };
  try {
    for (const [serverName, rawConfig] of Object.entries(
      options.mcpServers ?? {},
    )) {
      const config = rawConfig as {
        type?: string;
        url?: string;
        headers?: Record<string, string>;
        disabled?: boolean;
      };
      if (config?.disabled) continue;
      if (
        typeof config?.url !== 'string' ||
        !['http', 'sse', 'streamableHttp'].includes(config.type ?? 'http')
      ) {
        throw new HarnessCapabilityUnsupportedError({
          harnessId: 'fx',
          message: `fx MCP server ${serverName} must use an HTTP or SSE URL. Command/stdio servers are not supported.`,
        });
      }
      const client = await createMCPClient({
        transport: {
          type: config.type === 'sse' ? 'sse' : 'http',
          url: config.url,
          headers: config.headers,
        },
        initializationOptions: { signal: options.abortSignal },
      });
      clients.push(client);
      if (client.instructions) instructions.push(client.instructions);
      const adapter = await createMcpAdapter(
        {
          listTools: (input?: { cursor?: string }) =>
            client.listTools({ params: input }),
          callTool: (
            input: { name: string; arguments?: Record<string, unknown> },
            _unused: unknown,
            context: { signal: AbortSignal },
          ) =>
            client.callTool({ ...input, options: { signal: context.signal } }),
        },
        { prefix: `mcp_${serverName.replace(/[^A-Za-z0-9_-]/g, '_')}_` },
      );
      tools.push(...adapter.tools);
    }
  } catch (error) {
    await close().catch(() => {});
    throw error;
  }
  return { tools, instructions: instructions.join('\n\n'), close };
}
