import { describe, expectTypeOf, it } from 'vitest';
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

const mockProviderDefinedTool: Tool = {
  type: 'provider',
  id: 'provider.tool-id',
  isProviderExecuted: false,
  args: { key: 'value' },
  inputSchema: z.object({}),
};

const mockToolsWithProviderDefined = {
  ...mockTools,
  providerTool: mockProviderDefinedTool,
};

describe('filterActiveTools types', () => {
  it('should infer the active tool subset for literal activeTools', () => {
    const result = filterActiveTools({
      tools: mockToolsWithProviderDefined,
      activeTools: ['tool1', 'providerTool'] as const,
    });

    expectTypeOf<typeof result>().toEqualTypeOf<
      | Pick<typeof mockToolsWithProviderDefined, 'tool1' | 'providerTool'>
      | undefined
    >();
  });

  it('should preserve the full tool set when activeTools is undefined', () => {
    const result = filterActiveTools({
      tools: mockToolsWithProviderDefined,
      activeTools: undefined,
    });

    expectTypeOf<typeof result>().toEqualTypeOf<
      typeof mockToolsWithProviderDefined | undefined
    >();
  });

  it('should preserve the full tool set for non-literal activeTools arrays', () => {
    const activeTools: Array<keyof typeof mockToolsWithProviderDefined> = [
      'tool1',
    ];

    const result = filterActiveTools({
      tools: mockToolsWithProviderDefined,
      activeTools,
    });

    expectTypeOf<typeof result>().toEqualTypeOf<
      typeof mockToolsWithProviderDefined | undefined
    >();
  });
});
