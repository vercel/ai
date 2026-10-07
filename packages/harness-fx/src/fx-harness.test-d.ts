import type { SandboxChannelReconnectOptions } from '@ai-sdk/harness/utils';
import { expectTypeOf, test } from 'vitest';
import { createFx, type FxHarnessSettings } from './fx-harness';

test('accepts sandbox bridge reconnect settings', () => {
  const settings: FxHarnessSettings = {
    reconnect: {
      maxElapsedMs: 120_000,
      initialDelayMs: 100,
      maxDelayMs: 5_000,
    },
  };
  createFx(settings);
  expectTypeOf(settings.reconnect).toEqualTypeOf<
    SandboxChannelReconnectOptions | undefined
  >();
});

test('preserves fx built-in tool types', () => {
  const harness = createFx({
    credentialForwarding: async ({ credential }) => credential,
    mintBridgeToken: sandboxId => sandboxId,
  });

  expectTypeOf<keyof typeof harness.builtinTools>().toEqualTypeOf<
    | 'glob'
    | 'grep'
    | 'webSearch'
    | 'list_files'
    | 'read_file'
    | 'write_file'
    | 'edit_file'
    | 'delete_file'
    | 'rename_file'
    | 'copy_file'
    | 'create_folder'
    | 'file_info'
    | 'memory'
    | 'semantic_search'
    | 'open_file'
    | 'web_fetch'
    | 'terminal'
    | 'skill'
    | 'install_skill'
    | 'subagent'
    | 'mcp_search_tools'
    | 'capability_search'
    | 'mcp_select_tool'
    | 'mcp_features'
    | 'shell'
    | 'ask_user_question'
    | 'vision'
    | 'read_tool_result'
  >();
});
