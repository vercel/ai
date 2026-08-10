import { createACP, type ACPPermissionModeMapping } from '@ai-sdk/harness-acp';
import { claudeCodeACPBuiltinTools } from './builtin-tools';

const harnessId = 'acp-claude-code';

export const claudeCodeACPHarness = createACP({
  harnessId,
  builtinTools: claudeCodeACPBuiltinTools,
  source: {
    type: 'npm-simple',
    packageName: '@agentclientprotocol/claude-agent-acp',
    packageVersion: '0.61.0',
  },
  executable: 'claude-agent-acp',
  forwardEnv: ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'],
  env: {
    IS_SANDBOX: '1',
  },
  instructionMapping: {
    type: 'session-meta',
    path: ['systemPrompt', 'append'],
  },
  permissionModeMapping: {
    'allow-reads': { type: 'session-mode', modeId: 'default' },
    'allow-edits': { type: 'session-mode', modeId: 'acceptEdits' },
    'allow-all': { type: 'session-mode', modeId: 'bypassPermissions' },
  } as const satisfies ACPPermissionModeMapping,
  providerAuthentication: {
    gateway: {
      env: {
        ANTHROPIC_API_KEY: { $source: 'gateway-api-key' },
        ANTHROPIC_AUTH_TOKEN: { $source: 'gateway-api-key' },
        ANTHROPIC_BASE_URL: { $source: 'gateway-base-url' },
        CLAUDE_AGENT_SDK_CLIENT_APP: { $source: 'client-app' },
      },
    },
  },
});
