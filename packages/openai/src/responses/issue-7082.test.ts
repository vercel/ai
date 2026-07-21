import type {
  LanguageModelV2FunctionTool,
  LanguageModelV2Prompt,
} from '@ai-sdk/provider';
import { mockId } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { expect, it } from 'vitest';
import { OpenAIResponsesLanguageModel } from './openai-responses-language-model';

const server = createTestServer({
  'https://api.openai.com/v1/responses': {
    response: {
      type: 'json-value',
      body: JSON.parse(
        fs.readFileSync(
          'src/responses/__fixtures__/issue-7082-o3-optional-tool-parameters.json',
          'utf8',
        ),
      ),
    },
  },
});

const prompt: LanguageModelV2Prompt = [
  {
    role: 'user',
    content: [
      {
        type: 'text',
        text: 'Search for papers about machine learning.',
      },
    ],
  },
];

const semanticScholarSearch: LanguageModelV2FunctionTool = {
  type: 'function',
  name: 'semantic_scholar_search',
  description: 'Search academic papers using Semantic Scholar API.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'The text to search for. Convert the question to a sensible search query.',
      },
      limit: {
        type: 'integer',
        description: 'The maximum number of results to return. Min 5, max 100.',
      },
      offset: {
        type: 'integer',
        minimum: 0,
        description: 'The pagination offset.',
      },
      year: {
        type: 'integer',
        description: 'Restrict results to this publication year.',
      },
    },
    required: ['query'],
    additionalProperties: false,
    $schema: 'http://json-schema.org/draft-07/schema#',
  },
};

it('accepts an o3 tool with optional parameters when strictJsonSchema defaults to false', async () => {
  const model = new OpenAIResponsesLanguageModel('o3', {
    provider: 'openai.responses',
    url: ({ path }) => `https://api.openai.com/v1${path}`,
    headers: () => ({ Authorization: 'Bearer APIKEY' }),
    generateId: mockId(),
    fileIdPrefixes: ['file-'],
  });

  const result = await model.doGenerate({
    prompt,
    tools: [semanticScholarSearch],
    toolChoice: {
      type: 'tool',
      toolName: 'semantic_scholar_search',
    },
    maxOutputTokens: 1000,
  });

  expect(await server.calls[0].requestBodyJson).toMatchObject({
    model: 'o3',
    tools: [
      {
        type: 'function',
        name: 'semantic_scholar_search',
        strict: false,
        parameters: {
          required: ['query'],
          properties: {
            query: { type: 'string' },
            limit: { type: 'integer' },
            offset: { type: 'integer' },
            year: { type: 'integer' },
          },
        },
      },
    ],
  });
  expect(result.content).toContainEqual({
    type: 'tool-call',
    toolCallId: 'call_sllqlMEFqHePsbF1dDko4Pdq',
    toolName: 'semantic_scholar_search',
    input: '{"query":"machine learning","limit":10}',
    providerMetadata: {
      openai: {
        itemId: 'fc_0895dc792e938f60006a5f452b6ae081a09491832f50a63901',
      },
    },
  });
  expect(result.finishReason).toBe('tool-calls');
});
