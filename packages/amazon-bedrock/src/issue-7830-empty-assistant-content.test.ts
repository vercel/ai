import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BedrockChatLanguageModel } from './bedrock-chat-language-model';

const errorResponse = fs.readFileSync(
  'src/__fixtures__/issue-7830-empty-assistant-content-error.json',
  'utf8',
);
const successResponse = fs.readFileSync(
  'src/__fixtures__/issue-7830-empty-assistant-content-success.json',
  'utf8',
);

describe('issue #7830', () => {
  it('completes a follow-up after empty text is removed from an unsigned reasoning turn', async () => {
    const model = new BedrockChatLanguageModel('us.amazon.nova-pro-v1:0', {
      baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
      headers: {},
      generateId: () => 'test-id',
      fetch: async (_url, init) => {
        const requestBody = JSON.parse(String(init?.body));
        const hasEmptyAssistantContent = requestBody.messages.some(
          (message: { role: string; content: unknown[] }) =>
            message.role === 'assistant' && message.content.length === 0,
        );

        return new Response(
          hasEmptyAssistantContent ? errorResponse : successResponse,
          {
            status: hasEmptyAssistantContent ? 400 : 200,
            headers: { 'content-type': 'application/json' },
          },
        );
      },
    });

    const result = await model.doGenerate({
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'First turn' }],
        },
        {
          role: 'assistant',
          content: [{ type: 'reasoning', text: 'Reasoning-only response' }],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'Reply with exactly OK' }],
        },
      ],
    });

    expect(result.content).toContainEqual({ type: 'text', text: 'OK' });
  });
});
