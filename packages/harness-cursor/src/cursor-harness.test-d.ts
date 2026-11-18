import type { SandboxChannelReconnectOptions } from '@ai-sdk/harness/utils';
import { expectTypeOf, test } from 'vitest';
import { createCursor, type CursorHarnessSettings } from './cursor-harness';

test('accepts sandbox bridge connection settings', () => {
  const settings: CursorHarnessSettings = {
    keepAliveMs: 100,
    reconnect: {
      maxElapsedMs: 120_000,
      initialDelayMs: 100,
      maxDelayMs: 5_000,
    },
  };
  createCursor(settings);
  expectTypeOf(settings.keepAliveMs).toEqualTypeOf<number | undefined>();
  expectTypeOf(settings.reconnect).toEqualTypeOf<
    SandboxChannelReconnectOptions | undefined
  >();
});

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
    | 'write'
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
