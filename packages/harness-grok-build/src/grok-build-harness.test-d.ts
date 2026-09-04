import { expectTypeOf, test } from 'vitest';
import { createGrokBuild } from './grok-build-harness';

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
