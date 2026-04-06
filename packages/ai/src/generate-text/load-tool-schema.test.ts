import { describe, expect, it } from 'vitest';
import { tool } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import {
  buildEffectiveTools,
  createLoadToolSchemaTool,
  LOAD_TOOL_SCHEMA_NAME,
} from './load-tool-schema';

describe('LOAD_TOOL_SCHEMA_NAME', () => {
  it("equals '__load_tool_schema__'", () => {
    expect(LOAD_TOOL_SCHEMA_NAME).toBe('__load_tool_schema__');
  });
});

describe('createLoadToolSchemaTool', () => {
  it('returns tool with description listing lazy tool names', () => {
    const lazyTools = {
      getWeather: tool({
        description: 'Get weather',
        inputSchema: z.object({ city: z.string() }),
        lazy: true,
      }),
      searchDocs: tool({
        description: 'Search docs',
        inputSchema: z.object({ query: z.string() }),
        lazy: true,
      }),
    };

    const loadTool = createLoadToolSchemaTool(lazyTools);

    expect(loadTool.description).toContain('getWeather');
    expect(loadTool.description).toContain('searchDocs');
  });

  it('execute returns full inputSchema for requested tools', async () => {
    const lazyTools = {
      getWeather: tool({
        description: 'Get weather',
        inputSchema: z.object({ city: z.string() }),
        lazy: true,
      }),
    };

    const loadTool = createLoadToolSchemaTool(lazyTools);

    const result = await loadTool.execute!({ toolNames: ['getWeather'] }, {
      toolCallId: 'test-id',
      messages: [],
      abortSignal: undefined,
      experimental_context: undefined,
    } as any);

    expect(result).toBeDefined();
    const parsed = typeof result === 'string' ? JSON.parse(result) : result;

    // Should contain the full schema for getWeather with city property
    const weatherSchema = parsed.getWeather ?? parsed['getWeather'];
    expect(weatherSchema).toBeDefined();
    expect(weatherSchema.inputSchema).toBeDefined();
    expect(weatherSchema.inputSchema.properties).toHaveProperty('city');
  });

  it('execute returns skill text when present', async () => {
    const lazyTools = {
      myTool: tool({
        description: 'My tool',
        inputSchema: z.object({ x: z.number() }),
        lazy: true,
        skill: 'detailed usage info',
      }),
    };

    const loadTool = createLoadToolSchemaTool(lazyTools);

    const result = await loadTool.execute!({ toolNames: ['myTool'] }, {
      toolCallId: 'test-id',
      messages: [],
      abortSignal: undefined,
      experimental_context: undefined,
    } as any);

    const parsed = typeof result === 'string' ? JSON.parse(result) : result;
    const toolResult = parsed.myTool ?? parsed['myTool'];
    expect(toolResult).toBeDefined();
    expect(toolResult.skill).toBe('detailed usage info');
  });

  it('execute returns inputExamples when present', async () => {
    const lazyTools = {
      myTool: tool({
        description: 'My tool',
        inputSchema: z.object({ city: z.string() }),
        lazy: true,
        inputExamples: [{ input: { city: 'NYC' } }],
      }),
    };

    const loadTool = createLoadToolSchemaTool(lazyTools);

    const result = await loadTool.execute!({ toolNames: ['myTool'] }, {
      toolCallId: 'test-id',
      messages: [],
      abortSignal: undefined,
      experimental_context: undefined,
    } as any);

    const parsed = typeof result === 'string' ? JSON.parse(result) : result;
    const toolResult = parsed.myTool ?? parsed['myTool'];
    expect(toolResult).toBeDefined();
    expect(toolResult.inputExamples).toEqual([{ input: { city: 'NYC' } }]);
  });

  it('execute returns error entry for unknown tool names', async () => {
    const lazyTools = {
      myTool: tool({
        description: 'My tool',
        inputSchema: z.object({ x: z.number() }),
        lazy: true,
      }),
    };

    const loadTool = createLoadToolSchemaTool(lazyTools);

    const result = await loadTool.execute!({ toolNames: ['nonexistent'] }, {
      toolCallId: 'test-id',
      messages: [],
      abortSignal: undefined,
      experimental_context: undefined,
    } as any);

    const parsed = typeof result === 'string' ? JSON.parse(result) : result;

    expect(parsed.nonexistent).toEqual({
      error: "Tool 'nonexistent' is not a lazy tool or does not exist",
    });
  });

  it('execute handles mixed known and unknown names', async () => {
    const lazyTools = {
      validTool: tool({
        description: 'Valid tool',
        inputSchema: z.object({ name: z.string() }),
        lazy: true,
      }),
    };

    const loadTool = createLoadToolSchemaTool(lazyTools);

    const result = await loadTool.execute!(
      { toolNames: ['validTool', 'invalidTool'] },
      {
        toolCallId: 'test-id',
        messages: [],
        abortSignal: undefined,
        experimental_context: undefined,
      } as any,
    );

    const parsed = typeof result === 'string' ? JSON.parse(result) : result;

    const validResult = parsed.validTool ?? parsed['validTool'];
    expect(validResult).toBeDefined();
    expect(validResult.inputSchema).toBeDefined();

    expect(parsed.invalidTool).toEqual({
      error: "Tool 'invalidTool' is not a lazy tool or does not exist",
    });
  });
});

describe('buildEffectiveTools', () => {
  it('returns undefined when tools is undefined', () => {
    expect(buildEffectiveTools(undefined)).toBeUndefined();
  });

  it('returns tools unchanged when no lazy tools exist', () => {
    const tools = {
      eagerTool: tool({
        description: 'Eager',
        inputSchema: z.object({}),
      }),
    };

    const result = buildEffectiveTools(tools);
    expect(result).toBe(tools);
  });

  it('injects __load_tool_schema__ when lazy tools exist', () => {
    const tools = {
      eagerTool: tool({
        description: 'Eager',
        inputSchema: z.object({}),
      }),
      lazyTool: tool({
        description: 'Lazy',
        inputSchema: z.object({ q: z.string() }),
        lazy: true,
      }),
    };

    const result = buildEffectiveTools(tools) as Record<string, unknown>;
    expect(result).toBeDefined();
    expect(result[LOAD_TOOL_SCHEMA_NAME]).toBeDefined();
    expect(result.eagerTool).toBe(tools.eagerTool);
    expect(result.lazyTool).toBe(tools.lazyTool);
  });

  it('does not override user-provided __load_tool_schema__', () => {
    const customLoader = tool({
      description: 'Custom loader',
      inputSchema: z.object({}),
    });

    const tools = {
      [LOAD_TOOL_SCHEMA_NAME]: customLoader,
      lazyTool: tool({
        description: 'Lazy',
        inputSchema: z.object({}),
        lazy: true,
      }),
    };

    const result = buildEffectiveTools(tools);
    expect(result![LOAD_TOOL_SCHEMA_NAME]).toBe(customLoader);
  });
});
