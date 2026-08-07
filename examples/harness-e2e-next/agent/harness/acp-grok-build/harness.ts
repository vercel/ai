import { createACP } from '@ai-sdk/harness-acp';
import { grokBuildACPBuiltinTools } from './builtin-tools';

const harnessId = 'acp-grok-build';

export const grokBuildACPHarness = createACP({
  harnessId,
  builtinTools: grokBuildACPBuiltinTools,
  source: {
    type: 'npm-simple',
    packageName: '@xai-official/grok',
  },
  executable: 'grok',
  args: ['agent', 'stdio'],
  forwardEnv: ['XAI_API_KEY'],
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
