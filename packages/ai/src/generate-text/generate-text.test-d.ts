import { JSONValue } from '@ai-sdk/provider';
import {
  tool,
  type Context,
  type InferToolContext,
  type ToolSet,
} from '@ai-sdk/provider-utils';
import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { generateText, Output } from '../generate-text';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import type { ContextParameter } from './context-parameter';
import type { GenerationContext } from './generation-context';
import type { PrepareStepFunction } from './prepare-step';
import type { GenerateTextResult } from './generate-text-result';

type ResultTools<T> =
  Awaited<T> extends GenerateTextResult<infer TOOLS, any, any> ? TOOLS : never;

type ResultContext<T> =
  Awaited<T> extends GenerateTextResult<any, infer CONTEXT, any>
    ? CONTEXT
    : never;

type IsAny<T> = 0 extends 1 & T ? true : false;

type IsExact<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? (<T>() => T extends B ? 1 : 2) extends <T>() => T extends A ? 1 : 2
      ? true
      : false
    : false;

type ObjectTools<T> = T extends { tools: infer TOOLS } ? TOOLS : never;

type ObjectContext<T> = T extends { context: infer CONTEXT } ? CONTEXT : never;

const preserve = <const T>(value: T) => value;

declare function inferA<
  TOOLS extends ToolSet,
  CONTEXT extends GenerationContext<TOOLS>,
>(options: {
  tools: TOOLS;
  context: CONTEXT;
}): {
  tools: TOOLS;
  context: CONTEXT;
};

declare function inferB<
  TOOLS extends ToolSet,
  CONTEXT extends GenerationContext<TOOLS>,
>(
  options: ContextParameter<TOOLS, CONTEXT>,
): {
  tools: TOOLS;
  context: CONTEXT;
};

declare function inferC<
  TOOLS extends ToolSet,
  CONTEXT extends GenerationContext<TOOLS>,
