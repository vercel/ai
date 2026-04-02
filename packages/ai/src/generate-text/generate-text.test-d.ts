import { JSONValue } from '@ai-sdk/provider';
import { tool } from '@ai-sdk/provider-utils';
import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { generateText, Output } from '../generate-text';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';

describe('generateText types', () => {
  describe('output', () => {
    it('should infer text output type (default)', async () => {
      const result = await generateText({
        model: new MockLanguageModelV4(),
        prompt: 'Hello, world!',
      });

      expectTypeOf<typeof result.output>().toEqualTypeOf<string>();
    });

    it('should infer text output type', async () => {
      const result = await generateText({
        model: new MockLanguageModelV4(),
        prompt: 'Hello, world!',
        output: Output.text(),
      });

      expectTypeOf<typeof result.output>().toEqualTypeOf<string>();
    });

    it('should infer object output type', async () => {
      const result = await generateText({
        model: new MockLanguageModelV4(),
        prompt: 'Hello, world!',
        output: Output.object({ schema: z.object({ value: z.string() }) }),
      });

      expectTypeOf<typeof result.output>().toEqualTypeOf<{ value: string }>();
    });

    it('should infer array output type', async () => {
      const result = await generateText({
        model: new MockLanguageModelV4(),
        prompt: 'Hello, world!',
        output: Output.array({ element: z.string() }),
      });

      expectTypeOf<typeof result.output>().toEqualTypeOf<string[]>();
    });

    it('should infer choice output type', async () => {
      const result = await generateText({
        model: new MockLanguageModelV4(),
        prompt: 'Hello, world!',
        output: Output.choice({ options: ['a', 'b', 'c'] as const }),
      });

      expectTypeOf<typeof result.output>().toEqualTypeOf<'a' | 'b' | 'c'>();
    });

    it('should infer json output type', async () => {
      const result = await generateText({
        model: new MockLanguageModelV4(),
        prompt: 'Hello, world!',
        output: Output.json(),
      });

      expectTypeOf<typeof result.output>().toEqualTypeOf<JSONValue>();
    });
  });

  describe('experimental_context', () => {
    it('should infer typed experimental_context with one tool context and prepareStep', async () => {
      generateText({
        model: new MockLanguageModelV4(),
        prompt: 'Hello, world!',
        tools: {
          weather: tool({
            inputSchema: z.object({
              city: z.string(),
            }),
            contextSchema: z.object({
              userId: z.string(),
            }),
            execute: async (_input, { experimental_context }) => {
              expectTypeOf(experimental_context).toMatchObjectType<{
                userId: string;
              }>();

              return 'sunny';
            },
          }),
        },
        experimental_context: {
          userId: 'test-user',
          role: 'admin',
        },
        prepareStep: ({ experimental_context }) => {
          expectTypeOf(experimental_context).toMatchObjectType<{
            userId: string;
            role: string;
          }>();

          return {
            experimental_context: {
              userId: experimental_context.userId,
              role: experimental_context.role,
            },
          };
        },
      });
    });
  });
});
