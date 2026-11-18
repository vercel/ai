import type { SandboxChannelReconnectOptions } from '@ai-sdk/harness/utils';
import { expectTypeOf, test } from 'vitest';
import { createDeepAgents, type DeepAgentsHarnessSettings } from './index';

test('accepts sandbox bridge connection settings', () => {
  const settings: DeepAgentsHarnessSettings = {
    keepaliveMs: 100,
    reconnect: {
      maxElapsedMs: 120_000,
      initialDelayMs: 100,
      maxDelayMs: 5_000,
    },
  };

  createDeepAgents(settings);
  expectTypeOf(settings.keepaliveMs).toEqualTypeOf<number | undefined>();
  expectTypeOf(settings.reconnect).toEqualTypeOf<
    SandboxChannelReconnectOptions | undefined
  >();
});
