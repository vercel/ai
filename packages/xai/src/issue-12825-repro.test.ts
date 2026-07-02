import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { XaiChatLanguageModel } from './xai-chat-language-model';

const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const server = createTestServer({
  'https://api.x.ai/v1/chat/completions': {
    response: {
      type: 'json-value',
      body: {
        id: 'chatcmpl-issue-12825',
        object: 'chat.completion',
        created: 1_234,
        model: 'grok-3',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'ok',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 1,
          completion_tokens: 1,
          total_tokens: 2,
        },
      },
    },
  },
});

describe('issue #12825 reproduction', () => {
  it('xAI chat should forward supported penalty and stop parameters without unsupported warnings', async () => {
    const model = new XaiChatLanguageModel('grok-3', {
      provider: 'xai.chat',
      baseURL: 'https://api.x.ai/v1',
      headers: () => ({ authorization: 'Bearer test-api-key' }),
      generateId: () => 'test-id',
    });

    const result = await model.doGenerate({
      prompt: TEST_PROMPT,
      frequencyPenalty: 0.25,
      presencePenalty: 0.5,
      stopSequences: ['STOP'],
    });

    expect(result.warnings).not.toContainEqual({
      type: 'unsupported',
      feature: 'frequencyPenalty',
    });
    expect(result.warnings).not.toContainEqual({
      type: 'unsupported',
      feature: 'presencePenalty',
    });
    expect(result.warnings).not.toContainEqual({
      type: 'unsupported',
      feature: 'stopSequences',
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      frequency_penalty: 0.25,
      presence_penalty: 0.5,
      stop: ['STOP'],
    });
  });
});
