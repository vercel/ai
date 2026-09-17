import type { ResolvedToolCallers } from '../generate-text/tool-caller-configuration';
import {
  experimental_toolCaller,
  tool,
  type ToolSet,
} from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { createToolSearchState } from './prepare-tool-search';
import { toolSearch } from './tool-search';

const caller = experimental_toolCaller(tool({ inputSchema: z.object({}) }), {
  type: 'local',
  bind: () => tool({ inputSchema: z.object({}) }),
  prepareModelMessage: () => 'catalog',
});
const weather = tool({
  deferLoading: true,
  description: 'Weather forecast.',
  inputSchema: z.object({ secretSchemaField: z.string() }),
  execute: () => 'sunny',
});
const tools = { code: caller, search: toolSearch(), getWeather: weather };
const toolCallers = { search: ['code'], getWeather: ['code'] };
const executionOptions = { toolCallId: 'search', messages: [], context: {} };

async function search(prepared: ToolSet, query: string) {
  return await prepared.search.execute!({ query }, executionOptions);
}

describe('deferred tool search', () => {
  it('resolves description functions with the current tool context', async () => {
    const registry = {
      ...tools,
      getWeather: tool({
        deferLoading: true,
        contextSchema: z.object({ capability: z.string() }),
        description: ({ context }) => context.capability,
        inputSchema: z.object({}),
      }),
    };
    const prepare = createToolSearchState({ tools: registry, toolCallers });
    expect(
      await search(
        prepare(registry, {
          toolsContext: { getWeather: { capability: 'Meteorology' } },
        })!,
        'meteorology',
      ),
    ).toEqual({ tools: [{ name: 'getWeather', description: 'Meteorology' }] });
  });

  it('accumulates independent searches in the same step', async () => {
    const registry = {
      ...tools,
      getStockPrice: tool({
        deferLoading: true,
        inputSchema: z.object({}),
      }),
    };
    const prepare = createToolSearchState({
      tools: registry,
      toolCallers: {
        ...toolCallers,
        getStockPrice: ['code'],
      },
    });
    const first = prepare(registry)!;
    await Promise.all([search(first, 'weather'), search(first, 'stock price')]);
    expect(Object.keys(first)).toEqual(['code', 'search']);
    expect(Object.keys(prepare(registry)!)).toEqual([
      'code',
      'search',
      'getWeather',
      'getStockPrice',
    ]);
  });

  it('discovers tools for the next preparation without exposing schemas in results', async () => {
    const prepare = createToolSearchState({ tools, toolCallers });
    const first = prepare(tools)!;
    expect(Object.keys(first)).toEqual(['code', 'search']);
    expect(await search(first, 'WEATHER')).toEqual({
      tools: [{ name: 'getWeather', description: 'Weather forecast.' }],
    });
    expect(Object.keys(first)).toEqual(['code', 'search']);
    expect(prepare(tools)!.getWeather).toBe(weather);
    expect(prepare(tools)!.getWeather).toBe(weather);
  });

  it('keeps state isolated when generations share tool instances', async () => {
    const first = createToolSearchState({ tools, toolCallers });
    const second = createToolSearchState({ tools, toolCallers });
    await search(first(tools)!, 'weather');
    expect(first(tools)!.getWeather).toBe(weather);
    expect(second(tools)!.getWeather).toBeUndefined();
    expect(() =>
      tools.search.execute!({ query: 'weather' }, executionOptions),
    ).toThrow('must be bound');
  });

  it('does not discover excluded tools or tools belonging to another caller', async () => {
    const registry = { ...tools, otherCode: caller, otherWeather: weather };
    const prepare = createToolSearchState({
      tools: registry,
      toolCallers: { ...toolCallers, otherWeather: ['otherCode'] },
    });
    const { getWeather: _excluded, ...eligible } = registry;
    expect(await search(prepare(eligible)!, 'weather')).toEqual({ tools: [] });
    await search(prepare(registry)!, 'weather');
    expect(prepare(eligible)!.getWeather).toBeUndefined();
    expect(prepare(registry)!.otherWeather).toBeUndefined();
  });

  it('requires an active caller to discover tools', async () => {
    const prepare = createToolSearchState({ tools, toolCallers });
    const { code: _excluded, ...eligible } = tools;
    expect(await search(prepare(eligible)!, 'weather')).toEqual({ tools: [] });
  });

  it.each(['unrelated', '   ', '.*'])(
    'returns no matches for %j',
    async query => {
      const prepare = createToolSearchState({ tools, toolCallers });
      expect(await search(prepare(tools)!, query)).toEqual({ tools: [] });
      expect(prepare(tools)!.getWeather).toBeUndefined();
    },
  );

  it('ranks names above descriptions and caps discovery at five tools', async () => {
    const candidates = Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [`candidate${i}`, weather]),
    );
    const registry = { ...candidates, ...tools };
    const prepare = createToolSearchState({
      tools: registry,
      toolCallers: {
        ...toolCallers,
        ...Object.fromEntries(
          Object.keys(candidates).map(name => [name, ['code']]),
        ),
      },
    });
    const result = await search(prepare(registry)!, 'weather');
    expect(result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      'getWeather',
      'candidate0',
      'candidate1',
      'candidate2',
      'candidate3',
    ]);
    expect(Object.keys(prepare(registry)!)).toHaveLength(7);
  });

  it('preserves the search marker when spreading the tool', async () => {
    const registry = {
      ...tools,
      search: { ...tools.search, description: 'Custom search' },
    };
    const prepare = createToolSearchState({ tools: registry, toolCallers });
    expect(await search(prepare(registry)!, 'weather')).toMatchObject({
      tools: [{ name: 'getWeather' }],
    });
  });

  it.each<ResolvedToolCallers | undefined>([
    undefined,
    {},
    { search: ['AI_SDK_DIRECT_TOOL_CALL'] },
    { getWeather: ['AI_SDK_DIRECT_TOOL_CALL'] },
    {
      search: ['AI_SDK_DIRECT_TOOL_CALL'],
      getWeather: ['AI_SDK_DIRECT_TOOL_CALL'],
    },
    {
      search: ['code', 'AI_SDK_DIRECT_TOOL_CALL'],
      getWeather: ['AI_SDK_DIRECT_TOOL_CALL'],
    },
  ])('discovers directly callable tools with routing %j', async routing => {
    const prepare = createToolSearchState({ tools, toolCallers: routing });
    const first = prepare(tools)!;
    expect(first.getWeather).toBeUndefined();
    expect(await search(first, 'weather')).toEqual({
      tools: [{ name: 'getWeather', description: 'Weather forecast.' }],
    });
    expect(first.getWeather).toBeUndefined();
    expect(prepare(tools)!.getWeather).toBe(weather);
  });

  it.each<ResolvedToolCallers>([
    { getWeather: [] },
    { search: [] },
    { getWeather: ['code'] },
    { search: ['code'] },
  ])('does not cross caller boundaries with routing %j', async routing => {
    const prepare = createToolSearchState({ tools, toolCallers: routing });
    expect(await search(prepare(tools)!, 'weather')).toEqual({ tools: [] });
    expect(prepare(tools)!.getWeather).toBeUndefined();
  });

  it('respects activeTools before and after direct discovery', async () => {
    const prepare = createToolSearchState({ tools, toolCallers: undefined });
    const { getWeather: _excluded, ...eligible } = tools;
    expect(await search(prepare(eligible)!, 'weather')).toEqual({ tools: [] });
    await search(prepare(tools)!, 'weather');
    expect(prepare(eligible)!.getWeather).toBeUndefined();
  });

  it('treats inherited routing properties as omitted entries', async () => {
    const registry = { search: toolSearch(), constructor: weather };
    const prepare = createToolSearchState({ tools: registry, toolCallers: {} });
    expect(await search(prepare(registry)!, 'weather')).toEqual({
      tools: [{ name: 'constructor', description: 'Weather forecast.' }],
    });
    expect(prepare(registry)!.constructor).toBe(weather);
  });

  it('rejects description discovery and provider callers', () => {
    for (const code of [
      experimental_toolCaller(tool({ inputSchema: z.object({}) }), {
        type: 'local',
        bind: () => tool({ inputSchema: z.object({}) }),
      }),
      experimental_toolCaller(tool({ inputSchema: z.object({}) }), {
        type: 'provider',
        prepareProviderOptions: () => ({}),
      }),
    ]) {
      expect(() =>
        createToolSearchState({ tools: { ...tools, code }, toolCallers }),
      ).toThrow("toolDiscovery: 'conversation'");
    }
  });

  it('rejects deferring the search tool itself', () => {
    expect(() =>
      createToolSearchState({
        tools: { ...tools, search: { ...tools.search, deferLoading: true } },
        toolCallers,
      }),
    ).toThrow('search tool itself must not defer loading');
  });
});
