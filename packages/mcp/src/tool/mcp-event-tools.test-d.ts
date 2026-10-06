import type { ToolSet } from '@ai-sdk/provider-utils';
import { expectTypeOf, it } from 'vitest';
import { experimental_eventToolsFromDefinitions as eventToolsFromDefinitions } from '../index';

it('returns tools compatible with AI SDK tool sets', () => {
  const tools = eventToolsFromDefinitions(
    { events: [] },
    {
      subscribe: (input, options) => {
        expectTypeOf(input.name).toBeString();
        expectTypeOf(input.arguments).toEqualTypeOf<Record<string, unknown>>();
        expectTypeOf(options.abortSignal).toEqualTypeOf<
          AbortSignal | undefined
        >();
        return { id: 'subscription', status: 'pending' };
      },
    },
  );
  expectTypeOf(tools).toExtend<ToolSet>();
});
