import { HarnessCapabilityUnsupportedError } from '@ai-sdk/harness';
import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';
import { z } from 'zod/v4';
import type { FxTool } from './fx-runtime';

type FxMcpServerConfig = {
  url: string;
  type?: 'http' | 'sse' | 'streamableHttp';
  headers?: Record<string, string>;
};

const fxMcpServerConfigSchema = z.looseObject({
  url: z.string(),
  type: z.enum(['http', 'sse', 'streamableHttp']).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  disabled: z.boolean().optional(),
});

function parseFxMcpServerConfig({
  serverName,
  config,
}: {
  serverName: string;
  config: unknown;
}): FxMcpServerConfig | undefined {
  if (
    typeof config === 'object' &&
    config != null &&
    'disabled' in config &&
    config.disabled === true
  )
    return undefined;
  const parsed = fxMcpServerConfigSchema.safeParse(config);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  if (
    issue.path.length === 0 ||
    ['url', 'type'].includes(String(issue.path[0]))
  ) {
    throw new HarnessCapabilityUnsupportedError({
      harnessId: 'fx',
      message: `fx MCP server ${serverName} must use an HTTP or SSE URL. Command/stdio servers are not supported.`,
    });
  }
  throw new Error(
    `Invalid fx MCP server ${serverName} field ${issue.path.join('.')}: ${issue.message}`,
  );
}

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
      const config = parseFxMcpServerConfig({ serverName, config: rawConfig });
      if (!config) continue;
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
