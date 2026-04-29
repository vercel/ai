import type { JSONValue } from '@ai-sdk/provider';
import { tool, type Context } from '@ai-sdk/provider-utils';
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

  describe('runtimeContext', () => {
    it('should accept no runtimeContext', async () => {
      generateText({
        model: new MockLanguageModelV4(),
        prompt: 'Hello',
      });
    });

    it('should allow empty runtimeContext', async () => {
      generateText({
        model: new MockLanguageModelV4(),
        prompt: 'Hello',
        runtimeContext: {},
      });
    });

    it('should accept user runtimeContext', async () => {
      generateText({
        model: new MockLanguageModelV4(),
        prompt: 'Hello',
        runtimeContext: { telemetryId: '123' },
      });
    });

    it('should accept sensitiveRuntimeContext for runtimeContext keys', async () => {
      generateText({
        model: new MockLanguageModelV4(),
        prompt: 'Hello',
        runtimeContext: { userId: 'user-123', requestId: 'request-123' },
        sensitiveRuntimeContext: {
          userId: true,
          requestId: false,
        },
      });
    });

    it('should expose original runtimeContext in callbacks', async () => {
      generateText({
        model: new MockLanguageModelV4(),
        prompt: 'Hello',
        runtimeContext: { userId: 'user-123', requestId: 'request-123' },
        sensitiveRuntimeContext: { userId: true },
        experimental_onStart: ({ runtimeContext }) => {
          expectTypeOf(runtimeContext).toEqualTypeOf<{
            userId: string;
            requestId: string;
          }>();
        },
        experimental_onStepStart: ({ runtimeContext }) => {
          expectTypeOf(runtimeContext).toEqualTypeOf<{
            userId: string;
            requestId: string;
          }>();
        },
        onStepFinish: ({ runtimeContext }) => {
          expectTypeOf(runtimeContext).toEqualTypeOf<{
            userId: string;
            requestId: string;
          }>();
        },
        onFinish: ({ runtimeContext }) => {
          expectTypeOf(runtimeContext).toEqualTypeOf<{
            userId: string;
            requestId: string;
          }>();
        },
      });
    });

    it('should reject unknown sensitiveRuntimeContext keys', async () => {
      generateText({
        model: new MockLanguageModelV4(),
        prompt: 'Hello',
        runtimeContext: { userId: 'user-123' },
        sensitiveRuntimeContext: {
          // @ts-expect-error sensitiveRuntimeContext only supports runtimeContext properties
          unknown: true,
        },
      });
    });

    describe('prepareStep', () => {
      it('should expose default runtimeContext type', async () => {
        generateText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
          prepareStep: ({ runtimeContext, toolsContext }) => {
            expectTypeOf(runtimeContext).toEqualTypeOf<Context>();
            expectTypeOf(toolsContext).toEqualTypeOf<{}>();

            return {};
          },
        });
      });

      it('should accept empty runtimeContext', async () => {
        generateText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
          runtimeContext: {},
          prepareStep: ({ runtimeContext, toolsContext }) => {
            expectTypeOf(runtimeContext).toEqualTypeOf<{}>();
            expectTypeOf(toolsContext).toEqualTypeOf<{}>();

            return {};
          },
        });
      });

      it('should accept arbitrary runtimeContext', async () => {
        generateText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
          runtimeContext: { someValue: 'value' },
          prepareStep: ({ runtimeContext, toolsContext }) => {
            expectTypeOf(runtimeContext).toMatchObjectType<{
              someValue: string;
            }>();
            expectTypeOf(toolsContext).toEqualTypeOf<{}>();

            return {};
          },
        });
      });

      it('should accept user runtimeContext', async () => {
        generateText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
          runtimeContext: { telemetryId: '123' },
          prepareStep: ({ runtimeContext, toolsContext }) => {
            expectTypeOf(runtimeContext).toMatchObjectType<{
              telemetryId: string;
            }>();
            expectTypeOf(toolsContext).toEqualTypeOf<{}>();

            return {};
          },
        });
      });
    });

    it('should pass the runtimeContext type into toolApproval callbacks', async () => {
      type RC = { tenantId: string };

      generateText({
        model: new MockLanguageModelV4(),
        prompt: 'Hello',
        tools: mixedTools,
        toolsContext: { weather: { weatherApiKey: 'k' } },
        runtimeContext: { tenantId: 'acme' } as RC,
        toolApproval: ({ runtimeContext }) => {
          expectTypeOf(runtimeContext).toEqualTypeOf<RC>();
          return 'not-applicable';
        },
      });

      generateText({
        model: new MockLanguageModelV4(),
        prompt: 'Hello',
        tools: mixedTools,
        toolsContext: { weather: { weatherApiKey: 'k' } },
        runtimeContext: { tenantId: 'acme' } as RC,
        toolApproval: {
          weather: (_input, { runtimeContext }) => {
            expectTypeOf(runtimeContext).toEqualTypeOf<RC>();
            return 'not-applicable';
          },
        },
      });
    });
  });

  describe('toolsContext', () => {
    describe('no tools', () => {
      it('should reject toolsContext', async () => {
        generateText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
          // @ts-expect-error toolsContext is not accepted when no tools are provided
          toolsContext: {},
        });
      });
    });

    describe('single tool without contextSchema', () => {
      it('should reject toolsContext', async () => {
        generateText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
          tools: toolWithoutContext,
          // @ts-expect-error toolsContext is not accepted when no tools require it
          toolsContext: {},
        });
      });
    });

    describe('two tools with contextSchema', () => {
      it('should reject no toolsContext', async () => {
        // @ts-expect-error toolsContext is required when tools have contextSchema
        generateText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
          tools: twoToolsWithContext,
        });
      });

      it('should reject empty toolsContext', async () => {
        generateText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
          tools: twoToolsWithContext,
          // @ts-expect-error missing required weather and db tool contexts
          toolsContext: {},
        });
      });

      it('should reject wrong toolsContext', async () => {
        generateText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
          tools: twoToolsWithContext,
          // @ts-expect-error missing required weather and db tool contexts
          toolsContext: { wrong: 'value' },
        });
      });

      it('should accept valid toolsContext', async () => {
        generateText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
          tools: twoToolsWithContext,
          toolsContext: {
            weather: { weatherApiKey: 'key' },
            db: { dbUrl: 'url' },
          },
        });
      });
    });

    describe('mixed tools', () => {
      it('should reject no toolsContext', async () => {
        // @ts-expect-error toolsContext is required when at least one tool has contextSchema
        generateText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
          tools: mixedTools,
        });
      });

      it('should reject empty toolsContext', async () => {
        generateText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
          tools: mixedTools,
          // @ts-expect-error missing required weather tool context
          toolsContext: {},
        });
      });

      it('should reject wrong toolsContext', async () => {
        generateText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
          tools: mixedTools,
          // @ts-expect-error missing required weather tool context
          toolsContext: { wrong: 'value' },
        });
      });

      it('should accept valid toolsContext', async () => {
        generateText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
          tools: mixedTools,
          toolsContext: { weather: { weatherApiKey: 'key' } },
        });
      });
    });

    describe('prepareStep', () => {
      it('should expose toolsContext separately in prepareStep', async () => {
        generateText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
          tools: mixedTools,
          toolsContext: { weather: { weatherApiKey: 'key' } },
          prepareStep: ({ runtimeContext, toolsContext }) => {
            expectTypeOf(runtimeContext).toEqualTypeOf<Context>();
            expectTypeOf(toolsContext).toEqualTypeOf<{
              weather: {
                weatherApiKey: string;
              };
            }>();

            return {};
          },
        });
      });

      it('should reject empty toolsContext', async () => {
        generateText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
          tools: mixedTools,
          // @ts-expect-error missing required weather tool context
          toolsContext: {},
          prepareStep: ({ runtimeContext, toolsContext }) => {
            expectTypeOf(runtimeContext).toEqualTypeOf<Context>();
            expectTypeOf(toolsContext).toEqualTypeOf<{
              weather: {
                weatherApiKey: string;
              };
            }>();

            return {};
          },
        });
      });

      it('should reject wrong toolsContext', async () => {
        generateText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
          tools: mixedTools,
          // @ts-expect-error missing required weather.weatherApiKey
          toolsContext: { weather: { wrong: 'value' } },
          prepareStep: ({ runtimeContext, toolsContext }) => {
            expectTypeOf(runtimeContext).toEqualTypeOf<Context>();
            expectTypeOf(toolsContext).toEqualTypeOf<{
              weather: {
                weatherApiKey: string;
              };
            }>();

            return {};
          },
        });
      });
    });

    describe('no tools with prepareStep', () => {
      it('should reject toolsContext', async () => {
        generateText({
          model: new MockLanguageModelV4(),
          prompt: 'Hello',
          // @ts-expect-error toolsContext is not accepted when no tools are provided
          toolsContext: {},
          prepareStep: ({ runtimeContext, toolsContext }) => {
            expectTypeOf(runtimeContext).toEqualTypeOf<Context>();
            expectTypeOf(toolsContext).toEqualTypeOf<{}>();

            return {};
          },
        });
      });
    });
  });
});
