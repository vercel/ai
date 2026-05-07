import { describe, expectTypeOf, it } from 'vitest';
import type { Context } from './context';
import type { ModelMessage } from './model-message';
import type { Sandbox } from './sandbox';
import type {
  ToolExecuteFunction,
  ToolExecutionOptions,
} from './tool-execute-function';

describe('tool execute function types', () => {
  it('should include execution metadata and typed context', () => {
    expectTypeOf<
      ToolExecutionOptions<{ requestId: string }, false>
    >().toEqualTypeOf<{
      toolCallId: string;
      messages: ModelMessage[];
      abortSignal?: AbortSignal;
      context: { requestId: string };
      sandbox: never;
    }>();
  });

  it('should include sandbox for sandbox execution metadata', () => {
    expectTypeOf<
      ToolExecutionOptions<{ requestId: string }, true>
    >().branded.toEqualTypeOf<{
      toolCallId: string;
      messages: ModelMessage[];
      abortSignal?: AbortSignal;
      context: { requestId: string };
      sandbox: Sandbox;
    }>();
  });

  it('should type the input, output, and execution options', () => {
    expectTypeOf<
      ToolExecuteFunction<
        { city: string },
        { temperature: number },
        Context,
        false
      >
    >().toEqualTypeOf<
      (
        input: { city: string },
        options: ToolExecutionOptions<Context, false>,
      ) =>
        | AsyncIterable<{ temperature: number }>
        | PromiseLike<{ temperature: number }>
        | { temperature: number }
    >();
  });

  it('should type sandbox execute options', () => {
    expectTypeOf<
      ToolExecuteFunction<
        { city: string },
        { temperature: number },
        Context,
        true
      >
    >().toEqualTypeOf<
      (
        input: { city: string },
        options: ToolExecutionOptions<Context, true>,
      ) =>
        | AsyncIterable<{ temperature: number }>
        | PromiseLike<{ temperature: number }>
        | { temperature: number }
    >();
  });
});
