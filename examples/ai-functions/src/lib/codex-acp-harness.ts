import {
  createACP,
  type ACPAuthOptions,
  type ACPPermissionModeMapping,
} from '@ai-sdk/harness-acp';
import { commonTool } from '@ai-sdk/harness';
import { z } from 'zod';

const CODEX_ACP_IMPLEMENTATION = {
  type: 'npm',
  mode: 'simple',
  packageName: '@agentclientprotocol/codex-acp',
  version: '1.1.4',
  executable: 'codex-acp',
} as const;

const CODEX_ACP_BUILTIN_TOOLS = {
  bash: commonTool('bash', {
    nativeName: 'shell',
    toolUseKind: 'bash',
    inputSchema: z.object({
      command: z.string(),
      cwd: z.string().optional(),
    }),
  }),
} as const;

const CODEX_ACP_PERMISSION_MODE_MAPPING = {
  'allow-reads': { type: 'session-mode', modeId: 'read-only' },
  'allow-edits': { type: 'session-mode', modeId: 'agent-full-access' },
  'allow-all': { type: 'session-mode', modeId: 'agent-full-access' },
} as const satisfies ACPPermissionModeMapping;

export function createCodexACP({
  auth = 'auto',
  webSearch,
  acquisition,
  permissionModeMapping = CODEX_ACP_PERMISSION_MODE_MAPPING,
}: {
  auth?: ACPAuthOptions;
  webSearch?: boolean;
  acquisition?:
    | { mode: 'simple' }
    | {
        mode: 'locked';
        packageJson: string;
        pnpmLockYaml: string;
      };
  permissionModeMapping?: ACPPermissionModeMapping;
} = {}) {
  const codexConfig = {
    features: {
      code_mode_only: true,
    },
    developer_instructions:
      'ACP MCP tools may be deferred in Code Mode. Before claiming an ACP MCP tool is unavailable, use exec to inspect ALL_TOOLS by name and description, then invoke the selected tool through the global tools object.',
    ...(webSearch ? { web_search: 'live' } : {}),
  };
  const implementation =
    acquisition?.mode === 'locked'
      ? ({
          type: 'npm',
          mode: 'locked',
          packageJson: acquisition.packageJson,
          pnpmLockYaml: acquisition.pnpmLockYaml,
          executable: CODEX_ACP_IMPLEMENTATION.executable,
        } as const)
      : CODEX_ACP_IMPLEMENTATION;

  return createACP({
    harnessId: 'codex-acp',
    auth,
    implementation: {
      ...implementation,
      forwardEnv: ['CODEX_API_KEY', 'OPENAI_API_KEY'],
      env: {
        CODEX_CONFIG: JSON.stringify(codexConfig),
      },
    },
    builtinTools: CODEX_ACP_BUILTIN_TOOLS,
    permissionModeMapping,
    authentication: {
      methodId: 'api-key',
    },
    providerAuthentication: {
      gateway: {
        route: {
          type: 'auth-method',
          methodId: 'gateway',
          env: {
            CODEX_CONFIG: JSON.stringify({
              ...codexConfig,
              model: 'openai/gpt-5.5',
            }),
          },
          clientCapabilities: {
            auth: {
              _meta: {
                gateway: true,
              },
            },
          },
          meta: {
            gateway: {
              baseUrl: {
                $source: 'gateway-base-url',
                ensureSuffix: '/v1',
              },
              headers: {
                Authorization: { $source: 'gateway-authorization' },
                'User-Agent': { $source: 'client-app' },
                'x-client-app': { $source: 'client-app' },
              },
              providerName: 'AI Gateway',
            },
          },
        },
      },
    },
  });
}
