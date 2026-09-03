import type { AgentTool } from '@cline/agents';
import type {
  CreateMcpToolsOptions,
  McpManager,
  McpManagerOptions,
  McpServerClientFactory,
  McpServerRegistration,
  McpServerTransportConfig,
} from '@cline/core';

const CLINE_CORE_PACKAGE: string = '@cline/core';

type ClineCoreMcpModule = {
  createDefaultMcpServerClientFactory(): McpServerClientFactory;
  createMcpTools(options: CreateMcpToolsOptions): Promise<AgentTool[]>;
  InMemoryMcpManager: new (options: McpManagerOptions) => McpManager;
};

export interface ClineMcpRuntime {
  readonly tools: ReadonlyArray<AgentTool>;
  readonly toolNames: ReadonlySet<string>;
  dispose(): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function optionalStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
    ? value
    : undefined;
}

function optionalStringRecord(
  value: unknown,
): Record<string, string> | undefined {
  return isRecord(value) &&
    Object.values(value).every(item => typeof item === 'string')
    ? (value as Record<string, string>)
    : undefined;
}

function resolveTransport(input: {
  serverName: string;
  config: Record<string, unknown>;
}): McpServerTransportConfig {
  if (isRecord(input.config.transport)) {
    return input.config.transport as unknown as McpServerTransportConfig;
  }

  if (typeof input.config.command === 'string') {
    const args = optionalStringArray(input.config.args);
    const env = optionalStringRecord(input.config.env);
    return {
      type: 'stdio',
      command: input.config.command,
      ...(args ? { args } : {}),
      ...(typeof input.config.cwd === 'string'
        ? { cwd: input.config.cwd }
        : {}),
      ...(env ? { env } : {}),
    };
  }

  if (typeof input.config.url === 'string') {
    const configuredType = input.config.type ?? input.config.transportType;
    const headers = optionalStringRecord(input.config.headers);
    return {
      type:
        configuredType === 'http' || configuredType === 'streamableHttp'
          ? 'streamableHttp'
          : 'sse',
      url: input.config.url,
      ...(headers ? { headers } : {}),
    };
  }

  throw new Error(
    `Cline MCP server ${JSON.stringify(input.serverName)} must define a transport, command, or URL.`,
  );
}

function resolveRegistration(input: {
  serverName: string;
  config: unknown;
}): McpServerRegistration {
  if (!isRecord(input.config)) {
    throw new Error(
      `Cline MCP server ${JSON.stringify(input.serverName)} must be configured with an object value.`,
    );
  }

  return {
    name: input.serverName,
    transport: resolveTransport({
      serverName: input.serverName,
      config: input.config,
    }),
    ...(typeof input.config.disabled === 'boolean'
      ? { disabled: input.config.disabled }
      : {}),
    ...(isRecord(input.config.metadata)
      ? { metadata: input.config.metadata }
      : {}),
    ...(isRecord(input.config.oauth) ? { oauth: input.config.oauth } : {}),
  };
}

export async function createClineMcpRuntime(input: {
  mcpServers: Record<string, unknown> | undefined;
}): Promise<ClineMcpRuntime> {
  if (input.mcpServers == null || Object.keys(input.mcpServers).length === 0) {
    return {
      tools: [],
      toolNames: new Set(),
      dispose: async () => {},
    };
  }

  const {
    createDefaultMcpServerClientFactory,
    createMcpTools,
    InMemoryMcpManager,
  } = (await import(CLINE_CORE_PACKAGE)) as ClineCoreMcpModule;
  const manager = new InMemoryMcpManager({
    clientFactory: createDefaultMcpServerClientFactory(),
  });
  const tools: AgentTool[] = [];

  try {
    for (const [serverName, config] of Object.entries(input.mcpServers)) {
      const registration = resolveRegistration({ serverName, config });
      await manager.registerServer(registration);
      if (registration.disabled) continue;
      tools.push(
        ...(await createMcpTools({
          serverName,
          provider: manager,
        })),
      );
    }
  } catch (error) {
    await manager.dispose().catch(() => {});
    throw error;
  }

  return {
    tools,
    toolNames: new Set(tools.map(tool => tool.name)),
    dispose: async () => manager.dispose(),
  };
}
