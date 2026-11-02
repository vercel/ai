import {
  createACP,
  type ACPResolveHostToolCall,
  type ACPSource,
} from '@ai-sdk/harness-acp';
import type { HarnessV1PortEndpoint } from '@ai-sdk/harness';

const CURSOR_ACP_SOURCE = {
  type: 'install-command',
  command: 'curl https://cursor.com/install -fsS | bash',
} as const satisfies ACPSource;

/*
 * Cursor reports MCP tool calls with a `{ providerIdentifier, toolName, args }`
 * raw input, where `providerIdentifier` is the MCP server name.
 */
const resolveCursorACPHostToolCall: ACPResolveHostToolCall = ({
  toolCall,
  serverName,
  toolNames,
}) => {
  const rawInput = toolCall.rawInput;
  if (
    !isRecord(rawInput) ||
    rawInput.providerIdentifier !== serverName ||
    typeof rawInput.toolName !== 'string' ||
    !toolNames.includes(rawInput.toolName) ||
    !isRecord(rawInput.args)
  ) {
    return undefined;
  }
  return { toolName: rawInput.toolName, input: rawInput.args };
};

export type CursorACPHarnessSettings = {
  mcpServers?: Record<string, unknown>;
  mintBridgeToken?: (sandboxId: string) => string;
  port?: number;
  portEndpoint?: HarnessV1PortEndpoint;
  source?: ACPSource;
};

export function createCursorACP({
  mcpServers,
  mintBridgeToken,
  port,
  portEndpoint,
  source = CURSOR_ACP_SOURCE,
}: CursorACPHarnessSettings = {}) {
  return createACP({
    nonTextContentTypes: ['image'],
    harnessId: 'cursor-acp',
    mcpServers,
    resolveHostToolCall: resolveCursorACPHostToolCall,
    isMcpToolCall: toolCall => {
      const rawInput = toolCall.rawInput;
      return (
        isRecord(rawInput) &&
        typeof rawInput.providerIdentifier === 'string' &&
        typeof rawInput.toolName === 'string' &&
        isRecord(rawInput.args)
      );
    },
    mintBridgeToken,
    port,
    portEndpoint,
    source,
    executable: 'agent',
    args: ['--disable-auto-update', 'acp'],
    modelMapping: {
      type: 'session-config-option',
      path: 'model',
    },
    clientCapabilities: {
      _meta: { parameterizedModelPicker: true },
    },
    credentialEnv: ['CURSOR_API_KEY'],
    credentialBrokering: ({ env, sandboxEnv }) => {
      const credential = env.CURSOR_API_KEY;
      const sandboxCredential = sandboxEnv?.CURSOR_API_KEY;
      if (!credential || !sandboxCredential) return [];
      return [
        {
          match: {
            host: 'api2.cursor.sh',
            path: { exact: '/auth/exchange_user_api_key' },
            method: ['POST'],
            headers: [
              {
                key: { exact: 'Authorization' },
                value: { exact: `Bearer ${sandboxCredential}` },
              },
            ],
          },
          transform: {
            headers: { Authorization: `Bearer ${credential}` },
          },
        },
      ];
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
