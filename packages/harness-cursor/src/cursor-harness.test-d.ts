import { expectTypeOf, test } from 'vitest';
import { createCursor } from './cursor-harness';

test('preserves Cursor built-in tool types', () => {
  const harness = createCursor({
    credentialForwarding: async ({ credential }) => credential,
    mintBridgeToken: sandboxId => sandboxId,
  });

  expectTypeOf<keyof typeof harness.builtinTools>().toEqualTypeOf<
    | 'bash'
    | 'delete'
    | 'glob'
    | 'grep'
    | 'read'
    | 'updateTodos'
    | 'readTodos'
    | 'edit'
    | 'ls'
    | 'readLints'
    | 'semanticSearch'
    | 'createPlan'
    | 'webSearch'
    | 'task'
    | 'listMcpResources'
    | 'readMcpResource'
    | 'applyAgentDiff'
    | 'fetch'
    | 'switchMode'
    | 'generateImage'
    | 'recordScreen'
    | 'computerUse'
    | 'writeShellStdin'
    | 'reflect'
    | 'setupVmEnvironment'
    | 'replaceEnv'
    | 'startGrindExecution'
    | 'startGrindPlanning'
    | 'webFetch'
    | 'reportBugfixResults'
  >();
});
