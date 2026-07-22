import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { mockId } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { expect, it } from 'vitest';
import { OpenAIResponsesLanguageModel } from './openai-responses-language-model';

const server = createTestServer({
  'https://api.openai.com/v1/responses': {},
});

it('should replay a function named tool_search as a function call', async () => {
  server.urls['https://api.openai.com/v1/responses'].response = {
    type: 'json-value',
    body: JSON.parse(
      fs.readFileSync(
        'src/responses/__fixtures__/openai-tool-search.1.json',
        'utf8',
      ),
    ),
  };

  const model = new OpenAIResponsesLanguageModel('gpt-5.4-mini', {
    provider: 'openai',
    url: ({ path }) => `https://api.openai.com/v1${path}`,
    headers: () => ({ Authorization: 'Bearer APIKEY' }),
    generateId: mockId(),
  });

  const prompt: LanguageModelV4Prompt = [
    {
      role: 'user',
      content: [{ type: 'text', text: 'Search the records.' }],
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

  expect(await server.calls[0].requestBodyJson).toMatchObject({
    tools: [
      {
        type: 'function',
        name: 'tool_search',
      },
    ],
    input: [
      {
        role: 'user',
        content: [{ type: 'input_text', text: 'Search the records.' }],
      },
      {
        type: 'function_call',
        call_id: 'call_123',
        name: 'tool_search',
        arguments: '{"query":"synthetic query","limit":10}',
      },
      {
        type: 'function_call_output',
        call_id: 'call_123',
        output: '{"tools":[]}',
      },
    ],
  });
});
