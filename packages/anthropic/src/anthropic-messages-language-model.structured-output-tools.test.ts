import type { LanguageModelV2Prompt } from '@ai-sdk/provider';
import {
  convertReadableStreamToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { expect, it, vi } from 'vitest';
import { createAnthropic } from './anthropic-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const TEST_PROMPT: LanguageModelV2Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const model = createAnthropic({
  apiKey: 'test-api-key',
  generateId: mockId({ prefix: 'id' }),
})('claude-3-haiku-20240307');

const server = createTestServer({
  'https://api.anthropic.com/v1/messages': {},
});

it('should stream a non-JSON tool call with a JSON response format', async () => {
  const chunks = fs
    .readFileSync(
      'src/__fixtures__/anthropic-json-other-tool.1.chunks.txt',
      'utf8',
    )
    .split('\n')
    .map(line => `data: ${line}\n\n`);
  chunks.push('data: [DONE]\n\n');

  server.urls['https://api.anthropic.com/v1/messages'].response = {
    type: 'stream-chunks',
    chunks,
  };

  const { stream } = await model.doStream({
    prompt: TEST_PROMPT,
    tools: [
      {
        type: 'function',
        name: 'weather',
        description: 'Get the weather in a location',
        inputSchema: {
          type: 'object',
          properties: {
            location: { type: 'string' },
          },
          required: ['location'],
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
          temperature: { type: 'number' },
        },
        required: ['weather', 'temperature'],
        additionalProperties: false,
      },
    },
  });

  expect(await server.calls[0].requestBodyJson).toMatchObject({
    tool_choice: {
      disable_parallel_tool_use: true,
      type: 'any',
    },
    tools: [
      expect.objectContaining({ name: 'weather' }),
      expect.objectContaining({ name: 'json' }),
    ],
  });

  expect(await convertReadableStreamToArray(stream)).toEqual(
    expect.arrayContaining([
      {
        type: 'tool-call',
        toolCallId: 'toolu_019Zvehfe1XQWweT1pm7okyt',
        toolName: 'weather',
        input: '{"location": "San Francisco"}',
        providerExecuted: undefined,
      },
      expect.objectContaining({
        type: 'finish',
        finishReason: 'tool-calls',
      }),
    ]),
  );
});
