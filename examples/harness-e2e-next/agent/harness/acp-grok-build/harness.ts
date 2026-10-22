import { createACP } from '@ai-sdk/harness-acp';
import { createCredentialRequestTransformation } from '@ai-sdk/harness/utils';
import { grokBuildACPBuiltinTools } from './builtin-tools';

const harnessId = 'acp-grok-build';

export const grokBuildACPHarness = createACP({
  harnessId,
  builtinTools: grokBuildACPBuiltinTools,
  isMcpToolCall: toolCall => {
    const metadata = toolCall._meta?.['x.ai/tool'];
    return isRecord(metadata) && metadata.namespace === 'mcp';
  },
  source: {
    type: 'install-command',
    command:
      'curl -fsSL https://x.ai/cli/install.sh | GROK_BIN_DIR="$HOME/.local/bin" bash',
  },
  executable: 'grok',
  args: ['agent', 'stdio'],
  modelMapping: {
    type: 'session-model',
    path: 'modelId',
  },
  credentialEnv: ['XAI_API_KEY'],
  credentialBrokering: ({ env, sandboxEnv }) => {
    if (!env.XAI_API_KEY || !sandboxEnv?.XAI_API_KEY) return [];
    return [
      createCredentialRequestTransformation({
        matchUrl: env.GROK_XAI_API_BASE_URL ?? 'https://api.x.ai/v1',
        matchHeaders: {
          Authorization: `Bearer ${sandboxEnv.XAI_API_KEY}`,
        },
        transformHeaders: { Authorization: `Bearer ${env.XAI_API_KEY}` },
      }),
    ];
  },
  instructionMapping: {
    type: 'filesystem',
    path: '.grok/AGENTS.md',
  },
  providerAuthentication: {
    gateway: {
      env: {
        GROK_CLIENT_NAME: { $source: 'client-app-name' },
        GROK_CLIENT_VERSION: { $source: 'client-app-version' },
        XAI_API_KEY: { $source: 'gateway-api-key' },
        GROK_XAI_API_BASE_URL: {
          $source: 'gateway-base-url',
          ensureSuffix: '/v1',
        },
        GROK_MODELS_BASE_URL: {
          $source: 'gateway-base-url',
          ensureSuffix: '/v1',
        },
      },
    },
  },
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
