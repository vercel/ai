import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import {
  convertReadableStreamToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { XaiResponsesLanguageModel } from './xai-responses-language-model';

const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'hello' }] },
];

const completeUsage = {
  input_tokens: 100,
  output_tokens: 50,
  total_tokens: 150,
  input_tokens_details: {
    cached_tokens: 20,
    provider_input_metadata: { preserved: true },
  },
  output_tokens_details: {
    reasoning_tokens: 30,
    provider_output_metadata: ['preserved', 1],
  },
  context_details: {
    input_tokens: 90,
    output_tokens: 40,
  },
  server_side_tool_usage_details: {
    web_search_calls: 1,
  },
  provider_usage_metadata: {
    nested: { preserved: true },
  },
};

function createResponse(usage: Record<string, unknown>) {
  return {
    id: 'resp_123',
    object: 'response',
    status: 'completed',
    model: 'grok-4-fast-non-reasoning',
    output: [],
    usage,
  };
}

function createModel() {
  return new XaiResponsesLanguageModel('grok-4-fast-non-reasoning', {
    provider: 'xai.responses',
    baseURL: 'https://api.x.ai/v1',
    headers: () => ({ Authorization: 'Bearer test-key' }),
    generateId: mockId(),
  });
}

describe('XaiResponsesLanguageModel raw usage', () => {
  const server = createTestServer({
    'https://api.x.ai/v1/responses': {},
  });

  it('preserves complete raw usage through doGenerate parsing', async () => {
    server.urls['https://api.x.ai/v1/responses'].response = {
      type: 'json-value',
      body: createResponse(completeUsage),
    };

    const result = await createModel().doGenerate({ prompt: TEST_PROMPT });

    expect(result.usage.raw).toStrictEqual(completeUsage);
    expect(result.usage.inputTokens).toStrictEqual({
      total: 100,
      noCache: 80,
      cacheRead: 20,
      cacheWrite: undefined,
    });
    expect(result.usage.outputTokens).toStrictEqual({
      total: 50,
      text: 20,
      reasoning: 30,
    });
  });

  it('preserves complete raw usage from the final doStream usage event', async () => {
    const initialUsage = {
      input_tokens: 0,
      output_tokens: 0,
      provider_usage_metadata: { stage: 'initial' },
    };

    server.urls['https://api.x.ai/v1/responses'].response = {
      type: 'stream-chunks',
      chunks: [
        `data: ${JSON.stringify({
          type: 'response.created',
          response: {
            ...createResponse(initialUsage),
            status: 'in_progress',
          },
        })}\n\n`,
        `data: ${JSON.stringify({
          type: 'response.completed',
          response: createResponse(completeUsage),
        })}\n\n`,
        'data: [DONE]\n\n',
      ],
    };

    const { stream } = await createModel().doStream({ prompt: TEST_PROMPT });
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
      text: 20,
      reasoning: 30,
    });
  });

  it('continues validating known usage field types', async () => {
    server.urls['https://api.x.ai/v1/responses'].response = {
      type: 'json-value',
      body: createResponse({
        ...completeUsage,
        input_tokens: '100',
      }),
    };

    await expect(
      createModel().doGenerate({ prompt: TEST_PROMPT }),
    ).rejects.toThrow();
  });
});
