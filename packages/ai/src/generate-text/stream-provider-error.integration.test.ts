import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createGateway } from '@ai-sdk/gateway';
import { createGoogle } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { createHuggingFace } from '@ai-sdk/huggingface';
import { createMoonshotAI } from '@ai-sdk/moonshotai';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV4 } from '@ai-sdk/provider';
import { convertAsyncIterableToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { createXai } from '@ai-sdk/xai';
import { EventStreamCodec } from '@smithy/eventstream-codec';
import { fromUtf8, toUtf8 } from '@smithy/util-utf8';
import { describe, expect, it, vi } from 'vitest';
import { StreamProviderError } from '../error';
import { streamText } from './stream-text';

const amazonBedrockEventStreamCodec = new EventStreamCodec(toUtf8, fromUtf8);

function createAmazonBedrockExceptionStream({
  type,
  data,
}: {
  type: string;
  data: unknown;
}): ReadableStream<Uint8Array<ArrayBufferLike>> {
  const frame = amazonBedrockEventStreamCodec.encode({
    headers: {
      ':message-type': { type: 'string', value: 'exception' },
      ':exception-type': { type: 'string', value: type },
      ':content-type': { type: 'string', value: 'application/json' },
    },
    body: fromUtf8(JSON.stringify(data)),
  });

  return new ReadableStream({
    start(controller) {
      controller.enqueue(frame);
      controller.close();
    },
  });
}

describe('stream provider error integration', () => {
  const server = createTestServer({
    'https://api.test.com/deepseek/chat/completions': {},
    'https://api.test.com/google/interactions': {},
    'https://api.test.com/groq/v1/chat/completions': {},
    'https://api.test.com/huggingface/responses': {},
    'https://api.test.com/language-model': {},
    'https://api.test.com/moonshot/v1/chat/completions': {},
    'https://api.test.com/openai/v1/responses': {},
    'https://api.test.com/xai/v1/responses': {},
  });

  async function expectNormalizedProviderError({
    model,
    expected,
  }: {
    model: LanguageModelV4;
    expected: {
      message: string;
      type: string;
      code?: string | number;
      statusCode: number;
      isRetryable: boolean;
      data: unknown;
    };
  }) {
    let onErrorValue: unknown;

    const result = streamText({
      model,
      prompt: 'Test prompt',
      maxRetries: 0,
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
      code: 'upstream_overloaded',
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
      code: data.code,
      statusCode: data.statusCode,
      isRetryable: data.isRetryable,
      data,
    });
    expect(onErrorValue).toBe(errorPart.error);
  });

  it('normalizes an actual Amazon Bedrock modeled exception with its documented metadata', async () => {
    const type = 'modelStreamErrorException';
    const details = {
      message: 'The model stream failed',
      originalStatusCode: 503,
      originalMessage: 'Upstream service unavailable',
    };
    const data = { [type]: details };

    await expectNormalizedProviderError({
      model: createAmazonBedrock({
        apiKey: 'test-api-key',
        region: 'us-east-1',
        baseURL: 'https://api.test.com/bedrock',
        fetch: async () =>
          new Response(
            createAmazonBedrockExceptionStream({ type, data: details }),
            {
              status: 200,
              headers: {
                'content-type': 'application/vnd.amazon.eventstream',
              },
            },
          ),
      })('anthropic.claude-3-haiku-20240307-v1:0'),
      expected: {
        message: details.message,
        type,
        statusCode: 424,
        isRetryable: true,
        data,
      },
    });
  });

  it('normalizes an actual Hugging Face Responses error event without merging type and code', async () => {
    const data = {
      type: 'error',
      code: '503',
      message: 'Service unavailable',
      param: null,
      sequence_number: 1,
    };

    server.urls['https://api.test.com/huggingface/responses'].response = {
      type: 'stream-chunks',
      chunks: [`data: ${JSON.stringify(data)}\n\n`],
    };

    await expectNormalizedProviderError({
      model: createHuggingFace({
        apiKey: 'test-api-key',
        baseURL: 'https://api.test.com/huggingface',
      }).responses('test-model'),
      expected: {
        message: data.message,
        type: data.type,
        code: data.code,
        statusCode: 503,
        isRetryable: true,
        data,
      },
    });
  });

  it('normalizes an actual Google Interactions error event without merging type and code', async () => {
    const data = {
      event_type: 'error',
      event_id: 'event-error',
      error: {
        code: '429',
        message: 'Rate limit reached',
      },
    };

    server.urls['https://api.test.com/google/interactions'].response = {
      type: 'stream-chunks',
      chunks: [`data: ${JSON.stringify(data)}\n\n`],
    };

    await expectNormalizedProviderError({
      model: createGoogle({
        apiKey: 'test-api-key',
        baseURL: 'https://api.test.com/google',
      }).interactions('gemini-2.5-flash'),
      expected: {
        message: data.error.message,
        type: data.event_type,
        code: data.error.code,
        statusCode: 429,
        isRetryable: true,
        data,
      },
    });
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
        type: data.type,
        code: data.code,
        statusCode: 429,
        isRetryable: true,
        data,
      },
    });
  });

  it('exposes OpenAI insufficient quota as non-retryable to callbacks and consumers', async () => {
    const data = {
      type: 'error',
      sequence_number: 2,
      code: 'insufficient_quota',
      message: 'You exceeded your current quota.',
      param: null,
    };

    server.urls['https://api.test.com/openai/v1/responses'].response = {
      type: 'stream-chunks',
      chunks: [
        `data: ${JSON.stringify({
          type: 'response.created',
          sequence_number: 0,
          response: {
            id: 'resp_quota',
            created_at: 1_741_269_019,
            model: 'gpt-4o-mini',
            service_tier: null,
          },
        })}\n\n`,
        `data: ${JSON.stringify({
          type: 'response.output_item.added',
          sequence_number: 1,
          output_index: 0,
          item: { id: 'msg_quota', type: 'message' },
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
        type: data.type,
        code: data.code,
        statusCode: 429,
        isRetryable: false,
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
        type: data.error.type,
        code: data.error.code,
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

  it('normalizes an actual Groq rate-limit event with provider-owned metadata', async () => {
    const data = {
      error: {
        message: 'Rate limit reached',
        type: 'rate_limit_error',
      },
    };

    server.urls['https://api.test.com/groq/v1/chat/completions'].response = {
      type: 'stream-chunks',
      chunks: [`data: ${JSON.stringify(data)}\n\n`, 'data: [DONE]\n\n'],
    };

    await expectNormalizedProviderError({
      model: createGroq({
        apiKey: 'test-api-key',
        baseURL: 'https://api.test.com/groq/v1',
      })('llama-3.3-70b-versatile'),
      expected: {
        message: data.error.message,
        type: data.error.type,
        statusCode: 429,
        isRetryable: true,
        data,
      },
    });
  });

  it('normalizes an actual xAI response.failed event with provider-owned metadata', async () => {
    const data = {
      type: 'response.failed',
      response: {
        error: {
          code: 'server_error',
          message: 'Internal server error',
        },
        incomplete_details: null,
        usage: null,
      },
    };

    server.urls['https://api.test.com/xai/v1/responses'].response = {
      type: 'stream-chunks',
      chunks: [
        `data: ${JSON.stringify({
          type: 'response.created',
          response: {
            id: 'resp_test',
            object: 'response',
            model: 'grok-4-fast-non-reasoning',
            output: [],
          },
        })}\n\n`,
        `data: ${JSON.stringify(data)}\n\n`,
        'data: [DONE]\n\n',
      ],
    };

    await expectNormalizedProviderError({
      model: createXai({
        apiKey: 'test-api-key',
        baseURL: 'https://api.test.com/xai/v1',
      }).responses('grok-4-fast-non-reasoning'),
      expected: {
        message: data.response.error.message,
        type: data.type,
        code: data.response.error.code,
        statusCode: 500,
        isRetryable: true,
        data,
      },
    });
  });

  it('retries an OpenAI Responses server_is_overloaded event arriving after the accepted grace window under maxRetries', async () => {
    const responseMeta = {
      id: 'resp_overload',
      object: 'response',
      created_at: 1_741_269_019,
      model: 'gpt-5.1',
      status: 'in_progress',
      output: [],
    };
    const sse = (steps: Array<[number, unknown]>) => {
      const encoder = new TextEncoder();
      return new ReadableStream({
        async start(controller) {
          for (const [delayMs, frame] of steps) {
            if (delayMs > 0) {
              await new Promise(resolve => setTimeout(resolve, delayMs));
            }
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(frame)}\n\n`),
            );
          }
          controller.close();
        },
      });
    };

    const attempts: Array<Array<[number, unknown]>> = [
      [
        [
          0,
          {
            type: 'response.created',
            sequence_number: 0,
            response: responseMeta,
          },
        ],
        [
          0,
          {
            type: 'response.in_progress',
            sequence_number: 1,
            response: responseMeta,
          },
        ],
        [
          120,
          {
            type: 'error',
            sequence_number: 2,
            code: 'server_is_overloaded',
            message:
              'Our servers are currently overloaded. Please try again later.',
            param: null,
          },
        ],
      ],
      [
        [
          0,
          {
            type: 'response.created',
            sequence_number: 0,
            response: responseMeta,
          },
        ],
        [
          0,
          {
            type: 'response.in_progress',
            sequence_number: 1,
            response: responseMeta,
          },
        ],
        [
          0,
          {
            type: 'response.output_item.added',
            sequence_number: 2,
            output_index: 0,
            item: {
              type: 'message',
              id: 'msg_1',
              role: 'assistant',
              status: 'in_progress',
              content: [],
            },
          },
        ],
        [
          0,
          {
            type: 'response.output_text.delta',
            sequence_number: 3,
            item_id: 'msg_1',
            output_index: 0,
            content_index: 0,
            delta: 'Hello!',
            logprobs: [],
          },
        ],
        [
          0,
          {
            type: 'response.output_item.done',
            sequence_number: 4,
            output_index: 0,
            item: {
              type: 'message',
              id: 'msg_1',
              role: 'assistant',
              status: 'completed',
              content: [
                {
                  type: 'output_text',
                  text: 'Hello!',
                  annotations: [],
                  logprobs: [],
                },
              ],
            },
          },
        ],
        [
          0,
          {
            type: 'response.completed',
            sequence_number: 5,
            response: {
              ...responseMeta,
              status: 'completed',
              usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
            },
          },
        ],
      ],
    ];

    let calls = 0;
    const onError = vi.fn();
    const openai = createOpenAI({
      apiKey: 'test-api-key',
      fetch: async () => {
        const steps = attempts[Math.min(calls, attempts.length - 1)];
        calls++;
        return new Response(sse(steps), {
          status: 200,
          headers: {
            'content-type': 'text/event-stream',
            'retry-after-ms': '0',
          },
        });
      },
    });

    const result = streamText({
      model: openai.responses('gpt-5.1'),
      prompt: 'Say hello',
      maxRetries: 2,
      onError,
    });

    const parts = await convertAsyncIterableToArray(result.fullStream);

    expect(calls).toBe(2);
    expect(await result.text).toBe('Hello!');
    expect(onError).not.toHaveBeenCalled();
    expect(parts.some(part => part.type === 'error')).toBe(false);
  });

  it('does not retry a non-retryable OpenAI Responses error arriving after the accepted grace window', async () => {
    const responseMeta = {
      id: 'resp_quota_late',
      object: 'response',
      created_at: 1_741_269_019,
      model: 'gpt-5.1',
      status: 'in_progress',
      output: [],
    };
    const encoder = new TextEncoder();

    let calls = 0;
    const onError = vi.fn();
    const openai = createOpenAI({
      apiKey: 'test-api-key',
      fetch: async () => {
        calls++;
        return new Response(
          new ReadableStream({
            async start(controller) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'response.created',
                    sequence_number: 0,
                    response: responseMeta,
                  })}\n\n`,
                ),
              );
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'response.in_progress',
                    sequence_number: 1,
                    response: responseMeta,
                  })}\n\n`,
                ),
              );
              await new Promise(resolve => setTimeout(resolve, 120));
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'error',
                    sequence_number: 2,
                    code: 'insufficient_quota',
                    message: 'You exceeded your current quota.',
                    param: null,
                  })}\n\n`,
                ),
              );
              controller.close();
            },
          }),
          {
            status: 200,
            headers: {
              'content-type': 'text/event-stream',
              'retry-after-ms': '0',
            },
          },
        );
      },
    });

    const result = streamText({
      model: openai.responses('gpt-5.1'),
      prompt: 'Say hello',
      maxRetries: 2,
      onError,
    });

    const parts = await convertAsyncIterableToArray(result.fullStream);

    expect(calls).toBe(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(StreamProviderError.isInstance(onError.mock.calls[0][0].error)).toBe(
      true,
    );
    expect(onError.mock.calls[0][0].error).toMatchObject({
      code: 'insufficient_quota',
      isRetryable: false,
    });
    expect(parts.some(part => part.type === 'error')).toBe(true);
  });
});
