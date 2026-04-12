import {
  tool,
  type Context,
  type InferToolContext,
  type Tool,
} from '@ai-sdk/provider-utils';
import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import type { ContextParameter } from './context-parameter';

describe('ContextParameter', () => {
  it('uses context?: never for an empty toolset without required user context', () => {
    type Tools = {};
    type Expected = {
      tools?: Tools;
      context?: never;
    };

    expectTypeOf<ContextParameter<Tools, Context>>().toMatchTypeOf<Expected>();
    expectTypeOf<Expected>().toMatchTypeOf<ContextParameter<Tools, Context>>();
  });

  it('uses context?: never when the inferred tool context has no required keys', () => {
    type Tools = {
      weather: Tool<{ city: string }>;
    };
    type Expected = {
      tools?: Tools;
      context?: never;
    };

    expectTypeOf<ContextParameter<Tools, Context>>().toMatchTypeOf<Expected>();
    expectTypeOf<Expected>().toMatchTypeOf<ContextParameter<Tools, Context>>();
  });

  it('makes context required when tool contextSchema adds required keys', () => {
    type Tools = {
      weather: Tool<{ city: string }, any, { userId: string }>;
    };
    type Expected = {
      tools?: Tools;
      context: {
        userId: string;
      } & Context;
    };

    expectTypeOf<ContextParameter<Tools, Context>>().toMatchTypeOf<Expected>();
    expectTypeOf<Expected>().toMatchTypeOf<ContextParameter<Tools, Context>>();
  });

  it('requires context for the mixed toolset from tool-call-with-context example', () => {
    type Tools = {
      weather: Tool<{ location: string }>;
      calculator: Tool<
        { expression: string },
        any,
        { calculatorApiKey: string }
      >;
    };
    type Expected = {
      tools?: Tools;
      context: {
        calculatorApiKey: string;
      } & Context;
    };

    expectTypeOf<ContextParameter<Tools, Context>>().toMatchTypeOf<Expected>();
    expectTypeOf<Expected>().toMatchTypeOf<ContextParameter<Tools, Context>>();
  });

  it('includes required keys from tool-call-with-context example contextSchema inference', () => {
    const tools = {
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
        execute: async ({ expression }, { context: { calculatorApiKey } }) => {
          return { expression, calculatorApiKey };
        },
      }),
    };

    type Expected = {
      tools?: typeof tools;
      context: {
        weatherApiKey: string;
      } & Context;
    };

    expectTypeOf<
      ContextParameter<typeof tools, Context>
    >().toMatchTypeOf<Expected>();
    expectTypeOf<Expected>().toMatchTypeOf<
      ContextParameter<typeof tools, Context>
    >();
  });

  it('keeps the weather tool context specific for the generateText regression toolset', () => {
    const tools = {
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

    type WeatherContext = InferToolContext<(typeof tools)['weather']>;

    expectTypeOf<WeatherContext>().toMatchObjectType<{
      weatherApiKey: string;
    }>();
    expectTypeOf<ContextParameter<typeof tools, Context>>().toMatchTypeOf<{
      tools?: typeof tools;
      context: {
        weatherApiKey: string;
      } & Context;
    }>();
  });

  it('makes context required for mixed toolsets when one tool has a contextSchema', () => {
    type Tools = {
      weather: Tool<{ city: string }, any, { userId: string }>;
      forecast: Tool<{ days: number }>;
    };
    type Expected = {
      tools?: Tools;
      context: {
        userId: string;
      } & Context;
    };

    expectTypeOf<ContextParameter<Tools, Context>>().toMatchTypeOf<Expected>();
    expectTypeOf<Expected>().toMatchTypeOf<ContextParameter<Tools, Context>>();
  });

  it('makes context required for an explicit context type with required keys', () => {
    type Tools = {
      weather: Tool<{ city: string }>;
    };
    type Expected = {
      tools?: Tools;
      context: Context & {
        requestId: string;
      };
    };

    expectTypeOf<
      ContextParameter<Tools, Context & { requestId: string }>
    >().toMatchTypeOf<Expected>();
    expectTypeOf<Expected>().toMatchTypeOf<
      ContextParameter<Tools, Context & { requestId: string }>
    >();
  });

  describe('negative cases', () => {
    it('errors when context is provided for an empty toolset without required user context', () => {
      type Tools = {};

      const unnecessaryContext: ContextParameter<Tools, Context> = {
        // @ts-expect-error - context is not accepted when neither tools nor user context require it
        context: {},
      };

      expectTypeOf(unnecessaryContext).toEqualTypeOf<
        ContextParameter<Tools, Context>
      >();
    });

    it('errors when context is omitted for a mixed toolset with one contextual tool', () => {
      type Tools = {
        weather: Tool<{ location: string }>;
        calculator: Tool<
          { expression: string },
          any,
          { calculatorApiKey: string }
        >;
      };

      // @ts-expect-error - context is required when one tool in the set requires it
      const missingContext: ContextParameter<Tools, Context> = {};

      expectTypeOf(missingContext).toEqualTypeOf<
        ContextParameter<Tools, Context>
      >();
    });

    it('errors when required contextual fields are missing', () => {
      type Tools = {
        weather: Tool<{ city: string }, any, { userId: string }>;
      };

      const missingRequiredField: ContextParameter<Tools, Context> = {
        // @ts-expect-error - required context fields from the tool set must be provided
        context: {},
      };

      expectTypeOf(missingRequiredField).toEqualTypeOf<
        ContextParameter<Tools, Context>
      >();
    });

    it('errors when tool-call-with-context example contextSchema keys are missing', () => {
      const tools = {
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
          execute: async (
            { expression },
            { context: { calculatorApiKey } },
          ) => {
            return { expression, calculatorApiKey };
          },
        }),
      };

      const missingExampleFields: ContextParameter<typeof tools, Context> = {
        tools,
        // @ts-expect-error - required contextSchema fields must be provided
        context: {},
      };

      expectTypeOf(missingExampleFields).toEqualTypeOf<
        ContextParameter<typeof tools, Context>
      >();
    });

    it('errors when explicit required context fields are missing', () => {
      type Tools = {
        weather: Tool<{ city: string }>;
      };

      const missingExplicitField: ContextParameter<
        Tools,
        Context & { requestId: string }
      > = {
        // @ts-expect-error - explicit required context fields must be provided
        context: {},
      };

      expectTypeOf(missingExplicitField).toEqualTypeOf<
        ContextParameter<Tools, Context & { requestId: string }>
      >();
    });
  });
});
