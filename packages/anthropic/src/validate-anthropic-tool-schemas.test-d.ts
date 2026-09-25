import { tool, type FlexibleSchema } from '@ai-sdk/provider-utils';
import { expectTypeOf, it } from 'vitest';
import { z } from 'zod/v4';
import { experimental_validateAnthropicToolSchemas as validateToolSchemas } from './index';

it('accepts tools from generic schema wrappers', <T>() => {
  const inputSchema = null as unknown as FlexibleSchema<T>;
  const lookup = tool({ inputSchema });

  expectTypeOf(validateToolSchemas({ tools: { lookup } })).toEqualTypeOf<
    Promise<void>
  >();
});

it('accepts tools with typed inputs, outputs, and context', () => {
  const lookup = tool({
    inputSchema: z.object({ id: z.string() }),
    contextSchema: z.object({ prefix: z.string() }),
    execute: async ({ id }, { context }) => `${context.prefix}${id}`,
  });

  expectTypeOf(validateToolSchemas({ tools: { lookup } })).toEqualTypeOf<
    Promise<void>
  >();
});
