import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod/v4';
import type { FlexibleSchema } from '../schema';
import type { ToolResultOutput } from './content-part';
import type { Context } from './context';
import type { ModelMessage } from './model-message';
import {
  dynamicTool,
  tool,
  type DynamicTool,
  type FunctionTool,
  type ProviderDefinedTool,
  type ProviderExecutedTool,
  type Tool,
} from './tool';
import type { ToolExecuteFunction } from './tool-execute-function';

describe('DynamicTool', () => {
  it('should expose dynamic tools as base tools', () => {
    expectTypeOf<
      DynamicTool<{ number: number }, string, Context>
    >().toMatchTypeOf<Tool<{ number: number }, string, Context>>();
  });

  it('should create dynamic tools with the dynamic discriminator', () => {
    const aTool = dynamicTool({
      inputSchema: z.unknown(),
      execute: async input => input,
    });

    expectTypeOf(aTool).toEqualTypeOf<DynamicTool<unknown, unknown, Context>>();
    expectTypeOf(aTool.type).toEqualTypeOf<'dynamic'>();
  });
});

describe('ProviderDefinedTool', () => {
  it('should expose provider-defined tools as base tools', () => {
    expectTypeOf<
      ProviderDefinedTool<{ number: number }, string, Context>
    >().toMatchTypeOf<Tool<{ number: number }, string, Context>>();
    expectTypeOf<
      ProviderDefinedTool<{ number: number }, string, Context>
    >().toMatchTypeOf<Tool<{ number: number }, string, Context>>();
  });

  it('should require provider-specific properties', () => {
    expectTypeOf<ProviderDefinedTool>()
      .toHaveProperty('type')
      .toEqualTypeOf<'provider'>();
    expectTypeOf<ProviderDefinedTool>()
      .toHaveProperty('id')
      .toEqualTypeOf<`${string}.${string}`>();
    expectTypeOf<ProviderDefinedTool>()
      .toHaveProperty('isProviderExecuted')
      .toEqualTypeOf<false>();
    expectTypeOf<ProviderDefinedTool>()
      .toHaveProperty('args')
      .toEqualTypeOf<Record<string, unknown>>();
  });
});

describe('ProviderExecutedTool', () => {
  it('should expose provider-executed tools as base tools', () => {
    expectTypeOf<
      ProviderExecutedTool<{ number: number }, string, Context>
    >().toMatchTypeOf<Tool<{ number: number }, string, Context>>();
    expectTypeOf<
      ProviderExecutedTool<{ number: number }, string, Context>
    >().toMatchTypeOf<Tool<{ number: number }, string, Context>>();
  });

  it('should require provider-specific properties', () => {
    expectTypeOf<ProviderExecutedTool>()
      .toHaveProperty('type')
      .toEqualTypeOf<'provider'>();
    expectTypeOf<ProviderExecutedTool>()
      .toHaveProperty('id')
      .toEqualTypeOf<`${string}.${string}`>();
    expectTypeOf<ProviderExecutedTool>()
      .toHaveProperty('isProviderExecuted')
      .toEqualTypeOf<true>();
    expectTypeOf<ProviderExecutedTool>()
      .toHaveProperty('args')
      .toEqualTypeOf<Record<string, unknown>>();
  });
});

describe('FunctionTool', () => {
  it('should expose the function tool discriminator', () => {
    expectTypeOf<FunctionTool>()
      .toHaveProperty('type')
      .toEqualTypeOf<undefined | 'function'>();
  });

  describe('common properties', () => {
    it('should expose function tools as base tools', () => {
      expectTypeOf<
        FunctionTool<{ number: number }, string, Context>
      >().toMatchTypeOf<Tool<{ number: number }, string, Context>>();
    });
  });
});

describe('Tool', () => {
  describe('discriminated union', () => {
    it('should expose the tool variants as a type-discriminated union', () => {
      expectTypeOf<Tool>().toEqualTypeOf<
        FunctionTool | DynamicTool | ProviderDefinedTool | ProviderExecutedTool
      >();

      type ToolType = Tool['type'];

      expectTypeOf<ToolType>().toEqualTypeOf<
        undefined | 'function' | 'dynamic' | 'provider'
      >();
    });

    it('should narrow tools by type', () => {
      const aTool = null as unknown as Tool<
        { number: number },
        string,
        Context
      >;

      if (aTool.type === 'provider') {
        expectTypeOf(aTool).toEqualTypeOf<
          | ProviderDefinedTool<{ number: number }, string, Context>
          | ProviderExecutedTool<{ number: number }, string, Context>
        >();

        if (aTool.isProviderExecuted) {
          expectTypeOf(aTool).toEqualTypeOf<
            ProviderExecutedTool<{ number: number }, string, Context>
          >();
        } else {
          expectTypeOf(aTool).toEqualTypeOf<
            ProviderDefinedTool<{ number: number }, string, Context>
          >();
        }
      } else if (aTool.type === 'dynamic') {
        expectTypeOf(aTool).toEqualTypeOf<
          DynamicTool<{ number: number }, string, Context>
        >();
      } else {
        expectTypeOf(aTool).toEqualTypeOf<
          FunctionTool<{ number: number }, string, Context>
        >();
      }
    });
  });
});

