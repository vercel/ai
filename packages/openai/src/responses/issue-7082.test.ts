import { mockId } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { expect, it } from 'vitest';
import { OpenAIResponsesLanguageModel } from './openai-responses-language-model';

const server = createTestServer({
  'https://api.openai.com/v1/responses': {},
});

it('accepts an o3 tool schema with optional properties when strict is omitted', async () => {
  server.urls['https://api.openai.com/v1/responses'].response = {
    type: 'json-value',
    body: JSON.parse(
      fs.readFileSync(
        'src/responses/__fixtures__/issue-7082-o3-optional-tool-parameters.json',
        'utf8',
      ),
    ),
  };

  const model = new OpenAIResponsesLanguageModel('o3', {
    provider: 'openai.responses',
    url: ({ path }) => `https://api.openai.com/v1${path}`,
    headers: () => ({ Authorization: 'Bearer APIKEY' }),
    generateId: mockId(),
  });

  const result = await model.doGenerate({
    prompt: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Search for papers about machine learning.' },
        ],
      },
    ],
    tools: [
      {
        type: 'function',
        name: 'semantic_scholar_search',
        description: 'Search academic papers using Semantic Scholar API.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            limit: { type: 'integer' },
            offset: { type: 'integer', minimum: 0 },
            year: { type: 'integer' },
          },
          required: ['query'],
          additionalProperties: false,
        },
      },
    ],
    toolChoice: {
      type: 'tool',
      toolName: 'semantic_scholar_search',
    },
  });

  const requestBody = await server.calls[0].requestBodyJson;
  expect(requestBody.tools[0].parameters.required).toEqual(['query']);
  expect(requestBody.tools[0]).not.toHaveProperty('strict');

  const toolCall = result.content.find(part => part.type === 'tool-call');
  expect(toolCall).toMatchObject({
    type: 'tool-call',
    toolName: 'semantic_scholar_search',
  });
  expect(JSON.parse(toolCall!.input)).toEqual({
    query: 'machine learning',
    limit: 10,
    offset: 0,
    year: 0,
  });
});
