import { createACP, type ACPPermissionModeMapping } from '@ai-sdk/harness-acp';

const harnessId = 'acp-claude-code';

export const claudeCodeACPHarness = createACP({
  harnessId,
  implementation: {
    type: 'npm',
    mode: 'simple',
    packageName: '@agentclientprotocol/claude-agent-acp',
    version: '0.61.0',
    executable: 'claude-agent-acp',
    forwardEnv: ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'],
  },
  permissionModeMapping: {
    'allow-reads': { type: 'session-mode', modeId: 'plan' },
    'allow-edits': { type: 'session-mode', modeId: 'acceptEdits' },
    'allow-all': { type: 'session-mode', modeId: 'default' },
  } as const satisfies ACPPermissionModeMapping,
  providerAuthentication: {
    gateway: {
      route: {
        type: 'launch',
        env: {
          ANTHROPIC_API_KEY: { $source: 'gateway-api-key' },
          ANTHROPIC_AUTH_TOKEN: { $source: 'gateway-api-key' },
          ANTHROPIC_BASE_URL: { $source: 'gateway-base-url' },
          CLAUDE_AGENT_SDK_CLIENT_APP: { $source: 'client-app' },
        },
      },
    },
  },
});
