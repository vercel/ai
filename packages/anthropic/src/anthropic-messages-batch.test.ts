import type { Experimental_LanguageModelV4BatchRequest as LanguageModelV4BatchRequest } from '@ai-sdk/provider';
import { WORKFLOW_DESERIALIZE } from '@ai-sdk/provider-utils';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it, vi } from 'vitest';
import { AnthropicLanguageModel } from './anthropic-language-model';
import type { AnthropicLanguageModelOptions } from './anthropic-language-model-options';
import { AnthropicMessagesBatchLanguageModel } from './anthropic-messages-batch';
import { createAnthropic } from './anthropic-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const urls = {
  batches: 'https://api.anthropic.com/v1/messages/batches',
  batch: 'https://api.anthropic.com/v1/messages/batches/msgbatch_123',
  results: 'https://api.anthropic.com/v1/messages/batches/msgbatch_123/results',
} as const;

const server = createTestServer({
  [urls.batches]: {},
  [urls.batch]: {},
  [urls.results]: {},
});

const config = {
  provider: 'anthropic.messages',
  baseURL: 'https://api.anthropic.com/v1',
  headers: () => ({
    'anthropic-version': '2023-06-01',
    'x-api-key': 'test-api-key',
  }),
};

function request(
  prompt: string,
  options: Omit<LanguageModelV4BatchRequest['options'], 'prompt'> = {},
) {
  return {
    options: {
      prompt: [
        {
          role: 'user' as const,
          content: [{ type: 'text' as const, text: prompt }],
        },
      ],
      ...options,
    },
  };
}

function batchResponse(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'msgbatch_123',
    type: 'message_batch',
    processing_status: 'ended',
    request_counts: {
      processing: 0,
      succeeded: 1,
      errored: 0,
      canceled: 0,
      expired: 0,
    },
    created_at: '2024-09-24T18:37:24.100Z',
    expires_at: '2024-09-25T18:37:24.100Z',
    archived_at: null,
    results_url: urls.results,
    ...overrides,
  };
}

function messageResultBody(text: string) {
  return {
    id: 'msg_123',
    type: 'message',
    role: 'assistant',
    model: 'claude-3-haiku-20240307',
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 10,
      output_tokens: 3,
      cache_creation_input_tokens: 1,
      cache_read_input_tokens: 2,
    },
  };
}

