import type { InferToolOutput } from '@ai-sdk/provider-utils';
import { describe, expectTypeOf, it } from 'vitest';
import { anthropic } from '../index';

describe('advisor_20260301 tool type', () => {
  it('accepts an optional maxTokens argument', () => {
    const advisorTool = anthropic.tools.advisor_20260301({
      model: 'claude-opus-4-8',
      maxTokens: 2048,
    });

    expectTypeOf<
      Parameters<typeof anthropic.tools.advisor_20260301>[0]
    >().toExtend<{
      model: string;
      maxTokens?: number;
    }>();

    expectTypeOf<InferToolOutput<typeof advisorTool>>().toMatchTypeOf<
      | {
          type: 'advisor_result';
          text: string;
          stopReason?: string;
        }
      | {
          type: 'advisor_redacted_result';
          encryptedContent: string;
          stopReason?: string;
        }
      | {
          type: 'advisor_tool_result_error';
          errorCode: string;
        }
    >();
  });
});
