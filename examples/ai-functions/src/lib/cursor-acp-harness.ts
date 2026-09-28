import { createACP, type ACPSource } from '@ai-sdk/harness-acp';
import type { HarnessV1PortEndpoint } from '@ai-sdk/harness';

const CURSOR_ACP_SOURCE = {
  type: 'install-command',
  command: 'curl https://cursor.com/install -fsS | bash',
} as const satisfies ACPSource;

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
    harnessId: 'cursor-acp',
    mcpServers,
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
