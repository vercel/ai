import type { LanguageModelV2Prompt } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BedrockChatLanguageModel } from './bedrock-chat-language-model';
import { injectFetchHeaders } from './inject-fetch-headers';

const modelId = 'anthropic.claude-3-haiku-20240307-v1:0';
const generateUrl = `https://bedrock-runtime.us-east-1.amazonaws.com/model/${encodeURIComponent(modelId)}/converse`;

const server = createTestServer({
  [generateUrl]: {},
});

const model = new BedrockChatLanguageModel(modelId, {
  baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
  headers: {},
  fetch: injectFetchHeaders({ 'x-amz-auth': 'test-auth' }),
  generateId: () => 'test-id',
});

const prompt: LanguageModelV2Prompt = [
  {
    role: 'user',
    content: [{ type: 'text', text: 'Hello' }],
  },
];

function prepareFixture(filename: string) {
  server.urls[generateUrl].response = {
    type: 'json-value',
    body: JSON.parse(
      fs.readFileSync(`src/__fixtures__/${filename}.json`, 'utf8'),
    ),
  };
}

describe('issue #11363', () => {
  it('accepts a text response with a null top-level stop_sequence', async () => {
    prepareFixture('issue-11363-stop-sequence-null-end-turn');

    const result = await model.doGenerate({ prompt });

    expect(result.finishReason).toBe('stop');
    expect(result.content).toEqual([{ type: 'text', text: 'OK' }]);
  });

  it('accepts a tool-use response with a null top-level stop_sequence', async () => {
    prepareFixture('issue-11363-stop-sequence-null-tool-use');

    const result = await model.doGenerate({
      prompt,
      tools: [
        {
          type: 'function',
          name: 'weather',
          description: 'Get weather',
          inputSchema: {
            type: 'object',
            properties: { location: { type: 'string' } },
            required: ['location'],
            additionalProperties: false,
          },
        },
      ],
    });

    expect(result.finishReason).toBe('tool-calls');
    expect(result.content).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'tooluse_rTk04lpyTTTvtXcoOyVT6p',
        toolName: 'weather',
        input: '{"location":"Seattle"}',
      },
    ]);
  });
});
