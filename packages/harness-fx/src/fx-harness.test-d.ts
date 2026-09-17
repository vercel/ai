import { expectTypeOf, test } from 'vitest';
import { createFx } from './fx-harness';

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
    | 'mcp_select_tool'
    | 'mcp_features'
    | 'ask_user_question'
    | 'vision'
    | 'read_tool_result'
  >();
});
