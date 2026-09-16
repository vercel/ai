import { describe, expect, it } from 'vitest';
import { prepareTools } from './bedrock-prepare-tools';

const ANTHROPIC_MODEL = 'anthropic.claude-sonnet-4-5-20250929-v1:0';
const APPLICATION_PROFILE_ARN =
  'arn:aws:bedrock:us-east-1:474668406012:application-inference-profile/kr2b9n8klm2f';

describe('prepareTools', () => {
  it('uses Anthropic tool options for an application profile when the model family is declared', async () => {
    type PrepareToolsWithFamily = (
      options: Parameters<typeof prepareTools>[0] & {
        modelFamily: 'anthropic';
      },
    ) => ReturnType<typeof prepareTools>;

    const result = await (prepareTools as PrepareToolsWithFamily)({
      tools: [
        {
          type: 'function',
          name: 'testFunction',
          description: 'Test',
          inputSchema: {},
        },
      ],
      toolChoice: { type: 'auto' },
      modelId: APPLICATION_PROFILE_ARN,
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
