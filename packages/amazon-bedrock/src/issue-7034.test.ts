import type { LanguageModelV2Prompt } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { expect, it } from 'vitest';
import { BedrockChatLanguageModel } from './bedrock-chat-language-model';
import { injectFetchHeaders } from './inject-fetch-headers';

const modelId = 'us.anthropic.claude-3-haiku-20240307-v1:0';
const baseUrl = 'https://bedrock-runtime.us-east-1.amazonaws.com';
const generateUrl = `${baseUrl}/model/${encodeURIComponent(modelId)}/converse`;

const fixture = fs.readFileSync(
  'src/__fixtures__/issue-7034-error.json',
  'utf8',
);

const server = createTestServer({
  [generateUrl]: {
    response: {
      type: 'error',
      status: 400,
      body: fixture,
    },
  },
});

const model = new BedrockChatLanguageModel(modelId, {
  baseUrl: () => baseUrl,
  headers: {},
  fetch: injectFetchHeaders({ 'x-amz-auth': 'test-auth' }),
  generateId: () => 'test-id',
});

const prompt: LanguageModelV2Prompt = [
  {
    role: 'user',
    content: [
      {
        type: 'text',
        text: 'Can you change my password? My username is "adam".',
      },
    ],
  },
  {
    role: 'assistant',
    content: [
      {
        type: 'reasoning',
        text: 'I should call reset_password.',
      },
      {
        type: 'tool-call',
        toolCallId: 'tooluse_issue_7034',
        toolName: 'reset_password',
        input: { username: 'adam', password: 'blah' },
      },
    ],
  },
  {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId: 'tooluse_issue_7034',
        toolName: 'reset_password',
        output: {
          type: 'text',
          value:
            '{"success":false,"message":"Password must be at least 8 characters long"}',
        },
      },
    ],
  },
];

it('continues after an extractReasoningMiddleware tool result', async () => {
  try {
    await model.doGenerate({
      prompt,
      tools: [
        {
          type: 'function',
          name: 'reset_password',
          description: 'Reset a user password.',
          inputSchema: {
            type: 'object',
            properties: {
              username: { type: 'string' },
              password: { type: 'string' },
            },
            required: ['username', 'password'],
            additionalProperties: false,
          },
        },
      ],
    });
  } catch (error) {
    const requestBody = await server.calls[0].requestBodyJson;

    expect(requestBody.messages).toMatchObject([
      { role: 'user' },
      {
        role: 'assistant',
        content: [
          {
            reasoningContent: {
              reasoningText: { text: 'I should call reset_password.' },
            },
          },
          { toolUse: { toolUseId: 'tooluse_issue_7034' } },
        ],
      },
      {
        role: 'user',
        content: [{ toolResult: { toolUseId: 'tooluse_issue_7034' } }],
      },
    ]);

    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('User messages cannot contain reasoning content')) {
      throw new Error(`ISSUE_7034_REPRODUCED: ${message}`);
    }

    throw error;
  }
});
