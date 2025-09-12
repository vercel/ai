import { z } from 'zod/v4';
import {
  Tool,
  ToolExecuteFunction,
  FlexibleSchema,
} from '@ai-sdk/provider-utils';
import { tool } from './tool';
import { describe, it, expectTypeOf } from 'vitest';
import { LanguageModelV2ToolResultPart } from '@ai-sdk/provider';

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
        toModelOutput: output => {
          expectTypeOf(output).toEqualTypeOf<any>();
          return { type: 'text', value: 'test' };
        },
      });

      expectTypeOf(aTool.toModelOutput).toMatchTypeOf<
        ((output: any) => LanguageModelV2ToolResultPart['output']) | undefined
      >();
    });

    it('should infer toModelOutput argument when there is an execute function', () => {
      const aTool = tool({
        inputSchema: z.object({ number: z.number() }),
        execute: async () => 'test' as const,
        toModelOutput: output => {
          expectTypeOf(output).toEqualTypeOf<'test'>();
          return { type: 'text', value: 'test' };
        },
      });

      expectTypeOf(aTool.toModelOutput).toMatchTypeOf<
        | ((output: 'test') => LanguageModelV2ToolResultPart['output'])
        | undefined
      >();
    });

    it('should infer toModelOutput argument when there is an output schema', () => {
      const aTool = tool({
        inputSchema: z.object({ number: z.number() }),
        outputSchema: z.literal('test'),
        toModelOutput: output => {
          expectTypeOf(output).toEqualTypeOf<'test'>();
          return { type: 'text', value: 'test' };
        },
      });

      expectTypeOf(aTool.toModelOutput).toMatchTypeOf<
        | ((output: 'test') => LanguageModelV2ToolResultPart['output'])
        | undefined
      >();
    });
  });
});
