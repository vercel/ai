import type { SandboxChannelReconnectOptions } from '@ai-sdk/harness/utils';
import { expectTypeOf, test } from 'vitest';
import { createCodex, type CodexHarnessSettings } from './codex-harness';

test('accepts supported reasoning effort settings', () => {
  expectTypeOf<
    NonNullable<CodexHarnessSettings['reasoningEffort']>
  >().toEqualTypeOf<'low' | 'medium' | 'high' | 'xhigh' | 'max'>();

  for (const reasoningEffort of ['xhigh', 'max'] as const) {
    createCodex({ reasoningEffort });
  }
});

test('accepts sandbox bridge reconnect settings', () => {
  const settings: CodexHarnessSettings = {
    reconnect: {
      maxElapsedMs: 120_000,
      initialDelayMs: 100,
      maxDelayMs: 5_000,
    },
  };

  createCodex(settings);
  expectTypeOf(settings.reconnect).toEqualTypeOf<
    SandboxChannelReconnectOptions | undefined
  >();
});
