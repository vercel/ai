import { describe, expect, it } from 'vitest';
import { prepareTools } from './bedrock-prepare-tools';

const ANTHROPIC_MODEL = 'anthropic.claude-sonnet-4-5-20250929-v1:0';

describe('prepareTools', () => {
  it('should use Anthropic tool choice fields for a declared Anthropic application inference profile', async () => {
    const result = await prepareTools({
      tools: [
        {
          type: 'function',
          name: 'testFunction',
          description: 'Test',
          inputSchema: {},
        },
      ],
      modelId:
        'arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/custom-profile',
      modelFamily: 'anthropic',
      disableParallelToolUse: true,
    });

    expect(result.additionalTools).toEqual({
      tool_choice: {
        type: 'auto',
        disable_parallel_tool_use: true,
      },
    });
    expect(result.toolConfig.toolChoice).toBeUndefined();
  });

  it.each([
    {
      toolChoice: undefined,
      expected: { type: 'auto', disable_parallel_tool_use: true },
    },
    {
      toolChoice: { type: 'auto' } as const,
      expected: { type: 'auto', disable_parallel_tool_use: true },
    },
    {
      toolChoice: { type: 'required' } as const,
      expected: { type: 'any', disable_parallel_tool_use: true },
    },
    {
      toolChoice: {
        type: 'tool',
        toolName: 'testFunction',
      } as const,
      expected: {
        type: 'tool',
        name: 'testFunction',
        disable_parallel_tool_use: true,
      },
    },
  ])(
    'should use Anthropic tool choice fields when parallel tool use is disabled',
    async ({ toolChoice, expected }) => {
      const result = await prepareTools({
        tools: [
          {
            type: 'function',
            name: 'testFunction',
            description: 'Test',
            inputSchema: {},
          },
        ],
        toolChoice,
        modelId: ANTHROPIC_MODEL,
        disableParallelToolUse: true,
      });

      expect(result.additionalTools).toEqual({
        tool_choice: expected,
      });
      expect(result.toolConfig.toolChoice).toBeUndefined();
    },
  );
});

describe('named tool cache compatibility', () => {
  const tools = ['lookup', 'unused'].map(name => ({
    type: 'function' as const,
    name,
    inputSchema: { type: 'object' as const },
  }));
  it.each([undefined, true, false])(
    'retains the catalog with disableParallelToolUse %s',
    async disableParallelToolUse => {
      const result = await prepareTools({
        tools,
        modelId: ANTHROPIC_MODEL,
        toolChoice: { type: 'tool', toolName: 'lookup' },
        disableParallelToolUse,
      });
      expect(
        result.toolConfig.tools?.map(tool => (tool as any).toolSpec.name),
      ).toEqual(['lookup', 'unused']);
      if (disableParallelToolUse === false) {
        expect(result.additionalTools).toBeUndefined();
        expect(result.toolConfig.toolChoice).toEqual({
          tool: { name: 'lookup' },
        });
      } else {
        expect(result.additionalTools).toEqual({
          tool_choice: {
            type: 'tool',
            name: 'lookup',
            disable_parallel_tool_use: true,
          },
        });
        expect(result.toolConfig.toolChoice).toBeUndefined();
      }
    },
  );
});
