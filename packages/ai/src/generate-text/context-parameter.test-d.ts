import type { Context, Tool } from '@ai-sdk/provider-utils';
import { describe, expectTypeOf, it } from 'vitest';
import type { ContextParameter } from './context-parameter';

describe('ContextParameter', () => {
  it('makes context optional for an empty toolset', () => {
    type Tools = {};

    expectTypeOf<ContextParameter<Tools>>().toEqualTypeOf<{
      context?: Context;
    }>();
  });

  it('makes context optional when the inferred context type has no required keys', () => {
    type Tools = {
      weather: Tool<{ city: string }>;
    };

    expectTypeOf<ContextParameter<Tools>>().toEqualTypeOf<{
      context?: Context;
    }>();
  });

  it('makes context required when tool contextSchema adds required keys', () => {
    type Tools = {
      weather: Tool<{ city: string }, any, { userId: string }>;
    };

    expectTypeOf<ContextParameter<Tools>>().toEqualTypeOf<{
      context: {
        userId: string;
      } & Context;
    }>();
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

    expectTypeOf<ContextParameter<Tools>>().toEqualTypeOf<{
      context: {
        calculatorApiKey: string;
      } & Context;
    }>();
  });

  it('makes context required for mixed toolsets when one tool has a contextSchema', () => {
    type Tools = {
      weather: Tool<{ city: string }, any, { userId: string }>;
      forecast: Tool<{ days: number }>;
    };

    expectTypeOf<ContextParameter<Tools>>().toEqualTypeOf<{
      context: {
        userId: string;
      } & Context;
    }>();
  });

  it('makes context required for an explicit context type with required keys', () => {
    type Tools = {
      weather: Tool<{ city: string }>;
    };

    expectTypeOf<
      ContextParameter<Tools, Context & { requestId: string }>
    >().toEqualTypeOf<{
      context: Context & {
        requestId: string;
      };
    }>();
  });

  describe('negative cases', () => {
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
      const missingContext: ContextParameter<Tools> = {};

      expectTypeOf(missingContext).toEqualTypeOf<ContextParameter<Tools>>();
    });

    it('errors when required contextual fields are missing', () => {
      type Tools = {
        weather: Tool<{ city: string }, any, { userId: string }>;
      };

      const missingRequiredField: ContextParameter<Tools> = {
        // @ts-expect-error - required context fields from the tool set must be provided
        context: {},
      };

      expectTypeOf(missingRequiredField).toEqualTypeOf<
        ContextParameter<Tools>
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
