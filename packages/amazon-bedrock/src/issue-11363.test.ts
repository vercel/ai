import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import fs from 'node:fs';
import { expect, it } from 'vitest';
import { createAmazonBedrock } from './amazon-bedrock-provider';

const prompt: LanguageModelV4Prompt = [
  {
    role: 'user',
    content: [{ type: 'text', text: 'Use the weather tool for Seattle.' }],
  },
];

it('accepts a live response with top-level stop_sequence: null', async () => {
  const fixture = fs.readFileSync(
    'src/__fixtures__/issue-11363-stop-sequence-null.json',
    'utf8',
  );
  const provider = createAmazonBedrock({
    region: 'us-east-1',
    accessKeyId: 'test-access-key',
    secretAccessKey: 'test-secret-key',
    fetch: async () =>
      new Response(fixture, {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
  });

  const result = await provider(
    'anthropic.claude-3-haiku-20240307-v1:0',
  ).doGenerate({
    prompt,
    tools: [
      {
        type: 'function',
        name: 'weather',
        description: 'Get weather',
        inputSchema: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
          additionalProperties: false,
        },
      },
    ],
    toolChoice: { type: 'required' },
  });

  expect(result.finishReason).toEqual({
    unified: 'tool-calls',
    raw: 'tool_use',
  });
  expect(result.content).toEqual([
    {
      type: 'tool-call',
      toolCallId: 'tooluse_93FMnHYRGfM9Sz0BGGvFc4',
      toolName: 'weather',
      input: '{"city":"Seattle"}',
    },
  ]);
});
