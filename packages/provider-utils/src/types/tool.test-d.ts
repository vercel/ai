import { LanguageModelV3ToolResultPart } from '@ai-sdk/provider';
import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod/v4';
import { FlexibleSchema } from '../schema';
import { ModelMessage } from './model-message';
import { Tool, tool, ToolExecuteFunction } from './tool';
import { ToolResultOutput } from './content-part';

describe('tool type', () => {
  describe('input type', () => {
    it('should work with fixed inputSchema', () => {
      const aTool = tool({
        inputSchema: z.object({ number: z.number() }),
      });

      expectTypeOf(aTool).toEqualTypeOf<Tool<{ number: number }, never>>();
      expectTypeOf(aTool.execute).toEqualTypeOf<undefined>();
      expectTypeOf(aTool.execute).not.toEqualTypeOf<Function>();
      expectTypeOf(aTool.inputSchema).toEqualTypeOf<
        FlexibleSchema<{ number: number }>
      >();
    });

    it('should work with flexible inputSchema', <T>() => {
      const aTool = tool({
        inputSchema: null as unknown as FlexibleSchema<T>,
      });

      expectTypeOf(aTool).toEqualTypeOf<Tool<T, never>>();
      expectTypeOf(aTool.execute).toEqualTypeOf<undefined>();
      expectTypeOf(aTool.execute).not.toEqualTypeOf<Function>();
      expectTypeOf(aTool.inputSchema).toEqualTypeOf<FlexibleSchema<T>>();
    });
  });

  describe('output type', () => {
    it('should derive output type from execute function', () => {
      const aTool = tool({
        inputSchema: z.object({ number: z.number() }),
        execute: async input => {
          expectTypeOf(input).toEqualTypeOf<{ number: number }>();
          return 'test' as const;
        },
      });

      expectTypeOf(aTool).toEqualTypeOf<Tool<{ number: number }, 'test'>>();
      expectTypeOf(aTool.execute).toMatchTypeOf<
        ToolExecuteFunction<{ number: number }, 'test'> | undefined
      >();
      expectTypeOf(aTool.execute).not.toEqualTypeOf<undefined>();
      expectTypeOf(aTool.inputSchema).toEqualTypeOf<
        FlexibleSchema<{ number: number }>
      >();
    });

    it('should derive const schema from async generator execute function', () => {
      const aTool = tool({
        inputSchema: z.object({ number: z.number() }),
        execute: async function* () {
          yield 'test' as const;
        },
      });

      expectTypeOf(aTool).toEqualTypeOf<Tool<{ number: number }, 'test'>>();
      expectTypeOf(aTool.execute).toEqualTypeOf<
        ToolExecuteFunction<{ number: number }, 'test'> | undefined
      >();
      expectTypeOf(aTool.inputSchema).toEqualTypeOf<
        FlexibleSchema<{ number: number }>
      >();
    });
  });

  describe('toModelOutput', () => {
    it('should infer toModelOutput argument when there is only an input schema', () => {
      const aTool = tool({
        inputSchema: z.object({ number: z.number() }),
        toModelOutput: ({ output }) => {
          expectTypeOf(output).toEqualTypeOf<any>();
          return { type: 'text', value: 'test' };
        },
      });

      expectTypeOf(aTool.toModelOutput).toMatchTypeOf<
        | ((options: {
            toolCallId: string;
            input: { number: number };
            output: any;
          }) => ToolResultOutput | PromiseLike<ToolResultOutput>)
        | undefined
      >();
    });

    it('should infer toModelOutput argument when there is an execute function', () => {
      const aTool = tool({
        inputSchema: z.object({ number: z.number() }),
        execute: async () => 'test' as const,
        toModelOutput: ({ output }) => {
          expectTypeOf(output).toEqualTypeOf<'test'>();
          return { type: 'text', value: 'test' };
        },
      });

      expectTypeOf(aTool.toModelOutput).toMatchTypeOf<
        | ((options: {
            toolCallId: string;
            input: { number: number };
            output: 'test';
          }) => ToolResultOutput | PromiseLike<ToolResultOutput>)
        | undefined
      >();
    });

    it('should infer toModelOutput argument when there is an output schema', () => {
      const aTool = tool({
        inputSchema: z.object({ number: z.number() }),
        outputSchema: z.literal('test'),
        toModelOutput: ({ output }) => {
          expectTypeOf(output).toEqualTypeOf<'test'>();
          return { type: 'text', value: 'test' };
        },
      });

      expectTypeOf(aTool.toModelOutput).toMatchTypeOf<
        | ((options: {
            toolCallId: string;
            input: { number: number };
            output: 'test';
          }) => ToolResultOutput | PromiseLike<ToolResultOutput>)
        | undefined
      >();
    });
  });

  describe('needsApproval (function)', () => {
    it('should infer needsApproval argument when there is only an input schema', () => {
      const aTool = tool({
        inputSchema: z.object({ number: z.number() }),
        needsApproval: (input, options) => {
          expectTypeOf(input).toEqualTypeOf<{ number: number }>();
          expectTypeOf(options).toEqualTypeOf<{
            toolCallId: string;
            messages: ModelMessage[];
            experimental_context?: unknown;
          }>();
          return true;
        },
      });

      expectTypeOf(aTool.needsApproval).toMatchTypeOf<
        | boolean
        | ((
            input: { number: number },
            options: {
              toolCallId: string;
              messages: ModelMessage[];
              experimental_context: unknown;
            },
          ) => boolean | PromiseLike<boolean>)
        | undefined
      >();
    });

    it('should infer needsApproval argument when there is an execute function', () => {
      const aTool = tool({
        inputSchema: z.object({ number: z.number() }),
        execute: async () => 'test' as const,
        needsApproval: (input, options) => {
          expectTypeOf(input).toEqualTypeOf<{ number: number }>();
          expectTypeOf(options).toEqualTypeOf<{
            toolCallId: string;
            messages: ModelMessage[];
            experimental_context?: unknown;
          }>();
          return true;
        },
      });

      expectTypeOf(aTool.needsApproval).toMatchTypeOf<
        | boolean
        | ((
            input: { number: number },
            options: {
              toolCallId: string;
              messages: ModelMessage[];
              experimental_context: unknown;
            },
          ) => boolean | PromiseLike<boolean>)
        | undefined
      >();
    });
  });
});
