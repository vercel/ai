import { Context, tool } from '@ai-sdk/provider-utils';
import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod/v4';
import type { GenerationContext } from './generation-context';

describe('GenerationContext', () => {
  it('combines inferred tool context with the generic context type', () => {
    const tools = {
      weather: tool({
        inputSchema: z.object({
          city: z.string(),
        }),
        contextSchema: z.object({
          userId: z.string(),
        }),
      }),
      forecast: tool({
        inputSchema: z.object({
          days: z.number(),
        }),
        contextSchema: z.object({
          role: z.string(),
        }),
      }),
    };

    expectTypeOf<GenerationContext<typeof tools>>().toEqualTypeOf<
      {
        userId: string;
      } & {
        role: string;
      } & Context
    >();

    expectTypeOf<
      GenerationContext<typeof tools>
    >().toMatchObjectType<Context>();
  });

  it('falls back to the generic context type when tools have no contextSchema', () => {
    const tools = {
      weather: tool({
        inputSchema: z.object({
          city: z.string(),
        }),
      }),
    };

    expectTypeOf<
      GenerationContext<typeof tools>
    >().toMatchObjectType<Context>();
  });
});
