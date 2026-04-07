import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod/v4';
import type { InferToolContext } from './infer-tool-context';
import { tool } from './tool';
import { Context } from './context';

describe('InferToolContext', () => {
  it('infers the context type from a tool with contextSchema', () => {
    const weatherTool = tool({
      inputSchema: z.object({
        city: z.string(),
      }),
      contextSchema: z.object({
        userId: z.string(),
        role: z.string(),
      }),
      execute: async () => ({ temperature: 72 }),
    });

    expectTypeOf<InferToolContext<typeof weatherTool>>().toEqualTypeOf<{
      userId: string;
      role: string;
    }>();
  });

  it('infers the generic context type from a tool without contextSchema', () => {
    const weatherTool = tool({
      inputSchema: z.object({
        city: z.string(),
      }),
      execute: async () => ({ temperature: 72 }),
    });

    expectTypeOf<
      InferToolContext<typeof weatherTool>
    >().toEqualTypeOf<Context>();
  });
});
