import type {
  InferToolInput,
  InferToolOutput,
  ProviderExecutedTool,
} from '@ai-sdk/provider-utils';
import { describe, expectTypeOf, it } from 'vitest';
import { advisor_20260301 } from './advisor_20260301';

type AdvisorInput = {};

type AdvisorOutput =
  | { type: 'advisor_result'; text: string }
  | { type: 'advisor_redacted_result'; encryptedContent: string }
  | { type: 'advisor_tool_result_error'; errorCode: string };

describe('advisor_20260301 tool type', () => {
  it('has empty input and a discriminated-union output', () => {
    const advisor = advisor_20260301({ model: 'claude-opus-4-7' });

    expectTypeOf(advisor).toExtend<
      ProviderExecutedTool<AdvisorInput, AdvisorOutput, {}>
    >();

    expectTypeOf<
      InferToolInput<typeof advisor>
    >().toEqualTypeOf<AdvisorInput>();
    expectTypeOf<
      InferToolOutput<typeof advisor>
    >().toEqualTypeOf<AdvisorOutput>();
  });

  it('requires the model argument', () => {
    advisor_20260301({ model: 'claude-opus-4-7' });

    // @ts-expect-error model is required
    advisor_20260301({});
  });

  it('accepts optional maxUses and caching options', () => {
    advisor_20260301({
      model: 'claude-opus-4-7',
      maxUses: 3,
      caching: { type: 'ephemeral', ttl: '1h' },
    });
  });
});
