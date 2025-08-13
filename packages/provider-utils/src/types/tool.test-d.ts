import { z } from 'zod/v4';
import {
  Tool,
  ToolExecuteFunction,
  FlexibleSchema,
} from '@ai-sdk/provider-utils';
import { tool } from './tool';

describe('tool helper', () => {
  it('should work with fixed inputSchema', () => {
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

  it('should work with flexible inputSchema', <T>() => {
    const inputSchema: FlexibleSchema<T> = null as any;

    const toolType = tool({
      inputSchema,
    });

    expectTypeOf(toolType).toEqualTypeOf<Tool<T, never>>();
    expectTypeOf(toolType.execute).toEqualTypeOf<undefined>();
    expectTypeOf(toolType.execute).not.toEqualTypeOf<Function>();
    expectTypeOf(toolType.inputSchema).toEqualTypeOf<FlexibleSchema<T>>();
  });

  it('should work with inputSchema and execute function', () => {
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
