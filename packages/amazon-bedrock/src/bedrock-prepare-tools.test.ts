import { describe, expect, it } from 'vitest';
import { prepareTools } from './bedrock-prepare-tools';

const ANTHROPIC_MODEL = 'anthropic.claude-sonnet-4-5-20250929-v1:0';

describe('prepareTools', () => {
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
