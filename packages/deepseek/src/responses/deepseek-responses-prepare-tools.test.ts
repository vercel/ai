import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { prepareResponsesTools } from './deepseek-responses-prepare-tools';

const WEATHER_TOOL: NonNullable<LanguageModelV4CallOptions['tools']>[number] = {
  type: 'function',
  name: 'weather',
  description: 'Get the weather',
  inputSchema: { type: 'object', properties: {} },
};

const WEB_SEARCH_TOOL: NonNullable<
  LanguageModelV4CallOptions['tools']
>[number] = {
  type: 'provider',
  id: 'deepseek.web_search',
  name: 'web_search',
  args: {},
};

describe('prepareResponsesTools', () => {
  it('should return undefined for empty tools', () => {
    expect(prepareResponsesTools({ tools: [] })).toStrictEqual({
      tools: undefined,
      toolChoice: undefined,
      toolWarnings: [],
    });
  });

  it('should convert function tools', () => {
    expect(
      prepareResponsesTools({ tools: [WEATHER_TOOL] }).tools,
    ).toStrictEqual([
      {
        type: 'function',
        name: 'weather',
        description: 'Get the weather',
        parameters: { type: 'object', properties: {} },
      },
    ]);
  });

  it('should convert the web search tool without arguments', () => {
    expect(prepareResponsesTools({ tools: [WEB_SEARCH_TOOL] })).toStrictEqual({
      tools: [{ type: 'web_search' }],
      toolChoice: undefined,
      toolWarnings: [],
    });
  });

  it('should warn about other provider-defined tools', () => {
    const { tools, toolWarnings } = prepareResponsesTools({
      tools: [
        {
          type: 'provider',
          id: 'deepseek.code_execution',
          name: 'x',
          args: {},
        },
      ],
    });

    expect(tools).toStrictEqual([]);
    expect(toolWarnings).toStrictEqual([
      {
        type: 'unsupported',
        feature: 'provider-defined tool deepseek.code_execution',
      },
    ]);
  });

  it.each(['auto', 'none', 'required'] as const)(
    'should pass through the %s tool choice',
    type => {
      expect(
        prepareResponsesTools({
          tools: [WEATHER_TOOL],
          toolChoice: { type },
        }).toolChoice,
      ).toBe(type);
    },
  );

  it('should select a function tool by name', () => {
    expect(
      prepareResponsesTools({
        tools: [WEATHER_TOOL],
        toolChoice: { type: 'tool', toolName: 'weather' },
      }).toolChoice,
    ).toStrictEqual({ type: 'function', name: 'weather' });
  });

  it('should select the web search tool by its registered name', () => {
    expect(
      prepareResponsesTools({
        tools: [{ ...WEB_SEARCH_TOOL, name: 'search_the_web' }],
        toolChoice: { type: 'tool', toolName: 'search_the_web' },
      }).toolChoice,
    ).toStrictEqual({ type: 'web_search' });
  });
});
