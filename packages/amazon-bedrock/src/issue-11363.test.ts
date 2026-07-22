import type { LanguageModelV3Prompt } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { expect, it } from 'vitest';
import { BedrockChatLanguageModel } from './bedrock-chat-language-model';
import { injectFetchHeaders } from './inject-fetch-headers';

const modelId = 'us.anthropic.claude-sonnet-4-5-20250929-v1:0';
const baseUrl = 'https://bedrock-runtime.us-east-1.amazonaws.com';
const generateUrl = `${baseUrl}/model/${encodeURIComponent(modelId)}/converse`;

function readFixture(name: string) {
  return JSON.parse(fs.readFileSync(`src/__fixtures__/${name}.json`, 'utf8'));
}

const server = createTestServer({
  [generateUrl]: {
    response: {
      type: 'json-value',
      body: readFixture('issue-11363-stop-sequence-null'),
    },
  },
});

const model = new BedrockChatLanguageModel(modelId, {
  baseUrl: () => baseUrl,
  headers: {},
  fetch: injectFetchHeaders({ 'x-amz-auth': 'test-auth' }),
  generateId: () => 'test-id',
});

const prompt: LanguageModelV3Prompt = [
  {
    role: 'user',
    content: [
      {
        type: 'text',
        text: 'Use the querySalesforce tool to list account IDs.',
      },
    ],
  },
];

it('accepts a live response with stop_sequence: null', async () => {
  server.urls[generateUrl].response = {
    type: 'json-value',
    body: readFixture('issue-11363-stop-sequence-null'),
  };

  const result = await model.doGenerate({
    prompt,
    tools: [
      {
        type: 'function',
        name: 'querySalesforce',
        description: 'Query Salesforce',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
          additionalProperties: false,
        },
      },
    ],
    toolChoice: { type: 'tool', toolName: 'querySalesforce' },
  });

  expect(result.finishReason).toEqual({
    unified: 'tool-calls',
    raw: 'tool_use',
  });
  expect(result.content).toContainEqual({
    type: 'tool-call',
    toolCallId: 'tooluse_j6gIgqF8PljNKBylAe15oP',
    toolName: 'querySalesforce',
    input: '{"query":"SELECT Id FROM Account"}',
  });
});

it('accepts stop_sequence: null for a regular text response', async () => {
  server.urls[generateUrl].response = {
    type: 'json-value',
    body: readFixture('issue-11363-stop-sequence-null-end-turn'),
  };

  const result = await model.doGenerate({ prompt });

  expect(result.finishReason).toEqual({
    unified: 'stop',
    raw: 'end_turn',
  });
  expect(result.content).toContainEqual({
    type: 'text',
    text: 'Hello! How can I help you today?',
  });
});
