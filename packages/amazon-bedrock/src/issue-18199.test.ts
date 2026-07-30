import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { prepareTools } from './amazon-bedrock-prepare-tools';

const directSonnet5Error = JSON.parse(
  fs.readFileSync(
    'src/__fixtures__/issue-18199-sonnet-5-strict-error.json',
    'utf8',
  ),
) as { message: string };

describe('issue #18199', () => {
  it('records that Bedrock rejects strict tools for Claude Sonnet 5', () => {
    expect(directSonnet5Error.message).toContain(
      'tools.0.custom.strict: Extra inputs are not permitted',
    );
  });

  it.each([
    'us.anthropic.claude-opus-4-7',
    'us.anthropic.claude-opus-4-8',
    'us.anthropic.claude-sonnet-5',
  ])('warns when strict:true is removed for %s', async modelId => {
    const result = await prepareTools({
      modelId,
      tools: [
        {
          type: 'function',
          name: 'get_weather',
          description: 'Get the weather for a city.',
          inputSchema: {
            type: 'object',
            properties: { city: { type: 'string' } },
            required: ['city'],
            additionalProperties: false,
          },
          strict: true,
        },
      ],
      toolChoice: { type: 'required' },
    });

    expect(result.toolConfig.tools?.[0]).not.toHaveProperty('toolSpec.strict');
    expect(result.toolWarnings).toContainEqual({
      type: 'unsupported',
      feature: 'strict',
      details:
        "Tool 'get_weather' has strict: true, but strict mode is not supported by this model on Amazon Bedrock. The strict property will be ignored.",
    });
  });
});
