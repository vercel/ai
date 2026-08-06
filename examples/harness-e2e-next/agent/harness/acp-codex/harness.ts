import { createACP, type ACPPermissionModeMapping } from '@ai-sdk/harness-acp';

const harnessId = 'acp-codex';
const codexConfig = {
  features: {
    code_mode_only: true,
  },
  developer_instructions:
    'ACP MCP tools may be deferred in Code Mode. Before claiming an ACP MCP tool is unavailable, use exec to inspect ALL_TOOLS by name and description, then invoke the selected tool through the global tools object.',
};

export const codexACPHarness = createACP({
  harnessId,
  implementation: {
    type: 'npm',
    mode: 'simple',
    packageName: '@agentclientprotocol/codex-acp',
    version: '1.1.4',
    executable: 'codex-acp',
    forwardEnv: ['CODEX_API_KEY', 'OPENAI_API_KEY'],
    env: {
      CODEX_CONFIG: JSON.stringify(codexConfig),
    },
  },
  permissionModeMapping: {
    'allow-reads': { type: 'session-mode', modeId: 'read-only' },
    'allow-edits': { type: 'session-mode', modeId: 'agent-full-access' },
    'allow-all': { type: 'session-mode', modeId: 'agent-full-access' },
  } as const satisfies ACPPermissionModeMapping,
  authentication: {
    methodId: 'api-key',
  },
  providerAuthentication: {
    gateway: {
      route: {
        type: 'launch',
        env: {
          CODEX_API_KEY: { $source: 'gateway-api-key' },
          CODEX_CONFIG: {
            ...codexConfig,
            model: 'openai/gpt-5.5',
            model_provider: 'ai_gateway',
            model_providers: {
              ai_gateway: {
                name: 'AI Gateway',
                base_url: {
                  $source: 'gateway-base-url',
                  ensureSuffix: '/v1',
                },
                env_key: 'CODEX_API_KEY',
                wire_api: 'responses',
                supports_websockets: false,
                http_headers: {
                  'User-Agent': { $source: 'client-app' },
                  'x-client-app': { $source: 'client-app' },
                },
              },
            },
            model_supports_reasoning_summaries: true,
            preferred_auth_method: 'apikey',
          },
        },
      },
    },
  },
});
