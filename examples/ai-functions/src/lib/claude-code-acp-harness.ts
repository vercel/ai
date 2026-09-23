import {
  createACP,
  type ACPAuthenticationMode,
  type ACPPermissionModeMapping,
  type ACPSource,
} from '@ai-sdk/harness-acp';
import type { HarnessV1PortEndpoint } from '@ai-sdk/harness';
import { createCredentialRequestTransformation } from '@ai-sdk/harness/utils';
import { claudeCodeACPAskUserQuestions } from './claude-code-acp-question-tool';

const CLAUDE_CODE_ACP_SOURCE = {
  type: 'npm-simple',
  packageName: '@agentclientprotocol/claude-agent-acp',
  packageVersion: '0.61.0',
} as const satisfies ACPSource;

export type ClaudeCodeACPHarnessSettings = {
  auth?: ACPAuthenticationMode;
  mintBridgeToken?: (sandboxId: string) => string;
  port?: number;
  portEndpoint?: HarnessV1PortEndpoint;
  source?: ACPSource;
};

export function createClaudeCodeACP({
  auth = 'auto',
  mintBridgeToken,
  port,
  portEndpoint,
  source = CLAUDE_CODE_ACP_SOURCE,
}: ClaudeCodeACPHarnessSettings = {}) {
  return createACP({
    harnessId: 'claude-code-acp',
    auth,
    askUserQuestions: claudeCodeACPAskUserQuestions,
    clientCapabilities: {
      elicitation: { form: {} },
    },
    mintBridgeToken,
    port,
    portEndpoint,
    source,
    executable: 'claude-agent-acp',
    modelMapping: {
      type: 'session-config-option',
      path: 'model',
    },
    credentialEnv: ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'],
    credentialBrokering: ({ env, sandboxEnv }) => {
      const transformations = [];
      if (env.ANTHROPIC_API_KEY && sandboxEnv?.ANTHROPIC_API_KEY) {
        transformations.push(
          createCredentialRequestTransformation({
            matchUrl: env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com',
            matchHeaders: { 'x-api-key': sandboxEnv.ANTHROPIC_API_KEY },
            transformHeaders: { 'x-api-key': env.ANTHROPIC_API_KEY },
          }),
        );
      }
      if (env.ANTHROPIC_AUTH_TOKEN && sandboxEnv?.ANTHROPIC_AUTH_TOKEN) {
        transformations.push(
          createCredentialRequestTransformation({
            matchUrl: env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com',
            matchHeaders: {
              Authorization: `Bearer ${sandboxEnv.ANTHROPIC_AUTH_TOKEN}`,
            },
            transformHeaders: {
              Authorization: `Bearer ${env.ANTHROPIC_AUTH_TOKEN}`,
            },
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
}