describe('tool helper', () => {
  describe('input type', () => {
    it('should work with fixed inputSchema', () => {
      const aTool = tool({
        inputSchema: z.object({ number: z.number() }),
      });

      expectTypeOf(aTool).toEqualTypeOf<
        Tool<{ number: number }, never, Context>
      >();
      expectTypeOf(aTool.type).toEqualTypeOf<
        undefined | 'function' | 'dynamic' | 'provider'
      >();
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

      expectTypeOf(aTool).toEqualTypeOf<Tool<T, never, Context>>();
      expectTypeOf(aTool.execute).toEqualTypeOf<undefined>();
      expectTypeOf(aTool.execute).not.toEqualTypeOf<Function>();
      expectTypeOf(aTool.inputSchema).toEqualTypeOf<FlexibleSchema<T>>();
    });

    it('should infer input type correctly when inputExamples are present with optional/default zod schema', () => {
      const inputSchema = z.object({
        location: z.string(),
        unit: z.enum(['celsius', 'fahrenheit']).optional().default('celsius'),
      });

      tool({
        description: 'Get the weather for a location',
        inputSchema,
        inputExamples: [
          { input: { location: 'San Francisco', unit: 'celsius' } },
        ],
        execute: async input => {
          expectTypeOf(input).toEqualTypeOf<z.infer<typeof inputSchema>>();
          return { temperature: 20, unit: input.unit };
        },
      });
    });

    it('should infer input type correctly when inputExamples are present with refine zod schema', () => {
      const inputSchema = z.object({
        code: z.string().refine(val => val.length === 3),
      });

      tool({
        description: 'Get code details',
        inputSchema,
        inputExamples: [{ input: { code: 'ABC' } }],
        execute: async input => {
          expectTypeOf(input).toEqualTypeOf<z.infer<typeof inputSchema>>();
          return { valid: true };
        },
      });
    });
  });

  describe('context type', () => {
    it('should infer context type from contextSchema in execute', () => {
      const contextSchema = z.object({
        userId: z.string(),
        isAdmin: z.boolean(),
      });

      const aTool = tool({
        inputSchema: z.object({ number: z.number() }),
        contextSchema,
        execute: async (input, options) => {
          expectTypeOf(input).toEqualTypeOf<{ number: number }>();
          expectTypeOf(options.context).toEqualTypeOf<
            z.infer<typeof contextSchema>
          >();
          return 'test' as const;
        },
      });

      expectTypeOf(aTool).toEqualTypeOf<
        Tool<{ number: number }, 'test', z.infer<typeof contextSchema>>
      >();
    });

    it('should infer context type from contextSchema in input lifecycle callbacks', () => {
      const contextSchema = z.object({
        requestId: z.string(),
      });

      tool({
        inputSchema: z.object({ number: z.number() }),
        contextSchema,
        onInputStart: options => {
          expectTypeOf(options.context).toEqualTypeOf<
            z.infer<typeof contextSchema>
          >();
        },
        onInputDelta: options => {
          expectTypeOf(options.inputTextDelta).toEqualTypeOf<string>();
          expectTypeOf(options.context).toEqualTypeOf<
            z.infer<typeof contextSchema>
          >();
        },
        onInputAvailable: options => {
          expectTypeOf(options.input).toEqualTypeOf<{ number: number }>();
          expectTypeOf(options.context).toEqualTypeOf<
            z.infer<typeof contextSchema>
          >();
        },
      });
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

      expectTypeOf(aTool).toEqualTypeOf<
        Tool<{ number: number }, 'test', Context>
      >();
      expectTypeOf(aTool.execute).toMatchTypeOf<
        ToolExecuteFunction<{ number: number }, 'test', Context> | undefined
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

      expectTypeOf(aTool).toEqualTypeOf<
        Tool<{ number: number }, 'test', Context>
      >();
      expectTypeOf(aTool.execute).toEqualTypeOf<
        ToolExecuteFunction<{ number: number }, 'test', Context> | undefined
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
            context: Context;
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
              context: Context;
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
            context: Context;
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
              context: Context;
            },
          ) => boolean | PromiseLike<boolean>)
        | undefined
      >();
    });

    it('should infer needsApproval context from contextSchema', () => {
      const contextSchema = z.object({
        sessionId: z.string(),
        userRole: z.enum(['user', 'admin']),
      });

      const aTool = tool({
        inputSchema: z.object({ number: z.number() }),
        contextSchema,
        needsApproval: (input, options) => {
          expectTypeOf(input).toEqualTypeOf<{ number: number }>();
          expectTypeOf(options).toEqualTypeOf<{
            toolCallId: string;
            messages: ModelMessage[];
            context: z.infer<typeof contextSchema>;
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
              context: z.infer<typeof contextSchema>;
            },
          ) => boolean | PromiseLike<boolean>)
        | undefined
      >();
    });
  });
});
