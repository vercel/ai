import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod/v4';
import type { InferToolSetContext } from './infer-tool-set-context';
import { tool } from './tool';

describe('InferToolSetContext', () => {
  it('infers the intersection of context types across a tool set', () => {
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

    expectTypeOf<InferToolSetContext<typeof tools>>().toMatchObjectType<{
      userId: string;
      role: string;
    }>();
  });

  it('infers a single tool context type from a tool set', () => {
    const tools = {
      weather: tool({
        inputSchema: z.object({
          city: z.string(),
        }),
        contextSchema: z.object({
          userId: z.string(),
          role: z.string(),
        }),
      }),
    };

    expectTypeOf<InferToolSetContext<typeof tools>>().toMatchObjectType<{
      userId: string;
      role: string;
    }>();
  });

  it('falls back to the generic context type for tools without contextSchema', () => {
    const tools = {
      weather: tool({
        inputSchema: z.object({
          city: z.string(),
        }),
      }),
    };

    expectTypeOf<InferToolSetContext<typeof tools>>().toEqualTypeOf<unknown>();
  });
});
