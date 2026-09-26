import type { SandboxChannelReconnectOptions } from '@ai-sdk/harness/utils';
import { expectTypeOf, test } from 'vitest';
import {
  createGrokBuild,
  type GrokBuildHarnessSettings,
} from './grok-build-harness';

test('accepts sandbox bridge reconnect settings', () => {
  const settings: GrokBuildHarnessSettings = {
    reconnect: {
      maxElapsedMs: 120_000,
      initialDelayMs: 100,
      maxDelayMs: 5_000,
    },
  };
  createGrokBuild(settings);
  expectTypeOf(settings.reconnect).toEqualTypeOf<
    SandboxChannelReconnectOptions | undefined
  >();
});

test('preserves Grok Build built-in tool types', () => {
  const harness = createGrokBuild({
    credentialForwarding: async ({ credential }) => credential,
    mintBridgeToken: sandboxId => sandboxId,
    reasoningEffort: 'high',
  });

  expectTypeOf<keyof typeof harness.builtinTools>().toEqualTypeOf<
    | 'bash'
    | 'edit'
    | 'grep'
    | 'webSearch'
    | 'write'
    | 'read_file'
    | 'list_dir'
    | 'kill_command_or_subagent'
    | 'todo_write'
    | 'get_command_or_subagent_output'
    | 'spawn_subagent'
    | 'scheduler_create'
    | 'scheduler_delete'
    | 'scheduler_list'
    | 'monitor'
    | 'search_tool'
    | 'use_tool'
    | 'workflow'
    | 'enter_plan_mode'
    | 'exit_plan_mode'
    | 'askUserQuestions'
    | 'image_gen'
    | 'image_edit'
    | 'image_to_video'
    | 'reference_to_video'
  >();
});
