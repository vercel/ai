import type { SandboxChannelReconnectOptions } from '@ai-sdk/harness/utils';
import { expectTypeOf, test } from 'vitest';
import { createDeepAgents, type DeepAgentsHarnessSettings } from './index';

test('accepts sandbox bridge reconnect settings', () => {
  const settings: DeepAgentsHarnessSettings = {
    reconnect: {
      maxElapsedMs: 120_000,
      initialDelayMs: 100,
      maxDelayMs: 5_000,
    },
  };

  createDeepAgents(settings);
  expectTypeOf(settings.reconnect).toEqualTypeOf<
    SandboxChannelReconnectOptions | undefined
  >();
});
