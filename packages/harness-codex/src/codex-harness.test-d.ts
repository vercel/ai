import type { SandboxChannelReconnectOptions } from '@ai-sdk/harness/utils';
import type { InferToolInput } from '@ai-sdk/provider-utils';
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

test('exposes typed native patch and image tools', () => {
  const harness = createCodex();
  expectTypeOf<keyof typeof harness.builtinTools>().toEqualTypeOf<
    'bash' | 'webSearch' | 'apply_patch' | 'view_image'
  >();
  expectTypeOf<
    InferToolInput<typeof harness.builtinTools.apply_patch>
  >().toEqualTypeOf<string>();
  expectTypeOf<
    InferToolInput<typeof harness.builtinTools.view_image>
  >().toEqualTypeOf<{
    path: string;
    detail?: 'high' | 'original';
    environment_id?: string;
  }>();
});
