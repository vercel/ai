import { z } from 'zod/v4';
import {
  Tool,
  ToolExecuteFunction,
  FlexibleSchema,
} from '@ai-sdk/provider-utils';
import { tool } from './tool';

describe('tool helper', () => {
  it('should work with no parameters and no output', () => {
    const toolType = tool({});

    expectTypeOf(toolType).toEqualTypeOf<Tool<never, never>>();
    expectTypeOf(toolType.execute).toEqualTypeOf<undefined>();
    expectTypeOf(toolType.execute).not.toEqualTypeOf<Function>();
    expectTypeOf(toolType.inputSchema).toEqualTypeOf<undefined>();
  });

  it('should work with only parameters', () => {
    const toolType = tool({
      inputSchema: z.object({ number: z.number() }),
    });

    expectTypeOf(toolType).toEqualTypeOf<Tool<{ number: number }, never>>();
    expectTypeOf(toolType.execute).toEqualTypeOf<undefined>();
    expectTypeOf(toolType.execute).not.toEqualTypeOf<Function>();
    expectTypeOf(toolType.inputSchema).toEqualTypeOf<
      FlexibleSchema<{ number: number }>
    >();
  });

  it('should work with only output', () => {
    const toolType = tool({
      execute: async () => 'test' as const,
    });

    expectTypeOf(toolType).toEqualTypeOf<Tool<never, 'test'>>();
    expectTypeOf(toolType.execute).toMatchTypeOf<
      ToolExecuteFunction<never, 'test'> | undefined
    >();
    expectTypeOf(toolType.execute).not.toEqualTypeOf<undefined>();
    expectTypeOf(toolType.inputSchema).toEqualTypeOf<undefined>();
  });

  it('should work with both inputSchema and output', () => {
    const toolType = tool({
      inputSchema: z.object({ number: z.number() }),
      execute: async input => {
        expectTypeOf(input).toEqualTypeOf<{ number: number }>();
        return 'test' as const;
      },
    });

    expectTypeOf(toolType).toEqualTypeOf<Tool<{ number: number }, 'test'>>();
    expectTypeOf(toolType.execute).toMatchTypeOf<
      ToolExecuteFunction<{ number: number }, 'test'> | undefined
    >();
    expectTypeOf(toolType.execute).not.toEqualTypeOf<undefined>();
    expectTypeOf(toolType.inputSchema).toEqualTypeOf<
      FlexibleSchema<{ number: number }>
    >();
  });
});
