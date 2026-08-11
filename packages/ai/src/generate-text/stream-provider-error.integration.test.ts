import { createDeepSeek } from '@ai-sdk/deepseek';
import { createGateway } from '@ai-sdk/gateway';
import { createMoonshotAI } from '@ai-sdk/moonshotai';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV4 } from '@ai-sdk/provider';
import { convertAsyncIterableToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { StreamProviderError } from '../error';
import { streamText } from './stream-text';

describe('stream provider error integration', () => {
  const server = createTestServer({
    'https://api.test.com/deepseek/chat/completions': {},
    'https://api.test.com/language-model': {},
    'https://api.test.com/moonshot/v1/chat/completions': {},
    'https://api.test.com/openai/v1/responses': {},
  });

  async function expectNormalizedProviderError({
    model,
    expected,
  }: {
    model: LanguageModelV4;
    expected: {
      message: string;
      type: string;
      statusCode: number;
      isRetryable: boolean;
      data: unknown;
    };
  }) {
    let onErrorValue: unknown;

    const result = streamText({
      model,
      prompt: 'Test prompt',
      onError: ({ error }) => {
        onErrorValue = error;
      },
    });
    const parts = await convertAsyncIterableToArray(result.fullStream);
    const errorPart = parts.find(part => part.type === 'error');

    expect(errorPart?.type).toBe('error');
    if (errorPart?.type !== 'error') {
      expect.fail('Expected an error part');
    }

    expect(StreamProviderError.isInstance(errorPart.error)).toBe(true);
    expect(errorPart.error).toMatchObject(expected);
    expect(onErrorValue).toBe(errorPart.error);
  }

  it('normalizes an actual Gateway mid-stream error once for callbacks and consumers', async () => {
    const data = {
      message: 'Upstream provider overloaded',
      type: 'provider_overloaded',
      statusCode: 503,
      isRetryable: true,
    };

    server.urls['https://api.test.com/language-model'].response = {
      type: 'stream-chunks',
      chunks: [
        `data: ${JSON.stringify({ type: 'stream-start', warnings: [] })}\n\n`,
        `data: ${JSON.stringify({ type: 'text-start', id: 'text-1' })}\n\n`,
        `data: ${JSON.stringify({
          type: 'text-delta',
          id: 'text-1',
          delta: 'Partial output',
        })}\n\n`,
        `data: ${JSON.stringify({ type: 'error', error: data })}\n\n`,
      ],
    };

    const gateway = createGateway({
      apiKey: 'test-api-key',
      baseURL: 'https://api.test.com',
    });
    let onErrorValue: unknown;

    const result = streamText({
      model: gateway('test-model'),
      prompt: 'Test prompt',
      onError: ({ error }) => {
        onErrorValue = error;
      },
    });
    const parts = await convertAsyncIterableToArray(result.fullStream);
    const errorPart = parts.find(part => part.type === 'error');

    expect(errorPart?.type).toBe('error');
    if (errorPart?.type !== 'error') {
      expect.fail('Expected an error part');
    }

    expect(StreamProviderError.isInstance(errorPart.error)).toBe(true);
    expect(errorPart.error).toMatchObject({
      message: data.message,
      type: data.type,
      statusCode: data.statusCode,
      isRetryable: data.isRetryable,
      data,
    });
    expect(onErrorValue).toBe(errorPart.error);
  });

  it('normalizes an actual OpenAI Responses rate-limit event with provider-owned metadata', async () => {
    const data = {
      type: 'error',
      sequence_number: 2,
      code: 'rate_limit_exceeded',
      message: 'Rate limit reached',
      param: null,
    };

    server.urls['https://api.test.com/openai/v1/responses'].response = {
      type: 'stream-chunks',
      chunks: [
        `data: ${JSON.stringify({
          type: 'response.created',
          sequence_number: 0,
          response: {
            id: 'resp_test',
            created_at: 1_741_269_019,
            model: 'gpt-4o-mini',
            service_tier: null,
          },
        })}\n\n`,
        `data: ${JSON.stringify({
          type: 'response.output_item.added',
          sequence_number: 1,
          output_index: 0,
          item: { id: 'msg_test', type: 'message' },
        })}\n\n`,
        `data: ${JSON.stringify(data)}\n\n`,
      ],
    };

    await expectNormalizedProviderError({
      model: createOpenAI({
        apiKey: 'test-api-key',
        baseURL: 'https://api.test.com/openai/v1',
      }).responses('gpt-4o-mini'),
      expected: {
        message: data.message,
        type: data.code,
        statusCode: 429,
        isRetryable: true,
        data,
      },
    });
  });

  it('normalizes an actual DeepSeek rate-limit event with provider-owned metadata', async () => {
    const data = {
      error: {
        message: 'Rate limit reached',
        type: 'rate_limit_error',
        code: 'rate_limit_exceeded',
      },
    };

    server.urls['https://api.test.com/deepseek/chat/completions'].response = {
      type: 'stream-chunks',
      chunks: [
        `data: ${JSON.stringify({
          id: 'chatcmpl-test',
          choices: [
            {
              delta: { role: 'assistant', content: 'Partial output' },
              finish_reason: null,
            },
          ],
        })}\n\n`,
        `data: ${JSON.stringify(data)}\n\n`,
        'data: [DONE]\n\n',
      ],
    };

    await expectNormalizedProviderError({
      model: createDeepSeek({
        apiKey: 'test-api-key',
        baseURL: 'https://api.test.com/deepseek',
      }).chat('deepseek-chat'),
      expected: {
        message: data.error.message,
        type: data.error.code,
        statusCode: 429,
        isRetryable: true,
        data,
      },
    });
  });

  it('normalizes an actual Moonshot AI server event with provider-owned metadata', async () => {
    const data = {
      error: {
        message: 'Internal server error',
        type: 'server_error',
      },
    };

    server.urls['https://api.test.com/moonshot/v1/chat/completions'].response =
      {
        type: 'stream-chunks',
        chunks: [
          `data: ${JSON.stringify({
            id: 'chatcmpl-test',
            choices: [
              {
                delta: { role: 'assistant', content: 'Partial output' },
                finish_reason: null,
              },
            ],
          })}\n\n`,
          `data: ${JSON.stringify(data)}\n\n`,
          'data: [DONE]\n\n',
        ],
      };

    await expectNormalizedProviderError({
      model: createMoonshotAI({
        apiKey: 'test-api-key',
        baseURL: 'https://api.test.com/moonshot/v1',
      }).chatModel('kimi-k3'),
      expected: {
        message: data.error.message,
        type: data.error.type,
        statusCode: 500,
        isRetryable: true,
        data,
      },
    });
  });
});
