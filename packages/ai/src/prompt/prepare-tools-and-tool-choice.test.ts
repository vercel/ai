import { z } from 'zod/v4';
import { ToolSet } from '../generate-text/tool-set';
import { prepareToolsAndToolChoice } from './prepare-tools-and-tool-choice';
import { Tool, tool } from '@ai-sdk/provider-utils';
import { LanguageModelV2FunctionTool } from '@ai-sdk/provider';

const mockTools: ToolSet = {
  tool1: tool({
    description: 'Tool 1 description',
    inputSchema: z.object({}),
  }),
  tool2: tool({
    description: 'Tool 2 description',
    inputSchema: z.object({ city: z.string() }),
  }),
};

const mockProviderDefinedTool: Tool = {
  type: 'provider-defined',
  id: 'provider.tool-id',
  name: 'tool-id',
  args: { key: 'value' },
  inputSchema: z.object({}),
};

const mockToolsWithProviderDefined: ToolSet = {
  ...mockTools,
  providerTool: mockProviderDefinedTool,
};

it('should return undefined for both tools and toolChoice when tools is not provided', () => {
  const result = prepareToolsAndToolChoice({
    tools: undefined,
    toolChoice: undefined,
    activeTools: undefined,
  });
  expect(result).toEqual({ tools: undefined, toolChoice: undefined });
});

it('should return all tools when activeTools is not provided', () => {
  const result = prepareToolsAndToolChoice({
    tools: mockTools,
    toolChoice: undefined,
    activeTools: undefined,
  });
  expect(result.tools).toHaveLength(2);
  expect((result.tools?.[0] as LanguageModelV2FunctionTool).name).toBe('tool1');
  expect((result.tools?.[1] as LanguageModelV2FunctionTool).name).toBe('tool2');
  expect(result.toolChoice).toEqual({ type: 'auto' });
});

it('should filter tools based on activeTools', () => {
  const result = prepareToolsAndToolChoice({
    tools: mockTools,
    toolChoice: undefined,
    activeTools: ['tool1'],
  });
  expect(result.tools).toHaveLength(1);
  expect((result.tools?.[0] as LanguageModelV2FunctionTool).name).toBe('tool1');
  expect(result.toolChoice).toEqual({ type: 'auto' });
});

it('should handle string toolChoice', () => {
  const result = prepareToolsAndToolChoice({
    tools: mockTools,
    toolChoice: 'none',
    activeTools: undefined,
  });
  expect(result.tools).toHaveLength(2);
  expect(result.toolChoice).toEqual({ type: 'none' });
});

it('should handle object toolChoice', () => {
  const result = prepareToolsAndToolChoice({
    tools: mockTools,
    toolChoice: { type: 'tool', toolName: 'tool2' },
    activeTools: undefined,
  });
  expect(result.tools).toHaveLength(2);
  expect(result.toolChoice).toEqual({ type: 'tool', toolName: 'tool2' });
});

it('should correctly map tool properties', () => {
  const result = prepareToolsAndToolChoice({
    tools: mockTools,
    toolChoice: undefined,
    activeTools: undefined,
  });
  expect(result.tools?.[0]).toEqual({
    type: 'function',
    name: 'tool1',
    description: 'Tool 1 description',
    inputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      additionalProperties: false,
      type: 'object',
      properties: {},
    },
  });
});

it('should handle provider-defined tool type', () => {
  const result = prepareToolsAndToolChoice({
    tools: mockToolsWithProviderDefined,
    toolChoice: undefined,
    activeTools: undefined,
  });
  expect(result.tools).toHaveLength(3);
  expect(result.tools?.[2]).toEqual({
    type: 'provider-defined',
    name: 'providerTool',
    id: 'provider.tool-id',
    args: { key: 'value' },
  });
});
