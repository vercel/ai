import { createACP } from '@ai-sdk/harness-acp';

const harnessId = 'acp-grok-build';

export const grokBuildACPHarness = createACP({
  harnessId,
  implementation: {
    type: 'npm',
    mode: 'simple',
    packageName: '@xai-official/grok',
    version: '0.2.111',
    executable: 'grok',
    args: ['agent', 'stdio'],
    envSources: {
      XAI_API_KEY: 'XAI_API_KEY',
    },
  },
  providerAuthentication: {
    gateway: {
      route: {
        type: 'launch',
        env: {
          GROK_DEFAULT_MODEL: 'openai/gpt-5.4',
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
  },
});
