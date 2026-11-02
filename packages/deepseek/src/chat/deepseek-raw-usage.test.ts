import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { createDeepSeek } from '../deepseek-provider';

const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const completeUsage = {
  prompt_tokens: 100,
  completion_tokens: 50,
  total_tokens: 150,
  prompt_cache_hit_tokens: 20,
  prompt_cache_miss_tokens: 80,
  prompt_tokens_details: {
    cached_tokens: 20,
    provider_prompt_metadata: { preserved: true },
  },
  completion_tokens_details: {
    reasoning_tokens: 10,
    provider_completion_metadata: ['preserved', 1],
  },
  provider_usage_metadata: {
    nested: { preserved: true },
  },
};

function createResponse(usage: Record<string, unknown>) {
  return {
    id: 'chatcmpl-raw-usage',
    object: 'chat.completion',
    created: 1785880000,
    model: 'deepseek-v4-flash',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: 'Hello' },
        finish_reason: 'stop',
      },
    ],
    usage,
  };
}

const server = createTestServer({
  'https://api.deepseek.com/chat/completions': {},
});

const provider = createDeepSeek({
  apiKey: 'test-api-key',
});

describe('DeepSeekChatLanguageModel raw usage', () => {
  it('preserves complete raw usage through doGenerate parsing', async () => {
    server.urls['https://api.deepseek.com/chat/completions'].response = {
      type: 'json-value',
      body: createResponse(completeUsage),
    };

    const result = await provider
      .chat('deepseek-v4-flash')
      .doGenerate({ prompt: TEST_PROMPT });

    expect(result.usage.raw).toStrictEqual(completeUsage);
    expect(result.usage.inputTokens).toStrictEqual({
      total: 100,
      noCache: 80,
      cacheRead: 20,
      cacheWrite: undefined,
    });
    expect(result.usage.outputTokens).toStrictEqual({
      total: 50,
      text: 40,
      reasoning: 10,
    });
  });

  it('preserves complete raw usage from the final doStream usage event', async () => {
    const initialUsage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      provider_usage_metadata: { stage: 'initial' },
    };

    server.urls['https://api.deepseek.com/chat/completions'].response = {
      type: 'stream-chunks',
      chunks: [
        `data: ${JSON.stringify({
          id: 'chatcmpl-raw-usage',
          object: 'chat.completion.chunk',
          choices: [],
          usage: initialUsage,
        })}\n\n`,
        `data: ${JSON.stringify({
          id: 'chatcmpl-raw-usage',
          object: 'chat.completion.chunk',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          usage: completeUsage,
        })}\n\n`,
        'data: [DONE]\n\n',
      ],
    };

    const { stream } = await provider
      .chat('deepseek-v4-flash')
      .doStream({ prompt: TEST_PROMPT });
    const parts = await convertReadableStreamToArray(stream);
    const finishPart = parts.find(part => part.type === 'finish');

    expect(finishPart).toBeDefined();
    if (finishPart?.type !== 'finish') {
      throw new Error('finish part missing');
    }

    expect(finishPart.usage.raw).toStrictEqual(completeUsage);
    expect(finishPart.usage.inputTokens).toStrictEqual({
      total: 100,
      noCache: 80,
      cacheRead: 20,
      cacheWrite: undefined,
    });
    expect(finishPart.usage.outputTokens).toStrictEqual({
      total: 50,
      text: 40,
      reasoning: 10,
    });
  });

  it.each([
    [
      'prompt_tokens',
      {
        ...completeUsage,
        prompt_tokens: '100',
      },
    ],
    [
      'prompt_tokens_details.cached_tokens',
      {
        ...completeUsage,
        prompt_tokens_details: {
          ...completeUsage.prompt_tokens_details,
          cached_tokens: '20',
        },
      },
    ],
    [
      'completion_tokens_details.reasoning_tokens',
      {
        ...completeUsage,
        completion_tokens_details: {
          ...completeUsage.completion_tokens_details,
          reasoning_tokens: '10',
        },
      },
    ],
  ])('continues validating known usage field %s', async (_field, usage) => {
    server.urls['https://api.deepseek.com/chat/completions'].response = {
      type: 'json-value',
      body: createResponse(usage),
    };

    await expect(
      provider.chat('deepseek-v4-flash').doGenerate({ prompt: TEST_PROMPT }),
    ).rejects.toThrow();
  });
});
