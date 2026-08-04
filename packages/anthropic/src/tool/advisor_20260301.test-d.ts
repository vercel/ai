import { describe, expectTypeOf, it } from 'vitest';
import { anthropic } from '../index';

describe('advisor_20260301 tool type', () => {
  it('accepts an optional maxTokens argument', () => {
    anthropic.tools.advisor_20260301({
      model: 'claude-opus-4-8',
      maxTokens: 2048,
    });

    expectTypeOf<
      Parameters<typeof anthropic.tools.advisor_20260301>[0]
    >().toExtend<{
      model: string;
      maxTokens?: number;
    }>();
  });
});
