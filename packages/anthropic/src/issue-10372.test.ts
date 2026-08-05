import type { LanguageModelV2Prompt } from '@ai-sdk/provider';
import { mockId } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { expect, it, vi } from 'vitest';
import { createAnthropic } from './anthropic-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const prompt: LanguageModelV2Prompt = [
  {
    role: 'user',
    content: [{ type: 'text', text: 'What is the weather in Tokyo?' }],
  },
];

const server = createTestServer({
  'https://api.anthropic.com/v1/messages': {
    response: {
      type: 'json-value',
      body: JSON.parse(
        fs.readFileSync('src/__fixtures__/issue-10372-tool-use.1.json', 'utf8'),
      ),
    },
  },
});

it('keeps tools available when a JSON response format is configured', async () => {
  const model = createAnthropic({
    apiKey: 'test-api-key',
    generateId: mockId({ prefix: 'id' }),
  })('claude-sonnet-4-5-20250929');

  const result = await model.doGenerate({
    prompt,
    tools: [
      {
        type: 'function',
        name: 'getWeather',
        description: 'Get the weather for a city.',
        inputSchema: {
          type: 'object',
          properties: {
            city: { type: 'string' },
          },
          required: ['city'],
          additionalProperties: false,
        },
      },
    ],
    responseFormat: {
      type: 'json',
      schema: {
        type: 'object',
        properties: {
          weather: { type: 'string' },
        },
        required: ['weather'],
        additionalProperties: false,
      },
    },
  });

  expect(result.warnings).toEqual([]);
  expect(
    (await server.calls[0].requestBodyJson).tools.map(
      (tool: { name: string }) => tool.name,
    ),
  ).toContain('getWeather');
});
