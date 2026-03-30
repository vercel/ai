import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { Tool, tool } from '@ai-sdk/provider-utils';
import { filterActiveTools } from './filter-active-tool';

const mockTools = {
  tool1: tool({
    description: 'Tool 1 description',
    inputSchema: z.object({}),
  }),
  tool2: tool({
    description: 'Tool 2 description',
    inputSchema: z.object({ city: z.string() }),
  }),
};

const mockProviderTool: Tool = {
  type: 'provider',
  id: 'provider.tool-id',
  args: { key: 'value' },
  inputSchema: z.object({}),
};

const mockToolsWithProviderDefined = {
  ...mockTools,
  providerTool: mockProviderTool,
};

describe('filterActiveTools', () => {
  it('should return all tools when activeTools is not provided', () => {
    const result = filterActiveTools({
      tools: mockToolsWithProviderDefined,
      activeTools: undefined,
    });

    expect(result).toBe(mockToolsWithProviderDefined);
  });

  it('should filter tools based on activeTools', () => {
    const result = filterActiveTools({
      tools: mockToolsWithProviderDefined,
      activeTools: ['tool1', 'providerTool'],
    });

    expect(result).toEqual({
      tool1: mockTools.tool1,
      providerTool: mockProviderTool,
    });
  });
});
