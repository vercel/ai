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

  describe('context', () => {
    const mixedTools = {
      weather: tool({
        inputSchema: z.object({
          location: z.string(),
        }),
        contextSchema: z.object({
          weatherApiKey: z.string(),
        }),
        execute: async ({ location }, { context: { weatherApiKey } }) => {
          return { location, weatherApiKey };
        },
      }),
      calculator: tool({
        inputSchema: z.object({
          expression: z.string(),
        }),
      }),
    };

    it('should infer typed context with one tool context and prepareStep', async () => {
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
            execute: async (_input, { context }) => {
              expectTypeOf(context).toMatchObjectType<{
                userId: string;
              }>();

              return 'sunny';
            },
          }),
        },
        context: {
          userId: 'test-user',
          role: 'admin',
        },
        prepareStep: ({ context }) => {
          expectTypeOf(context.userId).toEqualTypeOf<string>();
          expectTypeOf(context.role).toEqualTypeOf<string>();

          return {
            context: {
              userId: context.userId,
              role: context.role,
            },
          };
        },
      });
    });

    it('should require context for a mixed toolset when one tool has a contextSchema', async () => {
      // @ts-expect-error - context should be required when one tool has a contextSchema
      generateText({
        model: new MockLanguageModelV4(),
        prompt: 'What is 2 + 2?',
        tools: {
          weather: tool({
            inputSchema: z.object({
              location: z.string(),
            }),
            execute: async () => 'sunny',
          }),
          calculator: tool({
            inputSchema: z.object({
              expression: z.string(),
            }),
            contextSchema: z.object({
              calculatorApiKey: z.string(),
            }),
            execute: async (_input, { context }) => {
              expectTypeOf(context).toMatchObjectType<{
                calculatorApiKey: string;
              }>();

              return '4';
            },
          }),
        },
        // should error because context calculatorApiKey is required
        prepareStep: () => ({}),
      });
    });

    it('rejects empty context when the same mixed toolset is hoisted first', async () => {
      generateText({
        model: new MockLanguageModelV4(),
        prompt: 'What is the weather in San Francisco?',
        tools: mixedTools,
        // @ts-expect-error - hoisting the tools preserves the required weatherApiKey
        context: {},
        prepareStep: () => ({}),
      });
    });

    it('should not allow provided context to miss required keys from tools', async () => {
      generateText({
        model: new MockLanguageModelV4(),
        prompt: 'What is the weather in San Francisco?',
        tools: {
          weather: tool({
            inputSchema: z.object({
              location: z.string(),
            }),
            contextSchema: z.object({
              weatherApiKey: z.string(),
            }),
            execute: async ({ location }, { context: { weatherApiKey } }) => {
              return { location, weatherApiKey };
            },
          }),
          calculator: tool({
            inputSchema: z.object({
              expression: z.string(),
            }),
          }),
        },
        // @ts-expect-error - should error because weatherApiKey is required
        context: {},
        prepareStep: () => ({}),
      });
    });
  });
});