>(
  options: ContextParameter<TOOLS, CONTEXT> & {
    prepareStep?: PrepareStepFunction<NoInfer<TOOLS>, CONTEXT>;
  },
): {
  tools: TOOLS;
  context: CONTEXT;
};

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

    it('keeps the weather tool context specific for the same mixed toolset with valid context', async () => {
      const result = generateText({
        model: new MockLanguageModelV4(),
        prompt: 'What is the weather in San Francisco?',
        tools: mixedTools,
        context: {
          weatherApiKey: 'test-key',
        },
        prepareStep: () => ({}),
      });

      type InferredTools = ResultTools<typeof result>;
      type WeatherContext = InferToolContext<InferredTools['weather']>;
      type InferredContext = ResultContext<typeof result>;

      expectTypeOf<IsAny<WeatherContext>>().toEqualTypeOf<false>();
      expectTypeOf<WeatherContext>().toMatchObjectType<{
        weatherApiKey: string;
      }>();
      expectTypeOf<InferredContext>().toMatchObjectType<{
        weatherApiKey: string;
      }>();
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
      // @ts-expect-error - context should not allow missing required keys from tools
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
        context: {
          // should error because weatherApiKey is required
        },
        prepareStep: () => ({}),
      });
    });

    it('diagnostic: inline tools currently widen away the required weather context', async () => {
      const result = generateText({
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
        context: {},
        prepareStep: () => ({}),
      });

      type InferredTools = ResultTools<typeof result>;
      type WeatherContext = InferToolContext<InferredTools['weather']>;
      type DerivedContext = GenerationContext<InferredTools>;
      type InferredContext = ResultContext<typeof result>;
      type HasWeatherApiKey = WeatherContext extends { weatherApiKey: string }
        ? true
        : false;
      type DerivedHasWeatherApiKey = DerivedContext extends {
        weatherApiKey: string;
      }
        ? true
        : false;
      type ResultHasWeatherApiKey = InferredContext extends {
        weatherApiKey: string;
      }
        ? true
        : false;
      type IsDerivedContext = IsExact<DerivedContext, Context>;
      type IsDerivedEmptyObject = IsExact<DerivedContext, {}>;
      type IsEmptyObjectContext = IsExact<InferredContext, {}>;
      type InferredMatchesDerived = IsExact<InferredContext, DerivedContext>;

      expectTypeOf<IsAny<WeatherContext>>().toEqualTypeOf<false>();
      expectTypeOf<HasWeatherApiKey>().toEqualTypeOf<true>();
      expectTypeOf<ResultHasWeatherApiKey>().toEqualTypeOf<false>();
      expectTypeOf<IsDerivedContext>().toEqualTypeOf<false>();
      expectTypeOf<IsDerivedEmptyObject>().toEqualTypeOf<false>();
      expectTypeOf<IsExact<WeatherContext, Context>>().toEqualTypeOf<false>();
      expectTypeOf<IsExact<InferredContext, Context>>().toEqualTypeOf<false>();
      expectTypeOf<IsEmptyObjectContext>().toEqualTypeOf<true>();
      expectTypeOf<InferredMatchesDerived>().toEqualTypeOf<false>();
    });

    describe('inference reduction ladder', () => {
      it('inferA rejects empty context for hoisted tools', () => {
        inferA({
          tools: mixedTools,
          // @ts-expect-error - inferA should require weatherApiKey for hoisted tools
          context: {},
        });
      });

      it('inferA accepts empty context for inline tools and collapses the call context to {}', () => {
        const reduced = inferA({
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
          context: {},
        });

        type ReducedTools = ObjectTools<typeof reduced>;
        type ReducedContext = ObjectContext<typeof reduced>;
        type ReducedWeatherContext = InferToolContext<ReducedTools['weather']>;
        type ReducedDerivedContext = GenerationContext<ReducedTools>;
        type ReducedDerivedHasWeatherApiKey = ReducedDerivedContext extends {
          weatherApiKey: string;
        }
          ? true
          : false;
        type ReducedDerivedIsContext = IsExact<ReducedDerivedContext, Context>;
        type ReducedDerivedIsEmptyObject = IsExact<ReducedDerivedContext, {}>;
        type ReducedMatchesDerived = IsExact<
          ReducedContext,
          ReducedDerivedContext
        >;

        expectTypeOf<IsAny<ReducedWeatherContext>>().toEqualTypeOf<false>();
        expectTypeOf<ReducedWeatherContext>().toMatchObjectType<{
          weatherApiKey: string;
        }>();
        expectTypeOf<ReducedDerivedIsContext>().toEqualTypeOf<false>();
        expectTypeOf<ReducedDerivedIsEmptyObject>().toEqualTypeOf<false>();
        expectTypeOf<IsExact<ReducedContext, {}>>().toEqualTypeOf<true>();
        expectTypeOf<ReducedMatchesDerived>().toEqualTypeOf<false>();
      });

      it('inferA still accepts empty context when inline tools are preserved first', () => {
        const reduced = inferA({
          tools: preserve({
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
          }),
          context: {},
        });

        type ReducedTools = ObjectTools<typeof reduced>;
        type ReducedContext = ObjectContext<typeof reduced>;
        type ReducedWeatherContext = InferToolContext<ReducedTools['weather']>;

        expectTypeOf<IsAny<ReducedWeatherContext>>().toEqualTypeOf<false>();
        expectTypeOf<ReducedWeatherContext>().toMatchObjectType<{
          weatherApiKey: string;
        }>();
        expectTypeOf<IsExact<ReducedContext, {}>>().toEqualTypeOf<true>();
      });

      it('inferB rejects empty context for hoisted tools', () => {
        inferB({
          tools: mixedTools,
          // @ts-expect-error - inferB should require weatherApiKey for hoisted tools
          context: {},
        });
      });

      it('inferB accepts empty context for inline tools and collapses the call context to {}', () => {
        const reduced = inferB({
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
          context: {},
        });

        type ReducedTools = ObjectTools<typeof reduced>;
        type ReducedContext = ObjectContext<typeof reduced>;
        type ReducedWeatherContext = InferToolContext<ReducedTools['weather']>;

        expectTypeOf<IsAny<ReducedWeatherContext>>().toEqualTypeOf<false>();
        expectTypeOf<ReducedWeatherContext>().toMatchObjectType<{
          weatherApiKey: string;
        }>();
        expectTypeOf<IsExact<ReducedContext, {}>>().toEqualTypeOf<true>();
      });

      it('inferC rejects empty context for hoisted tools', () => {
        inferC({
          tools: mixedTools,
          // @ts-expect-error - inferC should require weatherApiKey for hoisted tools
          context: {},
          prepareStep: () => ({}),
        });
      });

      it('inferC accepts empty context for inline tools and collapses the call context to {}', () => {
        const reduced = inferC({
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
          context: {},
          prepareStep: () => ({}),
        });

        type ReducedTools = ObjectTools<typeof reduced>;
        type ReducedContext = ObjectContext<typeof reduced>;
        type ReducedWeatherContext = InferToolContext<ReducedTools['weather']>;

        expectTypeOf<IsAny<ReducedWeatherContext>>().toEqualTypeOf<false>();
        expectTypeOf<ReducedWeatherContext>().toMatchObjectType<{
          weatherApiKey: string;
        }>();
        expectTypeOf<IsExact<ReducedContext, {}>>().toEqualTypeOf<true>();
      });

      it('generateText still accepts empty context when inline tools are preserved first', async () => {
        const result = generateText({
          model: new MockLanguageModelV4(),
          prompt: 'What is the weather in San Francisco?',
          tools: preserve({
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
          }),
          context: {},
          prepareStep: () => ({}),
        });

        type InferredTools = ResultTools<typeof result>;
        type InferredContext = ResultContext<typeof result>;
        type WeatherContext = InferToolContext<InferredTools['weather']>;

        expectTypeOf<IsAny<WeatherContext>>().toEqualTypeOf<false>();
        expectTypeOf<WeatherContext>().toMatchObjectType<{
          weatherApiKey: string;
        }>();
        expectTypeOf<IsExact<InferredContext, {}>>().toEqualTypeOf<true>();
      });
    });
  });
});
