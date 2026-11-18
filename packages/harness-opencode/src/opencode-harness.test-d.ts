import type { SandboxChannelReconnectOptions } from '@ai-sdk/harness/utils';
import { describe, expectTypeOf, test } from 'vitest';
import { createOpenCode, type OpenCodeHarnessSettings } from './index';

describe('OpenCodeHarnessSettings', () => {
  test('accepts direct authentication', () => {
    const settings: OpenCodeHarnessSettings = {
      auth: 'direct',
      provider: 'github-copilot',
    };

    createOpenCode(settings);
  });

  test('accepts sandbox bridge connection settings', () => {
    const settings: OpenCodeHarnessSettings = {
      keepaliveMs: 100,
      reconnect: {
        maxElapsedMs: 120_000,
        initialDelayMs: 100,
        maxDelayMs: 5_000,
      },
    };

    createOpenCode(settings);

    expectTypeOf(settings.keepaliveMs).toEqualTypeOf<number | undefined>();
    expectTypeOf(settings.reconnect).toEqualTypeOf<
      SandboxChannelReconnectOptions | undefined
    >();
  });
});
