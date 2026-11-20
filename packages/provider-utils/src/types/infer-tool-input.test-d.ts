import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod/v4';
import type { InferToolInput } from './infer-tool-input';
import { tool } from './tool';

describe('InferToolInput', () => {
  it('infers the input type from a tool with inputSchema', () => {
    const weatherTool = tool({
      inputSchema: z.object({
        city: z.string(),
        countryCode: z.string().length(2),
      }),
      execute: async () => ({ temperature: 72 }),
    });

    expectTypeOf<InferToolInput<typeof weatherTool>>().toEqualTypeOf<{
      city: string;
      countryCode: string;
    }>();
  });

  it('infers an empty object input when inputSchema is omitted', () => {
    const pingTool = tool({
      description: 'Ping',
      execute: async () => 'pong',
    });

    expectTypeOf<InferToolInput<typeof pingTool>>().toEqualTypeOf<
      Record<string, never>
    >();
  });
});
