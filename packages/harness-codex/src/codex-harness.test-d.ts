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
