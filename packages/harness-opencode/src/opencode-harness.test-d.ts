import type { SandboxChannelReconnectOptions } from '@ai-sdk/harness/utils';
import { describe, expectTypeOf, test } from 'vitest';
import { createOpenCode, type OpenCodeHarnessSettings } from './index';

describe('OpenCodeHarnessSettings', () => {
  test('accepts sandbox bridge reconnect settings', () => {
    const settings: OpenCodeHarnessSettings = {
      reconnect: {
        maxElapsedMs: 120_000,
        initialDelayMs: 100,
        maxDelayMs: 5_000,
      },
    };

    createOpenCode(settings);

    expectTypeOf(settings.reconnect).toEqualTypeOf<
      SandboxChannelReconnectOptions | undefined
    >();
  });
});
