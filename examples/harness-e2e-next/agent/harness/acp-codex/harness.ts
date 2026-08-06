import { createACP, type ACPPermissionModeMapping } from '@ai-sdk/harness-acp';
import { codexACPBuiltinTools } from './builtin-tools';

const harnessId = 'acp-codex';

export const codexACPHarness = createACP({
  harnessId,
  builtinTools: codexACPBuiltinTools,
  implementation: {
    type: 'npm',
    mode: 'simple',
    packageName: '@agentclientprotocol/codex-acp',
    version: '1.1.4',
    executable: 'codex-acp',
    forwardEnv: ['CODEX_API_KEY', 'OPENAI_API_KEY'],
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
      env: {
        CODEX_API_KEY: { $source: 'gateway-api-key' },
        CODEX_CONFIG: {
          model: 'openai/gpt-5.6-sol',
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
});
