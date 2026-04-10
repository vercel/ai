import { JSONValue } from '@ai-sdk/provider';
import { Context, tool } from '@ai-sdk/provider-utils';
import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { Output, streamText } from '../generate-text';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { AsyncIterableStream } from '../util';
import { DeepPartial } from '../util/deep-partial';

describe('streamText types', () => {
  describe('output', () => {
    it('should infer text output type (default)', async () => {
      const result = streamText({
        model: new MockLanguageModelV4(),
        prompt: 'Hello, world!',
      });

      expectTypeOf<typeof result.output>().toEqualTypeOf<PromiseLike<string>>();
    });

    it('should infer text output type', async () => {
      const result = streamText({
        model: new MockLanguageModelV4(),
        prompt: 'Hello, world!',
        output: Output.text(),
      });

      expectTypeOf<typeof result.output>().toEqualTypeOf<PromiseLike<string>>();
    });

    it('should infer object output type', async () => {
      const result = streamText({
        model: new MockLanguageModelV4(),
        prompt: 'Hello, world!',
        output: Output.object({ schema: z.object({ value: z.string() }) }),
      });

      expectTypeOf<typeof result.output>().toEqualTypeOf<
        PromiseLike<{ value: string }>
      >();
    });

    it('should infer array output type', async () => {
      const result = streamText({
        model: new MockLanguageModelV4(),
        prompt: 'Hello, world!',
        output: Output.array({ element: z.string() }),
      });

      expectTypeOf<typeof result.output>().toEqualTypeOf<
        PromiseLike<string[]>
      >();
    });

    it('should infer choice output type', async () => {
      const result = streamText({
        model: new MockLanguageModelV4(),
        prompt: 'Hello, world!',
        output: Output.choice({ options: ['a', 'b', 'c'] as const }),
      });

      expectTypeOf<typeof result.output>().toEqualTypeOf<
        PromiseLike<'a' | 'b' | 'c'>
      >();
    });

    it('should infer json output type', async () => {
      const result = streamText({
        model: new MockLanguageModelV4(),
        prompt: 'Hello, world!',
        output: Output.json(),
      });

      expectTypeOf<typeof result.output>().toEqualTypeOf<
        PromiseLike<JSONValue>
      >();
    });
  });

  describe('partialOutputStream', () => {
    it('should infer text partial output type (default)', async () => {
      const result = streamText({
        model: new MockLanguageModelV4(),
        prompt: 'Hello, world!',
      });

      expectTypeOf<typeof result.partialOutputStream>().toEqualTypeOf<
        AsyncIterableStream<string>
      >();
    });

    it('should infer text partial output type', async () => {
      const result = streamText({
        model: new MockLanguageModelV4(),
        prompt: 'Hello, world!',
        output: Output.text(),
      });

      expectTypeOf<typeof result.partialOutputStream>().toEqualTypeOf<
        AsyncIterableStream<string>
      >();
    });

    it('should infer object partial output type', async () => {
      const result = streamText({
        model: new MockLanguageModelV4(),
        prompt: 'Hello, world!',
        output: Output.object({ schema: z.object({ value: z.string() }) }),
      });

      expectTypeOf<typeof result.partialOutputStream>().toEqualTypeOf<
        AsyncIterableStream<DeepPartial<{ value: string }>>
      >();
    });

    it('should infer array partial output type', async () => {
      const result = streamText({
        model: new MockLanguageModelV4(),
        prompt: 'Hello, world!',
        output: Output.array({ element: z.string() }),
      });

      expectTypeOf<typeof result.partialOutputStream>().toEqualTypeOf<
        AsyncIterableStream<string[]>
      >();
    });

    it('should infer choice partial output type', async () => {
      const result = streamText({
        model: new MockLanguageModelV4(),
        prompt: 'Hello, world!',
        output: Output.choice({ options: ['a', 'b', 'c'] as const }),
      });

      expectTypeOf<typeof result.partialOutputStream>().toEqualTypeOf<
        AsyncIterableStream<'a' | 'b' | 'c'>
      >();
    });

    it('should infer json partial output type', async () => {
      const result = streamText({
        model: new MockLanguageModelV4(),
        prompt: 'Hello, world!',
        output: Output.json(),
      });

      expectTypeOf<typeof result.partialOutputStream>().toEqualTypeOf<
        AsyncIterableStream<JSONValue>
      >();
    });
  });

  describe('elementStream', () => {
    it('should infer element type for array output', async () => {
      const result = streamText({
        model: new MockLanguageModelV4(),
        prompt: 'Hello, world!',
        output: Output.array({ element: z.object({ value: z.string() }) }),
      });

      expectTypeOf<typeof result.elementStream>().toEqualTypeOf<
        AsyncIterableStream<{ value: string }>
      >();
    });

    it('should infer never for text output', async () => {
      const result = streamText({
        model: new MockLanguageModelV4(),
        prompt: 'Hello, world!',
        output: Output.text(),
      });

      expectTypeOf<typeof result.elementStream>().toEqualTypeOf<
        AsyncIterableStream<never>
      >();
    });

    it('should infer never for object output', async () => {
      const result = streamText({
        model: new MockLanguageModelV4(),
        prompt: 'Hello, world!',
        output: Output.object({ schema: z.object({ value: z.string() }) }),
      });

      expectTypeOf<typeof result.elementStream>().toEqualTypeOf<
        AsyncIterableStream<never>
      >();
    });

    it('should infer never for default output', async () => {
      const result = streamText({
        model: new MockLanguageModelV4(),
        prompt: 'Hello, world!',
      });

      expectTypeOf<typeof result.elementStream>().toEqualTypeOf<
        AsyncIterableStream<never>
      >();
    });
  });

  describe('context', () => {
    const toolWithoutContext = {
      calculator: tool({
        inputSchema: z.object({ expression: z.string() }),
        execute: async () => 'result',
      }),
    };

    const twoToolsWithContext = {
      weather: tool({
        inputSchema: z.object({ location: z.string() }),
        contextSchema: z.object({ weatherApiKey: z.string() }),
        execute: async ({ location }, { context: { weatherApiKey } }) => {
          return { location, weatherApiKey };
        },
      }),
      db: tool({
        inputSchema: z.object({ query: z.string() }),
        contextSchema: z.object({ dbUrl: z.string() }),
        execute: async ({ query }, { context: { dbUrl } }) => {
          return { query, dbUrl };
        },
      }),
    };

    const mixedTools = {
      weather: tool({
        inputSchema: z.object({ location: z.string() }),
        contextSchema: z.object({ weatherApiKey: z.string() }),
        execute: async ({ location }, { context: { weatherApiKey } }) => {
          return { location, weatherApiKey };
        },
      }),
      calculator: tool({
        inputSchema: z.object({ expression: z.string() }),
        execute: async () => 'result',
      }),
    };

    describe('no tools', () => {
      it('should accept no context', async () => {
        streamText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
        });
      });

      it('should reject empty context', async () => {
        streamText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
          // @ts-expect-error context is not accepted when no tools require it
          context: {},
        });
      });

      it('should accept user context', async () => {
        streamText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
          context: { telemetryId: '123' },
        });
      });
    });

    describe('single tool without contextSchema', () => {
      it('should accept no context', async () => {
        streamText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
          tools: toolWithoutContext,
        });
      });

      it('should reject empty context', async () => {
        streamText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
          tools: toolWithoutContext,
          // @ts-expect-error context is not accepted when no tools require it
          context: {},
        });
      });

      it('should accept user context', async () => {
        streamText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
          tools: toolWithoutContext,
          context: { telemetryId: '123' },
        });
      });
    });

    describe('two tools with contextSchema', () => {
      it('should reject no context', async () => {
        // @ts-expect-error context is required when tools have contextSchema
        streamText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
          tools: twoToolsWithContext,
        });
      });

      it('should reject empty context', async () => {
        streamText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
          tools: twoToolsWithContext,
          // @ts-expect-error missing required weatherApiKey and dbUrl
          context: {},
        });
      });

      it('should reject wrong context', async () => {
        streamText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
          tools: twoToolsWithContext,
          // @ts-expect-error missing required weatherApiKey and dbUrl
          context: { wrong: 'value' },
        });
      });

      it('should accept valid context', async () => {
        streamText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
          tools: twoToolsWithContext,
          context: { weatherApiKey: 'key', dbUrl: 'url' },
        });
      });

      it('should accept valid context with extra user properties', async () => {
        streamText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
          tools: twoToolsWithContext,
          context: {
            weatherApiKey: 'key',
            dbUrl: 'url',
            telemetryId: '123',
          },
        });
      });
    });

    describe('mixed tools', () => {
      it('should reject no context', async () => {
        // @ts-expect-error context is required when at least one tool has contextSchema
        streamText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
          tools: mixedTools,
        });
      });

      it('should reject empty context', async () => {
        streamText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
          tools: mixedTools,
          // @ts-expect-error missing required weatherApiKey
          context: {},
        });
      });

      it('should reject wrong context', async () => {
        streamText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
          tools: mixedTools,
          // @ts-expect-error missing required weatherApiKey
          context: { wrong: 'value' },
        });
      });

      it('should accept valid context', async () => {
        streamText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
          tools: mixedTools,
          context: { weatherApiKey: 'key' },
        });
      });

      it('should accept valid context with extra user properties', async () => {
        streamText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
          tools: mixedTools,
          context: { weatherApiKey: 'key', telemetryId: '123' },
        });
      });
    });

    describe('mixed tools with user context in prepareStep', () => {
      it('should reject no context', async () => {
        // @ts-expect-error context is required when at least one tool has contextSchema
        streamText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
          tools: mixedTools,
          prepareStep: ({ context }) => {
            expectTypeOf(context).toEqualTypeOf<
              {
                weatherApiKey: string;
              } & Context
            >();

            return {};
          },
        });
      });

      it('should reject empty context', async () => {
        streamText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
          tools: mixedTools,
          // @ts-expect-error missing required weatherApiKey
          context: {},
          prepareStep: ({ context }) => {
            expectTypeOf(context).toEqualTypeOf<{
              weatherApiKey: string;
            }>();

            return {};
          },
        });
      });

      it('should reject wrong context with only user properties', async () => {
        streamText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
          tools: mixedTools,
          // @ts-expect-error missing required weatherApiKey
          context: { telemetryId: '123' },
          prepareStep: ({ context }) => {
            expectTypeOf(context).toMatchObjectType<{
              weatherApiKey: string;
              telemetryId: string;
            }>();

            return {};
          },
        });
      });

      it('should accept valid context and expose combined type in prepareStep', async () => {
        streamText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
          tools: mixedTools,
          context: { weatherApiKey: 'key', telemetryId: '123' },
          prepareStep: ({ context }) => {
            expectTypeOf(context).toMatchObjectType<{
              weatherApiKey: string;
              telemetryId: string;
            }>();

            return {};
          },
        });
      });
    });

    describe('no tools with prepareStep', () => {
      it('should accept no context', async () => {
        streamText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
          prepareStep: ({ context }) => {
            expectTypeOf(context).toEqualTypeOf<Context>();

            return {};
          },
        });
      });

      it('should reject empty context', async () => {
        streamText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
          // @ts-expect-error context is not accepted when no tools require it
          context: {},
          prepareStep: ({ context }) => {
            expectTypeOf(context).toEqualTypeOf<{}>();

            return {};
          },
        });
      });

      it('should accept arbitrary context', async () => {
        streamText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
          context: { someValue: 'value' },
          prepareStep: ({ context }) => {
            expectTypeOf(context).toMatchObjectType<{
              someValue: string;
            }>();

            return {};
          },
        });
      });

      it('should accept user context', async () => {
        streamText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
          context: { telemetryId: '123' },
          prepareStep: ({ context }) => {
            expectTypeOf(context).toMatchObjectType<{
              telemetryId: string;
            }>();

            return {};
          },
        });
      });
    });
  });
});
