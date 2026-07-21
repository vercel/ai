import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { BedrockChatLanguageModel } from './bedrock-chat-language-model';
import { injectFetchHeaders } from './inject-fetch-headers';

const modelId = 'anthropic.claude-3-haiku-20240307-v1:0';
const baseUrl = 'https://bedrock-runtime.us-east-1.amazonaws.com';
const generateUrl = `${baseUrl}/model/${encodeURIComponent(modelId)}/converse`;

const server = createTestServer({
  [generateUrl]: {},
});

const model = new BedrockChatLanguageModel(modelId, {
  baseUrl: () => baseUrl,
  headers: {},
  fetch: injectFetchHeaders({ 'x-amz-auth': 'test-auth' }),
  generateId: () => 'test-id',
});

describe('issue #7034', () => {
  beforeEach(() => {
    server.urls[generateUrl].response = {
      type: 'json-value',
      body: JSON.parse(
        fs.readFileSync(
          'src/__fixtures__/issue-7034-tool-result-continuation.json',
          'utf8',
        ),
      ),
    };
  });

  it('omits unsigned reasoning and accepts the user-role tool result', async () => {
    const result = await model.doGenerate({
      prompt: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Reset the password for adam to blah.',
            },
          ],
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'reasoning',
              text: 'I should call the reset_password tool.',
            },
            {
              type: 'tool-call',
              toolCallId: 'tooluse_issue7034',
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
              toolCallId: 'tooluse_issue7034',
              toolName: 'reset_password',
              output: {
                type: 'text',
                value:
                  '{"success":false,"message":"Password reset failed: Password must be at least 8 characters long"}',
              },
            },
          ],
        },
      ],
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

    expect(result.content).toEqual([
      {
        type: 'text',
        text: expect.stringContaining('not long enough'),
      },
    ]);
    expect(await server.calls[0].requestBodyJson).toMatchObject({
      messages: [
        {
          role: 'user',
          content: [{ text: 'Reset the password for adam to blah.' }],
        },
        {
          role: 'assistant',
          content: [
            {
              toolUse: {
                toolUseId: 'tooluse_issue7034',
                name: 'reset_password',
                input: { username: 'adam', password: 'blah' },
              },
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              toolResult: {
                toolUseId: 'tooluse_issue7034',
                content: [
                  {
                    text: '{"success":false,"message":"Password reset failed: Password must be at least 8 characters long"}',
                  },
                ],
              },
            },
          ],
        },
      ],
    });
  });
});
