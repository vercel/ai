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
    cancel_initiated_at: null,
    ended_at: '2024-09-24T18:38:24.100Z',
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
            providerOptions: {
              anthropic: { serviceTier: 'auto' },
            },
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
      webhookUrl: 'https://example.com/batch-webhook',
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
          warning: {
            type: 'unsupported',
            feature: 'webhookUrl',
            details:
              'The Anthropic Message Batches API does not support completion webhooks.',
          },
        },
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
            service_tier: 'auto',
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

  it('rejects structured-output modes that require start-call context', async () => {
    const model = createAnthropic({ apiKey: 'test-api-key' }).languageModel(
      'claude-3-haiku-20240307',
    );

    await expect(
      model.experimental_doStartBatch({
        requests: [
          {
            id: 'request-1',
            ...request('Return JSON', {
              responseFormat: {
                type: 'json',
                schema: {
                  type: 'object',
                  properties: { answer: { type: 'string' } },
                },
              },
            }),
          },
        ],
      }),
    ).rejects.toMatchObject({
      name: 'AI_UnsupportedFunctionalityError',
      functionality: 'batch responseFormat JSON-tool fallback',
    });
    expect(server.calls).toHaveLength(0);
  });

  it('rejects aliased provider tool names that cannot be restored later', async () => {
    const model = createAnthropic({ apiKey: 'test-api-key' })(
      'claude-3-haiku-20240307',
    );

    await expect(
      model.experimental_doStartBatch({
        requests: [
          {
            id: 'request-1',
            ...request('Search', {
              tools: [
                {
                  type: 'provider',
                  id: 'anthropic.web_search_20250305',
                  name: 'custom_search',
                  args: {},
                },
              ],
            }),
          },
        ],
      }),
    ).rejects.toMatchObject({
      name: 'AI_UnsupportedFunctionalityError',
      functionality: 'aliased provider tool names in batches',
    });
    expect(server.calls).toHaveLength(0);
  });

  it('allows web tools that implicitly provision code execution', async () => {
    server.urls[urls.batches].response = {
      type: 'json-value',
      body: batchResponse({ processing_status: 'in_progress' }),
    };
    const model = createAnthropic({ apiKey: 'test-api-key' })(
      'claude-3-haiku-20240307',
    );

    await model.experimental_doStartBatch({
      requests: [
        {
          id: 'request-1',
          ...request('Search', {
            tools: [
              {
                type: 'provider',
                id: 'anthropic.web_search_20260209',
                name: 'web_search',
                args: {},
              },
            ],
          }),
        },
      ],
    });

    await expect(server.calls[0].requestBodyJson).resolves.toMatchObject({
      requests: [
        {
          params: {
            tools: [{ type: 'web_search_20260209', name: 'web_search' }],
          },
        },
      ],
    });
  });

  it('does not treat a custom code_execution function as the provider tool', async () => {
    server.urls[urls.batches].response = {
      type: 'json-value',
      body: batchResponse({ processing_status: 'in_progress' }),
    };
    const model = createAnthropic({ apiKey: 'test-api-key' })(
      'claude-3-haiku-20240307',
    );

    await model.experimental_doStartBatch({
      requests: [
        {
          id: 'request-1',
          ...request('Search', {
            tools: [
              {
                type: 'provider',
                id: 'anthropic.web_search_20260209',
                name: 'web_search',
                args: {},
              },
              {
                type: 'function',
                name: 'code_execution',
                description: 'A custom client-side function',
                inputSchema: {
                  type: 'object',
                  properties: {},
                  additionalProperties: false,
                },
              },
            ],
          }),
        },
      ],
    });

    await expect(server.calls[0].requestBodyJson).resolves.toMatchObject({
      requests: [
        {
          params: {
            tools: [
              { type: 'web_search_20260209', name: 'web_search' },
              { name: 'code_execution' },
            ],
          },
        },
      ],
    });
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
      providerMetadata: {
        anthropic: {
          archivedAt: null,
          cancelInitiatedAt: null,
          endedAt: '2024-09-24T18:38:24.100Z',
          requestCounts: {
            processing: 0,
            succeeded: 2,
            errored: 1,
            canceled: 1,
            expired: 1,
          },
          resultsUrl: urls.results,
        },
      },
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

  it('preserves client and provider-executed tool content', async () => {
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
                {
                  type: 'server_tool_use',
                  id: 'srvtoolu_123',
                  name: 'web_search',
                  input: { query: 'weather Paris' },
                },
                {
                  type: 'server_tool_use',
                  id: 'code_123',
                  name: 'code_execution',
                  input: { code: 'print("Paris")' },
                },
                {
                  type: 'web_search_tool_result',
                  tool_use_id: 'srvtoolu_123',
                  content: [
                    {
                      type: 'web_search_result',
                      url: 'https://example.com/weather',
                      title: 'Paris weather',
                      encrypted_content: 'encrypted',
                    },
                  ],
                },
                {
                  type: 'mcp_tool_use',
                  id: 'mcp_123',
                  name: 'lookup',
                  server_name: 'weather',
                  input: { city: 'Paris' },
                },
                {
                  type: 'mcp_tool_result',
                  tool_use_id: 'mcp_123',
                  is_error: false,
                  content: [
                    {
                      type: 'text',
                      text: 'sunny',
                      citations: [
                        {
                          type: 'web_search_result_location',
                          cited_text: 'sunny',
                          url: 'https://example.com/weather',
                          title: 'Paris weather',
                          encrypted_index: 'encrypted-index',
                        },
                      ],
                    },
                  ],
                },
              ],
              stop_reason: 'tool_use',
            },
          },
        }),
      ],
    };
    const model = createAnthropic({
      apiKey: 'test-api-key',
      generateId: () => 'source-1',
    })('claude-3-haiku-20240307');

    const stream = await model.experimental_doGetBatchResults({
      batchId: 'msgbatch_123',
    });

    await expect(convertReadableStreamToArray(stream)).resolves.toMatchObject([
      {
        id: 'tool-call',
        status: 'succeeded',
        result: {
          content: [
            {
              type: 'tool-call',
              toolCallId: 'toolu_123',
              toolName: 'get_weather',
              input: '{"city":"Paris"}',
            },
            {
              type: 'tool-call',
              toolCallId: 'srvtoolu_123',
              toolName: 'web_search',
              input: '{"query":"weather Paris"}',
              providerExecuted: true,
            },
            {
              type: 'tool-call',
              toolCallId: 'code_123',
              toolName: 'code_execution',
              input:
                '{"type":"programmatic-tool-call","code":"print(\\"Paris\\")"}',
              providerExecuted: true,
              dynamic: true,
            },
            {
              type: 'tool-result',
              toolCallId: 'srvtoolu_123',
              toolName: 'web_search',
              result: [
                {
                  encryptedContent: 'encrypted',
                  pageAge: null,
                  title: 'Paris weather',
                  type: 'web_search_result',
                  url: 'https://example.com/weather',
                },
              ],
            },
            {
              type: 'source',
              sourceType: 'url',
              id: 'source-1',
              url: 'https://example.com/weather',
              title: 'Paris weather',
              providerMetadata: {
                anthropic: {
                  pageAge: null,
                },
              },
            },
            {
              type: 'tool-call',
              toolCallId: 'mcp_123',
              toolName: 'lookup',
              input: '{"city":"Paris"}',
              providerExecuted: true,
              dynamic: true,
              providerMetadata: {
                anthropic: {
                  serverName: 'weather',
                  type: 'mcp-tool-use',
                },
              },
            },
            {
              type: 'tool-result',
              toolCallId: 'mcp_123',
              toolName: 'lookup',
              isError: false,
              result: [
                {
                  type: 'text',
                  text: 'sunny',
                  citations: [
                    {
                      type: 'web_search_result_location',
                      cited_text: 'sunny',
                      url: 'https://example.com/weather',
                      title: 'Paris weather',
                      encrypted_index: 'encrypted-index',
                    },
                  ],
                },
              ],
              dynamic: true,
              providerMetadata: {
                anthropic: {
                  serverName: 'weather',
                  type: 'mcp-tool-use',
                },
              },
            },
          ],
        },
      },
    ]);
  });

  it('preserves raw batch citations without misattributing document indices', async () => {
    server.urls[urls.batch].response = {
      type: 'json-value',
      body: batchResponse(),
    };
    server.urls[urls.results].response = {
      type: 'stream-chunks',
      chunks: [
        JSON.stringify({
          custom_id: 'citation',
          result: {
            type: 'succeeded',
            message: {
              ...messageResultBody('Paris is sunny.'),
              content: [
                {
                  type: 'text',
                  text: 'Paris is sunny.',
                  citations: [
                    {
                      type: 'page_location',
                      cited_text: 'Paris is sunny.',
                      document_index: 0,
                      document_title: 'Weather report',
                      start_page_number: 1,
                      end_page_number: 1,
                      file_id: 'file_page',
                    },
                    {
                      type: 'char_location',
                      cited_text: 'Paris is sunny.',
                      document_index: 0,
                      document_title: 'Weather report',
                      start_char_index: 0,
                      end_char_index: 15,
                      file_id: 'file_char',
                    },
                    {
                      type: 'web_search_result_location',
                      cited_text: 'Paris is sunny.',
                      url: 'https://example.com/weather',
                      title: 'Paris weather',
                      encrypted_index: 'encrypted-index',
                    },
                  ],
                },
              ],
            },
          },
        }),
      ],
    };
    const model = createAnthropic({
      apiKey: 'test-api-key',
      generateId: () => 'citation-source',
    })('claude-3-haiku-20240307');

    const stream = await model.experimental_doGetBatchResults({
      batchId: 'msgbatch_123',
    });

    await expect(convertReadableStreamToArray(stream)).resolves.toMatchObject([
      {
        id: 'citation',
        status: 'succeeded',
        result: {
          content: [
            {
              type: 'text',
              text: 'Paris is sunny.',
              providerMetadata: {
                anthropic: {
                  citations: [
                    {
                      type: 'page_location',
                      cited_text: 'Paris is sunny.',
                      document_index: 0,
                      document_title: 'Weather report',
                      start_page_number: 1,
                      end_page_number: 1,
                      file_id: 'file_page',
                    },
                    {
                      type: 'char_location',
                      cited_text: 'Paris is sunny.',
                      document_index: 0,
                      document_title: 'Weather report',
                      start_char_index: 0,
                      end_char_index: 15,
                      file_id: 'file_char',
                    },
                    {
                      type: 'web_search_result_location',
                      cited_text: 'Paris is sunny.',
                      url: 'https://example.com/weather',
                      title: 'Paris weather',
                      encrypted_index: 'encrypted-index',
                    },
                  ],
                },
              },
            },
            {
              type: 'source',
              sourceType: 'url',
              id: 'citation-source',
              url: 'https://example.com/weather',
              title: 'Paris weather',
              providerMetadata: {
                anthropic: {
                  citedText: 'Paris is sunny.',
                  encryptedIndex: 'encrypted-index',
                },
              },
            },
          ],
        },
      },
    ]);
  });

  it('accepts nullable web result fields', async () => {
    server.urls[urls.batch].response = {
      type: 'json-value',
      body: batchResponse(),
    };
    server.urls[urls.results].response = {
      type: 'stream-chunks',
      chunks: [
        JSON.stringify({
          custom_id: 'nullable-web-fields',
          result: {
            type: 'succeeded',
            message: {
              ...messageResultBody(''),
              content: [
                {
                  type: 'web_fetch_tool_result',
                  tool_use_id: 'web-fetch-1',
                  content: {
                    type: 'web_fetch_result',
                    url: 'https://example.com/document',
                    retrieved_at: null,
                    content: {
                      type: 'document',
                      title: null,
                      source: {
                        type: 'text',
                        media_type: 'text/plain',
                        data: 'document text',
                      },
                    },
                  },
                },
                {
                  type: 'web_search_tool_result',
                  tool_use_id: 'web-search-1',
                  content: [
                    {
                      type: 'web_search_result',
                      url: 'https://example.com/search-result',
                      title: null,
                      encrypted_content: 'encrypted',
                    },
                  ],
                },
                {
                  type: 'text',
                  text: 'Document excerpt',
                  citations: [
                    {
                      type: 'char_location',
                      cited_text: 'document text',
                      document_index: 0,
                      document_title: null,
                      start_char_index: 0,
                      end_char_index: 13,
                    },
                  ],
                },
              ],
            },
          },
        }),
      ],
    };
    const model = createAnthropic({
      apiKey: 'test-api-key',
      generateId: () => 'nullable-source',
    })('claude-3-haiku-20240307');

    const stream = await model.experimental_doGetBatchResults({
      batchId: 'msgbatch_123',
    });

    const results = await convertReadableStreamToArray(stream);

    expect(results).toMatchObject([
      {
        id: 'nullable-web-fields',
        status: 'succeeded',
        result: {
          content: [
            {
              type: 'tool-result',
              toolCallId: 'web-fetch-1',
              toolName: 'web_fetch',
              result: {
                type: 'web_fetch_result',
                url: 'https://example.com/document',
                retrievedAt: null,
                content: {
                  type: 'document',
                  title: null,
                  source: {
                    type: 'text',
                    mediaType: 'text/plain',
                    data: 'document text',
                  },
                },
              },
            },
            {
              type: 'tool-result',
              toolCallId: 'web-search-1',
              toolName: 'web_search',
              result: [
                {
                  type: 'web_search_result',
                  url: 'https://example.com/search-result',
                  pageAge: null,
                  encryptedContent: 'encrypted',
                },
              ],
            },
            {
              type: 'source',
              sourceType: 'url',
              id: 'nullable-source',
              url: 'https://example.com/search-result',
            },
            {
              type: 'text',
              text: 'Document excerpt',
              providerMetadata: {
                anthropic: {
                  citations: [
                    {
                      type: 'char_location',
                      cited_text: 'document text',
                      document_index: 0,
                      document_title: null,
                      start_char_index: 0,
                      end_char_index: 13,
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    ]);
    const result = results[0];
    if (result?.status !== 'succeeded') {
      throw new Error('Expected a succeeded batch result.');
    }
    expect(result.result.content[1]).not.toHaveProperty('result.0.title');
    expect(result.result.content[2]).not.toHaveProperty('title');
  });

  it('normalizes advisor tool results to the provider output shape', async () => {
    server.urls[urls.batch].response = {
      type: 'json-value',
      body: batchResponse(),
    };
    server.urls[urls.results].response = {
      type: 'stream-chunks',
      chunks: [
        JSON.stringify({
          custom_id: 'advisor-results',
          result: {
            type: 'succeeded',
            message: {
              ...messageResultBody(''),
              content: [
                {
                  type: 'advisor_tool_result',
                  tool_use_id: 'advisor-plain',
                  content: {
                    type: 'advisor_result',
                    text: 'Use a queue.',
                    stop_reason: 'end_turn',
                  },
                },
                {
                  type: 'advisor_tool_result',
                  tool_use_id: 'advisor-redacted',
                  content: {
                    type: 'advisor_redacted_result',
                    encrypted_content: 'opaque-advice',
                    stop_reason: 'max_tokens',
                  },
                },
                {
                  type: 'advisor_tool_result',
                  tool_use_id: 'advisor-error',
                  content: {
                    type: 'advisor_tool_result_error',
                    error_code: 'max_uses_exceeded',
                  },
                },
              ],
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

    await expect(convertReadableStreamToArray(stream)).resolves.toMatchObject([
      {
        id: 'advisor-results',
        status: 'succeeded',
        result: {
          content: [
            {
              type: 'tool-result',
              toolCallId: 'advisor-plain',
              toolName: 'advisor',
              result: {
                type: 'advisor_result',
                text: 'Use a queue.',
                stopReason: 'end_turn',
              },
            },
            {
              type: 'tool-result',
              toolCallId: 'advisor-redacted',
              toolName: 'advisor',
              result: {
                type: 'advisor_redacted_result',
                encryptedContent: 'opaque-advice',
                stopReason: 'max_tokens',
              },
            },
            {
              type: 'tool-result',
              toolCallId: 'advisor-error',
              toolName: 'advisor',
              isError: true,
              result: {
                type: 'advisor_tool_result_error',
                errorCode: 'max_uses_exceeded',
              },
            },
          ],
        },
      },
    ]);
  });

  it('fails an invalid succeeded item without aborting later results', async () => {
    server.urls[urls.batch].response = {
      type: 'json-value',
      body: batchResponse(),
    };
    server.urls[urls.results].response = {
      type: 'stream-chunks',
      chunks: [
        `${JSON.stringify({
          custom_id: 'invalid',
          result: {
            type: 'succeeded',
            message: { type: 'message' },
          },
        })}\n`,
        JSON.stringify({
          custom_id: 'valid',
          result: {
            type: 'succeeded',
            message: messageResultBody('Paris'),
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

    expect(await convertReadableStreamToArray(stream)).toMatchObject([
      {
        id: 'invalid',
        status: 'failed',
        error: {
          message: 'Anthropic returned an invalid Message batch result.',
          code: 'invalid_response',
        },
      },
      {
        id: 'valid',
        status: 'succeeded',
        result: { content: [{ type: 'text', text: 'Paris' }] },
      },
    ]);
  });

  it('fails an unknown result type without aborting later results', async () => {
    server.urls[urls.batch].response = {
      type: 'json-value',
      body: batchResponse(),
    };
    server.urls[urls.results].response = {
      type: 'stream-chunks',
      chunks: [
        `${JSON.stringify({
          custom_id: 'unknown',
          result: { type: 'future_result', data: 'opaque' },
        })}\n`,
        JSON.stringify({
          custom_id: 'valid',
          result: {
            type: 'succeeded',
            message: messageResultBody('Paris'),
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

    expect(await convertReadableStreamToArray(stream)).toMatchObject([
      {
        id: 'unknown',
        status: 'failed',
        error: {
          message: 'Anthropic returned an invalid Message batch result.',
          code: 'invalid_response',
        },
      },
      {
        id: 'valid',
        status: 'succeeded',
        result: { content: [{ type: 'text', text: 'Paris' }] },
      },
    ]);
  });

  it('skips unknown content blocks in a succeeded result', async () => {
    server.urls[urls.batch].response = {
      type: 'json-value',
      body: batchResponse(),
    };
    server.urls[urls.results].response = {
      type: 'stream-chunks',
      chunks: [
        `${JSON.stringify({
          custom_id: 'future-content',
          result: {
            type: 'succeeded',
            message: {
              ...messageResultBody('Paris'),
              content: [
                { type: 'future_content', data: 'opaque' },
                { type: 'text', text: 'Paris' },
              ],
            },
          },
        })}\n`,
        JSON.stringify({
          custom_id: 'malformed-known-content',
          result: {
            type: 'succeeded',
            message: {
              ...messageResultBody('Paris'),
              content: [{ type: 'text' }, { type: 'text', text: 'Paris' }],
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

    expect(await convertReadableStreamToArray(stream)).toMatchObject([
      {
        id: 'future-content',
        status: 'succeeded',
        result: {
          content: [{ type: 'text', text: 'Paris' }],
          usage: {
            inputTokens: { total: 13 },
            outputTokens: { total: 3 },
          },
        },
      },
      {
        id: 'malformed-known-content',
        status: 'failed',
        error: {
          message: 'Anthropic returned an invalid Message batch result.',
          code: 'invalid_response',
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

  describe('batch result lifecycle', () => {
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

    it('fails an invalid item and continues with later results', async () => {
      server.urls[urls.batch].response = {
        type: 'json-value',
        body: batchResponse(),
      };
      server.urls[urls.results].response = {
        type: 'stream-chunks',
        chunks: [
          `${JSON.stringify({
            custom_id: 'invalid',
            result: {
              type: 'succeeded',
              message: { type: 'message' },
            },
          })}\n`,
          JSON.stringify({
            custom_id: 'valid',
            result: {
              type: 'succeeded',
              message: messageResultBody('Paris'),
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
      const results = await convertReadableStreamToArray(stream);

      expect(results).toHaveLength(2);
      expect(results).toMatchObject([
        {
          id: 'invalid',
          status: 'failed',
          error: {
            message: 'Anthropic returned an invalid Message batch result.',
            code: 'invalid_response',
          },
        },
        {
          id: 'valid',
          status: 'succeeded',
          result: { content: [{ type: 'text', text: 'Paris' }] },
        },
      ]);
    });

    it('preserves successful messages with nullable and newer citation shapes', async () => {
      server.urls[urls.batch].response = {
        type: 'json-value',
        body: batchResponse(),
      };
      server.urls[urls.results].response = {
        type: 'stream-chunks',
        chunks: [
          JSON.stringify({
            custom_id: 'citation-shapes',
            result: {
              type: 'succeeded',
              message: {
                ...messageResultBody('Cited answer'),
                content: [
                  { type: 'text', text: 'No citations', citations: null },
                  {
                    type: 'text',
                    text: 'New citations',
                    citations: [
                      {
                        type: 'content_block_location',
                        cited_text: 'block',
                        document_index: 0,
                        document_title: null,
                        start_block_index: 0,
                        end_block_index: 1,
                        file_id: null,
                      },
                      {
                        type: 'search_result_location',
                        cited_text: 'search result',
                        search_result_index: 0,
                        source: 'https://example.com',
                        title: null,
                        start_block_index: 0,
                        end_block_index: 1,
                      },
                    ],
                  },
                ],
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
      const results = await convertReadableStreamToArray(stream);

      expect(results).toMatchObject([
        {
          id: 'citation-shapes',
          status: 'succeeded',
          result: {
            content: [
              { type: 'text', text: 'No citations' },
              { type: 'text', text: 'New citations' },
            ],
            usage: {
              inputTokens: { total: 13 },
              outputTokens: { total: 3 },
            },
          },
        },
      ]);
    });

    it('does not fail a successful message for a container upload block', async () => {
      server.urls[urls.batch].response = {
        type: 'json-value',
        body: batchResponse(),
      };
      server.urls[urls.results].response = {
        type: 'stream-chunks',
        chunks: [
          JSON.stringify({
            custom_id: 'container-upload',
            result: {
              type: 'succeeded',
              message: {
                ...messageResultBody('Done'),
                content: [
                  { type: 'text', text: 'Done' },
                  { type: 'container_upload', file_id: 'file_123' },
                ],
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
      const results = await convertReadableStreamToArray(stream);

      expect(results).toMatchObject([
        {
          id: 'container-upload',
          status: 'succeeded',
          result: {
            content: [
              { type: 'text', text: 'Done' },
              {
                type: 'custom',
                kind: 'anthropic.container_upload',
                providerMetadata: {
                  anthropic: { fileId: 'file_123' },
                },
              },
            ],
            usage: {
              inputTokens: { total: 13 },
              outputTokens: { total: 3 },
            },
          },
        },
      ]);
    });

    it('rejects a completed batch without output', async () => {
      server.urls[urls.batch].response = {
        type: 'json-value',
        body: batchResponse({ results_url: null }),
      };
      const model = createAnthropic({ apiKey: 'test-api-key' })(
        'claude-3-haiku-20240307',
      );

      await expect(
        model.experimental_doGetBatchResults({ batchId: 'msgbatch_123' }),
      ).rejects.toMatchObject({
        name: 'AI_InvalidResponseDataError',
        message:
          'Anthropic batch "msgbatch_123" completed without batch output.',
      });
    });

    it('preserves tool items and continues with later results', async () => {
      server.urls[urls.batch].response = {
        type: 'json-value',
        body: batchResponse({
          request_counts: {
            processing: 0,
            succeeded: 2,
            errored: 0,
            canceled: 0,
            expired: 0,
          },
        }),
      };
      server.urls[urls.results].response = {
        type: 'stream-chunks',
        chunks: [
          `${JSON.stringify({
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
          })}\n`,
          JSON.stringify({
            custom_id: 'valid',
            result: {
              type: 'succeeded',
              message: messageResultBody('Paris'),
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
      const results = await convertReadableStreamToArray(stream);

      expect(results).toHaveLength(2);
      expect(results).toMatchObject([
        {
          id: 'tool-call',
          status: 'succeeded',
          result: {
            content: [
              {
                type: 'tool-call',
                toolCallId: 'toolu_123',
                toolName: 'get_weather',
                input: '{"city":"Paris"}',
              },
            ],
          },
        },
        {
          id: 'valid',
          status: 'succeeded',
          result: { content: [{ type: 'text', text: 'Paris' }] },
        },
      ]);
    });
  });
});
