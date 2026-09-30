import type { ResolvedToolCallers } from '../generate-text/tool-caller-configuration';
import {
  experimental_toolCaller,
  tool,
  type ToolSet,
} from '@ai-sdk/provider-utils';
import { describe, expect, it, vi } from 'vitest';
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

  it('passes only eligible tools with resolved descriptions to a custom search', async () => {
    const customSearch = vi.fn((_query: string, candidates) =>
      candidates.map((candidate: { name: string }) => candidate.name),
    );
    const registry = {
      ...tools,
      search: toolSearch({ search: customSearch }),
      otherCode: caller,
      otherWeather: weather,
      inactiveWeather: weather,
      getWeather: tool({
        deferLoading: true,
        contextSchema: z.object({ capability: z.string() }),
        description: ({ context }) => context.capability,
        inputSchema: z.object({}),
      }),
    };
    const prepare = createToolSearchState({
      tools: registry,
      toolCallers: {
        ...toolCallers,
        otherWeather: ['otherCode'],
        inactiveWeather: ['code'],
      },
    });
    const { inactiveWeather: _inactive, ...activeTools } = registry;

    expect(
      await search(
        prepare(activeTools, {
          toolsContext: { getWeather: { capability: 'Meteorology' } },
        })!,
        'forecast service',
      ),
    ).toEqual({
      tools: [{ name: 'getWeather', description: 'Meteorology' }],
    });
    expect(customSearch).toHaveBeenCalledWith('forecast service', [
      { name: 'getWeather', description: 'Meteorology' },
    ]);
    expect(prepare(activeTools)!.getWeather).toBe(registry.getWeather);
    expect(prepare(registry)!.inactiveWeather).toBeUndefined();
    expect(prepare(registry)!.otherWeather).toBeUndefined();
  });

  it('preserves custom ranking, ignores unknown names, and caps results at five', async () => {
    const candidates = Object.fromEntries(
      Array.from({ length: 6 }, (_, i) => [`candidate${i}`, weather]),
    );
    const rankedNames = [
      'unknown',
      'candidate5',
      'candidate3',
      'candidate4',
      'candidate1',
      'candidate2',
      'candidate0',
    ];
    const registry = {
      code: caller,
      search: toolSearch({ search: () => rankedNames }),
      ...candidates,
    };
    const prepare = createToolSearchState({
      tools: registry,
      toolCallers: {
        search: ['code'],
        ...Object.fromEntries(
          Object.keys(candidates).map(name => [name, ['code']]),
        ),
      },
    });

    expect(
      await search(prepare(registry)!, 'ignored by custom ranking'),
    ).toEqual({
      tools: rankedNames.slice(1, 6).map(name => ({
        name,
        description: 'Weather forecast.',
      })),
    });
    expect(Object.keys(prepare(registry)!)).toEqual([
      'code',
      'search',
      'candidate1',
      'candidate2',
      'candidate3',
      'candidate4',
      'candidate5',
    ]);
  });

  it('awaits PromiseLike custom search results', async () => {
    const registry = {
      ...tools,
      search: toolSearch({
        search: (_query, candidates) => ({
          // oxlint-disable-next-line unicorn/no-thenable -- Verify support for arbitrary PromiseLike results.
          then: onfulfilled =>
            Promise.resolve(onfulfilled!([candidates[0].name])),
        }),
      }),
    };
    const prepare = createToolSearchState({ tools: registry, toolCallers });

    expect(await search(prepare(registry)!, 'anything')).toEqual({
      tools: [{ name: 'getWeather', description: 'Weather forecast.' }],
    });
  });

  it('does not discover tools when a custom search rejects', async () => {
    const error = new Error('ranking failed');
    const registry = {
      ...tools,
      search: toolSearch({
        search: async () => {
          throw error;
        },
      }),
    };
    const prepare = createToolSearchState({ tools: registry, toolCallers });

    await expect(search(prepare(registry)!, 'weather')).rejects.toBe(error);
    expect(prepare(registry)!.getWeather).toBeUndefined();
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

  it('preserves custom search options when spreading the tool', async () => {
    const customSearch = vi.fn(() => ['getWeather']);
    const registry = {
      ...tools,
      search: {
        ...toolSearch({ search: customSearch }),
        description: 'Custom search',
      },
    };
    const prepare = createToolSearchState({ tools: registry, toolCallers });
    expect(await search(prepare(registry)!, 'weather')).toMatchObject({
      tools: [{ name: 'getWeather' }],
    });
    expect(customSearch).toHaveBeenCalledOnce();
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
