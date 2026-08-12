import { createACP } from '@ai-sdk/harness-acp';
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
    type: 'npm-simple',
    packageName: '@xai-official/grok',
    packageVersion: '0.2.111',
  },
  executable: 'grok',
  args: ['agent', 'stdio'],
  forwardEnv: ['XAI_API_KEY'],
  instructionMapping: {
    type: 'session-meta',
    path: ['rules'],
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