describe('Anthropic Messages batch language model', () => {
  it('starts a batch from prepared requests and combines batch and inferred betas', async () => {
    server.urls[urls.batches].response = {
      type: 'json-value',
      body: batchResponse({
        processing_status: 'in_progress',
        request_counts: {
          processing: 2,
          succeeded: 0,
          errored: 0,
          canceled: 0,
          expired: 0,
        },
        results_url: null,
      }),
    };
    const model = createAnthropic({
      apiKey: 'test-api-key',
      headers: {
        'Provider-Header': 'provider',
        'Anthropic-Beta': 'provider-header-beta',
      },
    })('claude-3-haiku-20240307');

    const result = await model.experimental_doStartBatch({
      requests: [
        {
          id: 'france',
          ...request('What is the capital of France?', {
            maxOutputTokens: 100,
            frequencyPenalty: 0.5,
          }),
        },
        {
          id: 'germany',
          ...request('What is the capital of Germany?', {
            maxOutputTokens: 200,
            providerOptions: {
              anthropic: {
                fallbacks: [
                  {
                    model: 'claude-sonnet-4-5',
                    max_tokens: 150,
                  },
                ],
              } satisfies AnthropicLanguageModelOptions,
            },
          }),
        },
      ],
      providerOptions: {
        anthropic: { anthropicBeta: ['batch-beta'] },
      },
      headers: {
        'Operation-Header': 'operation',
        'anthropic-beta': 'operation-header-beta',
      },
    });

    expect(result).toMatchObject({
      batchId: 'msgbatch_123',
      status: 'pending',
      rawStatus: 'in_progress',
      requestCounts: {
        total: 2,
        pending: 2,
        completed: 0,
        failed: 0,
      },
      warnings: [
        {
          requestId: 'france',
          warning: { type: 'unsupported', feature: 'frequencyPenalty' },
        },
      ],
    });

    expect(await server.calls[0].requestBodyJson).toEqual({
      requests: [
        {
          custom_id: 'france',
          params: {
            model: 'claude-3-haiku-20240307',
            max_tokens: 100,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'What is the capital of France?',
                  },
                ],
              },
            ],
          },
        },
        {
          custom_id: 'germany',
          params: {
            model: 'claude-3-haiku-20240307',
            max_tokens: 200,
            fallbacks: [
              {
                model: 'claude-sonnet-4-5',
                max_tokens: 150,
              },
            ],
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'What is the capital of Germany?',
                  },
                ],
              },
            ],
          },
        },
      ],
    });
    expect(server.calls[0].requestHeaders).toMatchObject({
      'x-api-key': 'test-api-key',
      'provider-header': 'provider',
      'operation-header': 'operation',
    });
    const betas = server.calls[0].requestHeaders['anthropic-beta']
      .split(',')
      .map(beta => beta.trim());
    expect(betas).toEqual(
      expect.arrayContaining(['batch-beta', 'server-side-fallback-2026-06-01']),
    );
    expect(betas).toHaveLength(2);
    expect(new Set(betas).size).toBe(betas.length);
  });

  it('rejects per-request betas before making an API request', async () => {
    const model = createAnthropic({ apiKey: 'test-api-key' })(
      'claude-3-haiku-20240307',
    );

    await expect(
      model.experimental_doStartBatch({
        requests: [
          {
            id: 'request-1',
            ...request('Hello', {
              providerOptions: {
                anthropic: {
                  anthropicBeta: ['request-beta'],
                } satisfies AnthropicLanguageModelOptions,
              },
            }),
          },
        ],
      }),
    ).rejects.toMatchObject({
      name: 'AI_UnsupportedFunctionalityError',
      functionality: 'per-request providerOptions.anthropic.anthropicBeta',
      message:
        'Anthropic Message Batches do not support per-request betas (request "request-1"). Set providerOptions.anthropic.anthropicBeta on startTextBatch instead.',
    });
    expect(server.calls).toHaveLength(0);
  });

  it.each([
    {
      feature: 'providerOptions.anthropic.speed',
      options: { speed: 'fast' } satisfies AnthropicLanguageModelOptions,
      message:
        'Anthropic Message Batches do not support speed (request "request-1").',
    },
    {
      feature: 'providerOptions.anthropic.fallbacks[].speed',
      options: {
        fallbacks: [
          {
            model: 'claude-sonnet-4-5',
            speed: 'standard',
          },
        ],
      } satisfies AnthropicLanguageModelOptions,
      message:
        'Anthropic Message Batches do not support fallback speed (request "request-1").',
    },
  ])('rejects unsupported $feature', async ({ feature, options, message }) => {
    const model = createAnthropic({ apiKey: 'test-api-key' })(
      'claude-3-haiku-20240307',
    );

    await expect(
      model.experimental_doStartBatch({
        requests: [
          {
            id: 'request-1',
            ...request('Hello', {
              providerOptions: { anthropic: options },
            }),
          },
        ],
      }),
    ).rejects.toMatchObject({
      name: 'AI_UnsupportedFunctionalityError',
      functionality: feature,
      message,
    });
    expect(server.calls).toHaveLength(0);
  });

  it('rejects invalid request IDs before making an API request', async () => {
    const model = createAnthropic({ apiKey: 'test-api-key' })(
      'claude-3-haiku-20240307',
    );

    await expect(
      model.experimental_doStartBatch({
        requests: [{ id: 'invalid id', ...request('Hello') }],
      }),
    ).rejects.toMatchObject({
      name: 'AI_InvalidArgumentError',
      argument: 'requests',
      message:
        'Anthropic batch request ID "invalid id" must match ^[A-Za-z0-9_-]{1,64}$.',
    });
    await expect(
      model.experimental_doStartBatch({
        requests: [{ id: 'a'.repeat(65), ...request('Hello') }],
      }),
    ).rejects.toMatchObject({
      name: 'AI_InvalidArgumentError',
      argument: 'requests',
      message: expect.stringContaining('must match ^[A-Za-z0-9_-]{1,64}$.'),
    });
    expect(server.calls).toHaveLength(0);
  });

  it('rejects duplicate request IDs before making an API request', async () => {
    const model = createAnthropic({ apiKey: 'test-api-key' })(
      'claude-3-haiku-20240307',
    );

    await expect(
      model.experimental_doStartBatch({
        requests: [
          { id: 'duplicate', ...request('First') },
          { id: 'duplicate', ...request('Second') },
        ],
      }),
    ).rejects.toMatchObject({
      name: 'AI_InvalidArgumentError',
      argument: 'requests',
      message:
        'Anthropic batch request IDs must be unique; duplicate ID "duplicate".',
    });
    expect(server.calls).toHaveLength(0);
  });

  it.each([
    ['in_progress', 'pending'],
    ['canceling', 'pending'],
    ['ended', 'completed'],
    ['future_status', 'pending'],
  ] as const)('maps status %s to %s', async (rawStatus, status) => {
    server.urls[urls.batch].response = {
      type: 'json-value',
      body: batchResponse({ processing_status: rawStatus }),
    };
    const model = createAnthropic({ apiKey: 'test-api-key' })(
      'claude-3-haiku-20240307',
    );

    await expect(
      model.experimental_doGetBatchStatus({ batchId: 'msgbatch_123' }),
    ).resolves.toMatchObject({ status, rawStatus });
  });

  it('normalizes request counts', async () => {
    server.urls[urls.batch].response = {
      type: 'json-value',
      body: batchResponse({
        request_counts: {
          processing: 0,
          succeeded: 2,
          errored: 1,
          canceled: 1,
          expired: 1,
        },
      }),
    };
    const model = createAnthropic({ apiKey: 'test-api-key' })(
      'claude-3-haiku-20240307',
    );

    await expect(
      model.experimental_doGetBatchStatus({ batchId: 'msgbatch_123' }),
    ).resolves.toEqual({
      status: 'completed',
      rawStatus: 'ended',
      requestCounts: {
        total: 5,
        pending: 0,
        completed: 2,
        failed: 3,
      },
      createdAt: '2024-09-24T18:37:24.100Z',
      expiresAt: '2024-09-25T18:37:24.100Z',
    });
  });

  it('rejects result retrieval while the batch is pending', async () => {
    server.urls[urls.batch].response = {
      type: 'json-value',
      body: batchResponse({
        processing_status: 'in_progress',
        request_counts: {
          processing: 1,
          succeeded: 0,
          errored: 0,
          canceled: 0,
          expired: 0,
        },
        results_url: null,
      }),
    };
    const model = createAnthropic({ apiKey: 'test-api-key' })(
      'claude-3-haiku-20240307',
    );

    await expect(
      model.experimental_doGetBatchResults({ batchId: 'msgbatch_123' }),
    ).rejects.toMatchObject({
      name: 'AI_InvalidArgumentError',
      argument: 'batchId',
      message: 'Anthropic batch "msgbatch_123" is not complete.',
    });
  });

  it('rejects result retrieval after Anthropic archives the result file', async () => {
    server.urls[urls.batch].response = {
      type: 'json-value',
      body: batchResponse({
        archived_at: '2024-10-24T18:37:24.100Z',
        results_url: null,
      }),
    };
    const model = createAnthropic({ apiKey: 'test-api-key' })(
      'claude-3-haiku-20240307',
    );

    await expect(
      model.experimental_doGetBatchResults({ batchId: 'msgbatch_123' }),
    ).rejects.toMatchObject({
      name: 'AI_InvalidArgumentError',
      argument: 'batchId',
      message:
        'Anthropic batch "msgbatch_123" results are no longer available.',
    });
  });

  it('incrementally maps all Anthropic JSONL result variants', async () => {
    server.urls[urls.batch].response = {
      type: 'json-value',
      body: batchResponse(),
    };

    const succeeded = JSON.stringify({
      custom_id: 'france',
      result: {
        type: 'succeeded',
        message: messageResultBody('Paris'),
      },
    });
    const errored = JSON.stringify({
      custom_id: 'invalid',
      result: {
        type: 'errored',
        error: {
          type: 'error',
          error: {
            type: 'invalid_request_error',
            message: 'Invalid request.',
          },
          request_id: 'req_123',
        },
      },
    });
    const canceled = JSON.stringify({
      custom_id: 'canceled',
      result: { type: 'canceled' },
    });
    const expired = JSON.stringify({
      custom_id: 'expired',
      result: { type: 'expired' },
    });

    server.urls[urls.results].response = {
      type: 'stream-chunks',
      headers: { 'Content-Type': 'application/jsonl' },
      chunks: [
        succeeded.slice(0, 17),
        `${succeeded.slice(17)}\r`,
        `\n\n${errored.slice(0, 23)}`,
        `${errored.slice(23)}\n${canceled}\r\n${expired.slice(0, 11)}`,
        expired.slice(11),
      ],
    };
    const model = createAnthropic({ apiKey: 'test-api-key' })(
      'claude-3-haiku-20240307',
    );

    const stream = await model.experimental_doGetBatchResults({
      batchId: 'msgbatch_123',
    });
    const results = await convertReadableStreamToArray(stream);

    expect(results[0]).toEqual({
      id: 'france',
      status: 'succeeded',
      result: {
        content: [{ type: 'text', text: 'Paris' }],
        finishReason: { unified: 'stop', raw: 'end_turn' },
        usage: {
          inputTokens: {
            total: 13,
            noCache: 10,
            cacheRead: 2,
            cacheWrite: 1,
          },
          outputTokens: {
            total: 3,
            text: undefined,
            reasoning: undefined,
          },
          raw: {
            input_tokens: 10,
            output_tokens: 3,
            cache_creation_input_tokens: 1,
            cache_read_input_tokens: 2,
          },
        },
        response: {
          id: 'msg_123',
          modelId: 'claude-3-haiku-20240307',
        },
        warnings: [],
        providerMetadata: {
          anthropic: {
            usage: {
              input_tokens: 10,
              output_tokens: 3,
              cache_creation_input_tokens: 1,
              cache_read_input_tokens: 2,
            },
            stopSequence: null,
            iterations: null,
            container: null,
            contextManagement: null,
          },
        },
      },
    });
    expect(results.slice(1)).toEqual([
      {
        id: 'invalid',
        status: 'failed',
        error: {
          message: 'Invalid request.',
          type: 'invalid_request_error',
        },
        providerMetadata: {
          anthropic: { requestId: 'req_123' },
        },
      },
      { id: 'canceled', status: 'cancelled' },
      { id: 'expired', status: 'expired' },
    ]);
    expect(server.calls.map(call => call.requestUrl)).toEqual([
      urls.batch,
      urls.results,
    ]);
  });

  it('fails an item instead of silently dropping tool content', async () => {
    server.urls[urls.batch].response = {
      type: 'json-value',
      body: batchResponse(),
    };
    server.urls[urls.results].response = {
      type: 'stream-chunks',
      chunks: [
        JSON.stringify({
          custom_id: 'tool-call',
          result: {
            type: 'succeeded',
            message: {
              ...messageResultBody(''),
              content: [
                {
                  type: 'tool_use',
                  id: 'toolu_123',
                  name: 'get_weather',
                  input: { city: 'Paris' },
                },
              ],
              stop_reason: 'tool_use',
            },
          },
        }),
      ],
    };
    const model = createAnthropic({ apiKey: 'test-api-key' })(
      'claude-3-haiku-20240307',
    );

    const stream = await model.experimental_doGetBatchResults({
      batchId: 'msgbatch_123',
    });

    await expect(convertReadableStreamToArray(stream)).resolves.toEqual([
      {
        id: 'tool-call',
        status: 'failed',
        error: {
          message:
            'Anthropic returned a "tool_use" content block, but tool content is not supported in AI SDK text batches.',
          code: 'unsupported_tool_content',
        },
      },
    ]);
  });

  it('forwards operation headers and the abort signal while retrieving results', async () => {
    server.urls[urls.batch].response = {
      type: 'json-value',
      body: batchResponse(),
    };
    server.urls[urls.results].response = {
      type: 'stream-chunks',
      chunks: [
        JSON.stringify({
          custom_id: 'canceled',
          result: { type: 'canceled' },
        }),
      ],
    };
    const mockFetch = vi.fn().mockImplementation(globalThis.fetch);
    const abortController = new AbortController();
    const model = createAnthropic({
      apiKey: 'test-api-key',
      headers: {
        'Provider-Header': 'provider',
      },
      fetch: mockFetch,
    })('claude-3-haiku-20240307');

    const stream = await model.experimental_doGetBatchResults({
      batchId: 'msgbatch_123',
      abortSignal: abortController.signal,
      headers: {
        'Operation-Header': 'operation',
      },
    });
    await convertReadableStreamToArray(stream);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][1].signal).toBe(abortController.signal);
    expect(mockFetch.mock.calls[1][1].signal).toBe(abortController.signal);
    for (const call of server.calls) {
      expect(call.requestHeaders).toMatchObject({
        'provider-header': 'provider',
        'operation-header': 'operation',
      });
    }
    expect(server.calls[1].requestHeaders.accept).toBe('application/binary');
  });

  it('exposes batch support on every Anthropic Messages model factory', () => {
    const provider = createAnthropic({ apiKey: 'test-api-key' });

    for (const model of [
      provider('claude-3-haiku-20240307'),
      provider.languageModel('claude-3-haiku-20240307'),
      provider.chat('claude-3-haiku-20240307'),
      provider.messages('claude-3-haiku-20240307'),
    ]) {
      expect(model.experimental_doStartBatch).toBeTypeOf('function');
      expect(model.experimental_doGetBatchStatus).toBeTypeOf('function');
      expect(model.experimental_doGetBatchResults).toBeTypeOf('function');
    }

    expect(
      (new AnthropicLanguageModel('claude-3-haiku-20240307', config) as any)
        .experimental_doStartBatch,
    ).toBeUndefined();
  });

  it('preserves batch support when workflow deserializes a model', () => {
    const model = AnthropicMessagesBatchLanguageModel[WORKFLOW_DESERIALIZE]({
      modelId: 'claude-3-haiku-20240307',
      config,
    });

    expect(model.experimental_doStartBatch).toBeTypeOf('function');
    expect(model.experimental_doGetBatchStatus).toBeTypeOf('function');
    expect(model.experimental_doGetBatchResults).toBeTypeOf('function');
    expect(model.doGenerate).toBeTypeOf('function');
  });
});
