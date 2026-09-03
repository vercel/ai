import type { InferToolInput } from '@ai-sdk/provider-utils';
import { expectTypeOf, test } from 'vitest';
import {
  createGitHubCopilot,
  type GitHubCopilotBuiltinTools,
} from './github-copilot-harness';

test('preserves GitHub Copilot built-in tool types', () => {
  const harness = createGitHubCopilot({
    credentialForwarding: async ({ credential, environmentVariableName }) =>
      `${environmentVariableName}:${credential}`,
    mintBridgeToken: sandboxId => sandboxId,
  });

  expectTypeOf<keyof typeof harness.builtinTools>().toEqualTypeOf<
    | 'bash'
    | 'read_bash'
    | 'stop_bash'
    | 'list_bash'
    | 'view'
    | 'create'
    | 'edit'
    | 'web_fetch'
    | 'skill'
    | 'sql'
    | 'read_agent'
    | 'list_agents'
    | 'write_agent'
    | 'grep'
    | 'glob'
    | 'task'
  >();

  // @ts-expect-error unsupported reasoning effort
  createGitHubCopilot({ reasoningEffort: 'extreme' });

  // @ts-expect-error model is configured on HarnessAgent
  createGitHubCopilot({ model: 'gpt-5.4' });
});

test('narrows built-in tool call inputs', () => {
  type ReadAgentInput = InferToolInput<GitHubCopilotBuiltinTools['read_agent']>;
  expectTypeOf<ReadAgentInput['agent_id']>().toEqualTypeOf<string>();
  expectTypeOf<ReadAgentInput['since_turn']>().toEqualTypeOf<
    number | undefined
  >();
});
