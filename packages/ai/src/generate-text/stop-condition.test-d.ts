import { tool, type ToolSet } from '@ai-sdk/provider-utils';
import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod/v4';
import { hasRepeatedToolCalls, type StopCondition } from './stop-condition';

describe('hasRepeatedToolCalls', () => {
  it('should return a stop condition that works with any tool set', () => {
    const tools = {
      weather: tool({
        inputSchema: z.object({ city: z.string() }),
      }),
    } satisfies ToolSet;

    expectTypeOf(hasRepeatedToolCalls(3)).toMatchTypeOf<
      StopCondition<typeof tools>
    >();
  });

  it('should accept the compareResults option', () => {
    expectTypeOf(
      hasRepeatedToolCalls(3, { compareResults: true }),
    ).toMatchTypeOf<StopCondition<ToolSet>>();
  });

  it('should reject unknown options', () => {
    // @ts-expect-error - unknown options are not supported
    hasRepeatedToolCalls(3, { compareInputs: true });
  });
});
