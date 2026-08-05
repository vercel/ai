import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { mockId } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { expect, it } from 'vitest';
import { OpenAIResponsesLanguageModel } from './openai-responses-language-model';

const prompt: LanguageModelV4Prompt = [
  {
    role: 'user',
    content: [{ type: 'text', text: 'Search the synthetic records.' }],
  },
  {
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolCallId: 'call_123',
        toolName: 'tool_search',
        input: {
          query: 'synthetic query',
          limit: 10,
        },
      },
    ],
  },
  {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId: 'call_123',
        toolName: 'tool_search',
        output: {
          type: 'json',
          value: { tools: [] },
        },
      },
    ],
  },
];

const server = createTestServer({
  'https://api.openai.com/v1/responses': {},
});

it('replays a regular function named tool_search as a function call', async () => {
  const liveErrorFixture = fs.readFileSync(
    'src/responses/__fixtures__/openai-issue-17402-error.1.json',
    'utf8',
  );

  server.urls['https://api.openai.com/v1/responses'].response = {
    type: 'error',
    status: 400,
    body: liveErrorFixture,
  };

  const model = new OpenAIResponsesLanguageModel('gpt-5.4-mini', {
    provider: 'openai',
    url: ({ path }) => `https://api.openai.com/v1${path}`,
    headers: () => ({ Authorization: 'Bearer APIKEY' }),
    generateId: mockId(),
  });

  let apiError: unknown;
  try {
    await model.doGenerate({
      prompt,
      tools: [
        {
          type: 'function',
          name: 'tool_search',
          description: 'Search synthetic records',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
              limit: { type: 'number' },
            },
            required: ['query', 'limit'],
            additionalProperties: false,
          },
        },
      ],
    });
  } catch (error) {
    apiError = error;
  }

  const requestBody = await server.calls[0].requestBodyJson;
  expect(requestBody.tools[0]).toMatchObject({
    type: 'function',
    name: 'tool_search',
  });

  const replayedCall = requestBody.input.find(
    (item: { type?: string }) => item.type === 'tool_search_call',
  );
  const errorMessage =
    apiError instanceof Error ? apiError.message : String(apiError);

  if (
    replayedCall != null &&
    !('arguments' in replayedCall) &&
    errorMessage.includes('Missing required parameter') &&
    errorMessage.includes('arguments')
  ) {
    throw new Error(
      'ISSUE_17402_REPRODUCED: regular function tool_search was replayed as tool_search_call without arguments and OpenAI rejected the request',
    );
  }

  expect(replayedCall).toEqual({
    type: 'function_call',
    call_id: 'call_123',
    name: 'tool_search',
    arguments: '{"query":"synthetic query","limit":10}',
  });
});
