import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod/v4';
import { createProviderExecutedToolFactory } from '../provider-executed-tool-factory';
import type { NotProviderExecutedTools } from './not-provider-executed-tools';
import { tool } from './tool';

describe('NotProviderExecutedTools', () => {
  const providerExecutedToolFactory = createProviderExecutedToolFactory<
    {},
    { action: string },
    { maxResults?: number }
  >({
    id: 'test.search',
    inputSchema: z.object({}),
    outputSchema: z.object({
      action: z.string(),
    }),
  });

  const tools = {
    weather: tool({
      inputSchema: z.object({
        city: z.string(),
      }),
    }),
    providerDefined: tool({
      type: 'provider',
      isProviderExecuted: false,
      id: 'test.lookup',
      args: {
        mode: 'safe',
      },
      inputSchema: z.object({
        query: z.string(),
      }),
      outputSchema: z.object({
        ok: z.boolean(),
      }),
    }),
    providerExecuted: providerExecutedToolFactory({
      maxResults: 3,
    }),
  };

  it('removes provider-executed tools from a mixed tool set', () => {
    type FilteredTools = NotProviderExecutedTools<typeof tools>;

    expectTypeOf<keyof FilteredTools>().toEqualTypeOf<
      'weather' | 'providerDefined'
    >();
    expectTypeOf<FilteredTools['weather']>().toEqualTypeOf<
      typeof tools.weather
    >();
    expectTypeOf<FilteredTools['providerDefined']>().toEqualTypeOf<
      typeof tools.providerDefined
    >();

    // @ts-expect-error provider-executed tools are removed from the filtered set
    type _RemovedTool = FilteredTools['providerExecuted'];
  });

  it('keeps all tools when none are provider-executed', () => {
    const toolsWithoutProviderExecution = {
      weather: tools.weather,
      providerDefined: tools.providerDefined,
    };

    expectTypeOf<
      NotProviderExecutedTools<typeof toolsWithoutProviderExecution>
    >().toEqualTypeOf<typeof toolsWithoutProviderExecution>();
  });

  it('returns an empty object when every tool is provider-executed', () => {
    const onlyProviderExecutedTools = {
      providerExecuted: tools.providerExecuted,
    };

    expectTypeOf<
      NotProviderExecutedTools<typeof onlyProviderExecutedTools>
    >().toEqualTypeOf<{}>();
  });
});
