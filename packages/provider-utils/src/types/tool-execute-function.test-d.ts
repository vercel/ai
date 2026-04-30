import { describe, expectTypeOf, it } from 'vitest';
import type { Context } from './context';
import type { ModelMessage } from './model-message';
import type {
  ToolExecuteFunction,
  ToolExecutionOptions,
} from './tool-execute-function';

describe('tool execute function types', () => {
  it('should include execution metadata and typed context', () => {
    expectTypeOf<ToolExecutionOptions<{ requestId: string }>>().toEqualTypeOf<{
      toolCallId: string;
      messages: ModelMessage[];
      abortSignal?: AbortSignal;
      context: { requestId: string };
    }>();
  });

  it('should type the input, output, and execution options', () => {
    expectTypeOf<
      ToolExecuteFunction<{ city: string }, { temperature: number }, Context>
    >().toEqualTypeOf<
      (
        input: { city: string },
        options: ToolExecutionOptions<Context>,
      ) =>
        | AsyncIterable<{ temperature: number }>
        | PromiseLike<{ temperature: number }>
        | { temperature: number }
    >();
  });
});
