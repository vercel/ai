import { createACP, type ACPPermissionModeMapping } from '@ai-sdk/harness-acp';
import { createCredentialRequestTransformation } from '@ai-sdk/harness/utils';
import { claudeCodeACPBuiltinTools } from './builtin-tools';
import { claudeCodeACPAskUserQuestions } from './question-tool';

const harnessId = 'acp-claude-code';

export const claudeCodeACPHarness = createACP({
  harnessId,
  builtinTools: claudeCodeACPBuiltinTools,
  askUserQuestions: claudeCodeACPAskUserQuestions,
  isMcpToolCall: toolCall => {
    const metadata = toolCall._meta?.claudeCode;
    return (
      isRecord(metadata) &&
      typeof metadata.toolName === 'string' &&
      metadata.toolName.startsWith('mcp__')
    );
  },
  source: {
    type: 'npm-simple',
    packageName: '@agentclientprotocol/claude-agent-acp',
    packageVersion: '0.61.0',
  },
  executable: 'claude-agent-acp',
  modelMapping: {
    type: 'session-config-option',
    path: 'model',
  },
  clientCapabilities: {
    elicitation: { form: {} },
  },
  credentialEnv: ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'],
  credentialBrokering: ({ env, sandboxEnv }) => {
    const apiKey = env.ANTHROPIC_API_KEY;
    const authToken = env.ANTHROPIC_AUTH_TOKEN;
    const sandboxApiKey = sandboxEnv?.ANTHROPIC_API_KEY;
    const sandboxAuthToken = sandboxEnv?.ANTHROPIC_AUTH_TOKEN;
    const transformations = [];
    if (apiKey && sandboxApiKey) {
      transformations.push(
        createCredentialRequestTransformation({
          matchUrl: env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com',
          matchHeaders: { 'x-api-key': sandboxApiKey },
          transformHeaders: { 'x-api-key': apiKey },
        }),
      );
    }
    if (authToken && sandboxAuthToken) {
      transformations.push(
        createCredentialRequestTransformation({
          matchUrl: env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com',
          matchHeaders: {
            Authorization: `Bearer ${sandboxAuthToken}`,
          },
          transformHeaders: { Authorization: `Bearer ${authToken}` },
        }),
      );
    }
    return transformations;
  },
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
