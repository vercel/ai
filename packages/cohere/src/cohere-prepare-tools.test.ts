import { prepareTools } from './cohere-prepare-tools';
import { UnsupportedFunctionalityError } from '@ai-sdk/provider';

it('should return undefined tools when no tools are provided', () => {
  const result = prepareTools({
    type: 'regular',
    tools: [],
  });

  expect(result).toEqual({
    tools: undefined,
    tool_choice: undefined,
    toolWarnings: [],
  });
});

it('should process function tools correctly', () => {
  const functionTool = {
    type: 'function' as const,
    name: 'testFunction',
    description: 'test description',
    parameters: { type: 'object' as const, properties: {} },
  };

  const result = prepareTools({
    type: 'regular',
    tools: [functionTool],
  });

  expect(result).toEqual({
    tools: [
      {
        type: 'function',
        function: {
          name: 'testFunction',
          description: 'test description',
          parameters: { type: 'object' as const, properties: {} },
        },
      },
    ],
    tool_choice: undefined,
    toolWarnings: [],
  });
});

it('should add warnings for provider-defined tools', () => {
  const result = prepareTools({
    type: 'regular',
    tools: [
      {
        type: 'provider-defined' as const,
        name: 'providerTool',
        id: 'provider.tool',
        args: {},
      },
    ],
  });

  expect(result).toEqual({
    tools: [],
    tool_choice: undefined,
    toolWarnings: [
      {
        type: 'unsupported-tool',
        tool: {
          type: 'provider-defined' as const,
          name: 'providerTool',
          id: 'provider.tool',
          args: {},
        },
      },
    ],
  });
});

describe('tool choice handling', () => {
  const basicTool = {
    type: 'function' as const,
    name: 'testFunction',
    description: 'test description',
    parameters: { type: 'object' as const, properties: {} },
  };

  it('should handle auto tool choice', () => {
    const result = prepareTools({
      type: 'regular',
      tools: [basicTool],
      toolChoice: { type: 'auto' },
    });

    expect(result.tool_choice).toBe('auto');
  });

  it('should handle none tool choice by setting tools to undefined', () => {
    const result = prepareTools({
      type: 'regular',
      tools: [basicTool],
      toolChoice: { type: 'none' },
    });

    expect(result).toEqual({
      tools: undefined,
      tool_choice: 'any',
      toolWarnings: [],
    });
  });

  it('should throw error for required tool choice', () => {
    expect(() =>
      prepareTools({
        type: 'regular',
        tools: [basicTool],
        toolChoice: { type: 'required' },
      }),
    ).toThrow(UnsupportedFunctionalityError);
  });

  it('should throw error for tool type tool choice', () => {
    expect(() =>
      prepareTools({
        type: 'regular',
        tools: [basicTool],
        toolChoice: { type: 'tool', toolName: 'testFunction' },
      }),
    ).toThrow(UnsupportedFunctionalityError);
  });
});
