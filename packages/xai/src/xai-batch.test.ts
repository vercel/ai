import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it, vi } from 'vitest';
import { XaiResponsesLanguageModel } from './responses/xai-responses-language-model';
import { createXai } from './xai-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const urls = {
  files: 'https://api.x.ai/v1/files',
  batches: 'https://api.x.ai/v1/batches',
  batch: 'https://api.x.ai/v1/batches/batch_123',
  results: 'https://api.x.ai/v1/batches/batch_123/results',
  resultsPage1: 'https://api.x.ai/v1/batches/batch_123/results?limit=1000',
  resultsPage2:
    'https://api.x.ai/v1/batches/batch_123/results?limit=1000&pagination_token=next%2Fpage',
} as const;

const server = createTestServer({
  [urls.files]: {},
  [urls.batches]: {},
  [urls.batch]: {},
  [urls.results]: {},
});

const config = {
  provider: 'xai.responses',
  baseURL: 'https://api.x.ai/v1',
  headers: () => ({ Authorization: 'Bearer test-api-key' }),
  generateId: () => 'generated-id',
};

function request(
  prompt: string,
  modelId: 'grok-4.3' | 'grok-4.20-non-reasoning' = 'grok-4.3',
  options: { topK?: number } = {},
) {
  return {
    type: 'text' as const,
    modelId,
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
    batch_id: 'batch_123',
    name: 'ai-sdk-text-batch',
    create_time: '2026-08-25T12:00:00Z',
    expire_time: '2099-08-26T12:00:00Z',
    cancel_time: null,
    cancel_by_xai_message: null,
    state: {
      num_requests: 2,
      num_pending: 0,
      num_success: 2,
      num_error: 0,
      num_cancelled: 0,
    },
    ...overrides,
  };
}

function chatResultBody(text: string) {
  return {
    id: 'response_123',
    object: 'chat.completion',
    created: 1_700_000_000,
    model: 'grok-4.3',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: text,
          reasoning_content: 'Reasoning',
          tool_calls: null,
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 3,
      total_tokens: 14,
      prompt_tokens_details: { cached_tokens: 2 },
      completion_tokens_details: { reasoning_tokens: 1 },
      cost_in_usd_ticks: 123,
    },
    citations: ['https://example.com/source'],
    service_tier: 'default',
  };
}

function successfulResult(id: string, text: string) {
  return {
    batch_request_id: id,
    batch_result: {
      response: { chat_get_completion: chatResultBody(text) },
      error: { code: 0, message: '' },
    },
  };
}

describe('xAI batch', () => {
  it('uploads prepared JSONL requests and creates a file-backed batch', async () => {
    server.urls[urls.files].response = {
      type: 'json-value',
      body: {
        id: 'file_123',
        filename: 'batch.jsonl',
        expires_at: 1_700_172_800,
      },
    };
    server.urls[urls.batches].response = {
      type: 'json-value',
      body: batchResponse({
        state: {
          num_requests: 2,
          num_pending: 2,
          num_success: 0,
          num_error: 0,
          num_cancelled: 0,
        },
      }),
    };
    const batch = createXai({
      apiKey: 'test-api-key',
      headers: { 'Provider-Header': 'provider' },
    }).experimental_batch();

    const result = await batch.doStartBatch({
      requests: [
        { id: 'france', ...request('What is the capital of France?') },
        {
          id: 'germany',
          ...request(
            'What is the capital of Germany?',
            'grok-4.20-non-reasoning',
            { topK: 10 },
          ),
        },
      ],
      headers: { 'Operation-Header': 'operation' },
      webhookUrl: 'https://example.com/batch-webhook',
    });

    expect(result).toEqual({
      batchId: 'batch_123',
      status: 'pending',
      requestCounts: {
        total: 2,
        pending: 2,
        completed: 0,
        failed: 0,
      },
      createdAt: '2026-08-25T12:00:00Z',
      expiresAt: '2099-08-26T12:00:00Z',
      providerMetadata: {
        xai: {
          inputFileId: 'file_123',
          inputFileExpiresAt: '2023-11-16T22:13:20.000Z',
        },
      },
      warnings: [
        {
          warning: {
            type: 'unsupported',
            feature: 'webhookUrl',
            details:
              'The xAI Batch API does not support per-batch webhook URLs.',
          },
        },
        {
          requestId: 'germany',
          warning: { type: 'unsupported', feature: 'topK' },
        },
      ],
    });

    const multipart = await server.calls[0].requestBodyMultipart;
    const file = multipart?.file as File;
    expect(file.name).toBe('batch.jsonl');
    expect(file.type).toBe('application/jsonl');
    expect(multipart?.expires_after).toBeUndefined();
    const lines = (await file.text())
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));
    expect(lines).toEqual([
      {
        custom_id: 'france',
        method: 'POST',
        url: '/v1/responses',
        body: {
          model: 'grok-4.3',
          input: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text: 'What is the capital of France?',
                },
              ],
            },
          ],
        },
      },
      {
        custom_id: 'germany',
        method: 'POST',
        url: '/v1/responses',
        body: {
          model: 'grok-4.20-non-reasoning',
          input: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text: 'What is the capital of Germany?',
                },
              ],
            },
          ],
        },
      },
    ]);
    expect(await server.calls[1].requestBodyJson).toEqual({
      name: 'ai-sdk-text-batch',
      input_file_id: 'file_123',
    });
    for (const call of server.calls) {
      expect(call.requestHeaders).toMatchObject({
        authorization: 'Bearer test-api-key',
        'provider-header': 'provider',
        'operation-header': 'operation',
      });
    }
  });

  it('appends inputFileExpiresAfter as expires_after before the file part', async () => {
    server.urls[urls.files].response = {
      type: 'json-value',
      body: { id: 'file_123', filename: 'batch.jsonl' },
    };
    server.urls[urls.batches].response = {
      type: 'json-value',
      body: batchResponse(),
    };
    const batch = createXai({
      apiKey: 'test-api-key',
    }).experimental_batch();

    const result = await batch.doStartBatch({
      requests: [
        { id: 'france', ...request('What is the capital of France?') },
      ],
      providerOptions: { xai: { inputFileExpiresAfter: 172_800 } },
    });

    const multipart = await server.calls[0].requestBodyMultipart;
    expect(multipart?.expires_after).toBe('172800');
    // xAI rejects uploads where expires_after arrives after the file part
    expect(Object.keys(multipart ?? {})).toEqual(['expires_after', 'file']);
    expect(await server.calls[1].requestBodyJson).toEqual({
      name: 'ai-sdk-text-batch',
      input_file_id: 'file_123',
    });
    expect(result.providerMetadata).toEqual({
      xai: { inputFileId: 'file_123' },
    });
  });

  it('maps xAI state counters and cancellation metadata', async () => {
    server.urls[urls.batch].response = {
      type: 'json-value',
      body: batchResponse({
        cancel_time: '2026-08-25T12:30:00Z',
        cancel_by_xai_message: 'Cancelled by user.',
        state: {
          num_requests: 4,
          num_pending: 0,
          num_success: 2,
          num_error: 1,
          num_cancelled: 1,
        },
      }),
    };
    const batch = createXai({ apiKey: 'test-api-key' }).experimental_batch();

    await expect(
      batch.doGetBatchStatus({
        batchId: 'batch_123',
      }),
    ).resolves.toEqual({
      status: 'failed',
      requestCounts: {
        total: 4,
        pending: 0,
        completed: 2,
        failed: 2,
      },
      error: {
        message: 'Cancelled by user.',
        code: 'batch_cancelled',
      },
      createdAt: '2026-08-25T12:00:00Z',
      expiresAt: '2099-08-26T12:00:00Z',
    });
  });

  it('omits inconsistent request counts', async () => {
    server.urls[urls.batch].response = {
      type: 'json-value',
      body: batchResponse({
        state: {
          num_requests: 2,
          num_pending: 1,
          num_success: 2,
          num_error: 0,
          num_cancelled: 0,
        },
      }),
    };
    const batch = createXai({ apiKey: 'test-api-key' }).experimental_batch();

    const status = await batch.doGetBatchStatus({
      batchId: 'batch_123',
    });

    expect(status).toMatchObject({ status: 'pending' });
    expect(status.requestCounts).toBeUndefined();
  });

  it('rejects result retrieval while the batch is pending', async () => {
    server.urls[urls.batch].response = {
      type: 'json-value',
      body: batchResponse({
        state: {
          num_requests: 2,
          num_pending: 1,
          num_success: 1,
          num_error: 0,
          num_cancelled: 0,
        },
      }),
    };
    const batch = createXai({ apiKey: 'test-api-key' }).experimental_batch();

    await expect(
      batch.doGetBatchResults({
        batchId: 'batch_123',
      }),
    ).rejects.toMatchObject({
      name: 'AI_InvalidArgumentError',
      argument: 'batchId',
      message: 'xAI batch "batch_123" is not complete.',
    });
  });

  it('paginates and converts successful and failed results', async () => {
    server.urls[urls.batch].response = {
      type: 'json-value',
      body: batchResponse(),
    };
    server.urls[urls.results].response = ({ callNumber }) =>
      callNumber === 1
        ? {
            type: 'json-value',
            body: {
              results: [successfulResult('france', 'Paris')],
              pagination_token: 'next/page',
            },
          }
        : {
            type: 'json-value',
            body: {
              results: [
                {
                  batch_request_id: 'failed',
                  batch_result: {
                    error: { code: 3, message: 'Invalid request.' },
                  },
                  error_message: 'Invalid request.',
                },
                {
                  batch_request_id: 'cancelled',
                  batch_result: {
                    error: { code: 1, message: 'Cancelled.' },
                  },
                },
              ],
              pagination_token: null,
            },
          };
    const batch = createXai({ apiKey: 'test-api-key' }).experimental_batch();

    const stream = await batch.doGetBatchResults({
      batchId: 'batch_123',
    });
    const results = await convertReadableStreamToArray(stream);

    expect(results).toMatchObject([
      {
        type: 'text',
        id: 'france',
        status: 'succeeded',
        result: {
          content: [
            { type: 'text', text: 'Paris' },
            { type: 'reasoning', text: 'Reasoning' },
            {
              type: 'source',
              sourceType: 'url',
              url: 'https://example.com/source',
            },
          ],
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: {
            inputTokens: { total: 10, noCache: 8, cacheRead: 2 },
            outputTokens: { total: 4, text: 3, reasoning: 1 },
          },
          providerMetadata: {
            xai: { costInUsdTicks: 123, serviceTier: 'default' },
          },
        },
      },
      {
        type: 'text',
        id: 'failed',
        status: 'failed',
        error: { message: 'Invalid request.', code: '3' },
      },
      {
        type: 'text',
        id: 'cancelled',
        status: 'cancelled',
        error: { message: 'Cancelled.', code: '1' },
      },
    ]);
    expect(server.calls.map(call => call.requestUrl)).toEqual([
      urls.batch,
      urls.resultsPage1,
      urls.resultsPage2,
    ]);
  });

  it('preserves tool calls and fails invalid items without stopping later results', async () => {
    server.urls[urls.batch].response = {
      type: 'json-value',
      body: batchResponse(),
    };
    server.urls[urls.results].response = {
      type: 'json-value',
      body: {
        results: [
          {
            batch_request_id: 'invalid',
            batch_result: {
              response: { chat_get_completion: { choices: 42 } },
            },
          },
          {
            batch_request_id: 'tool-call',
            batch_result: {
              response: {
                chat_get_completion: {
                  ...chatResultBody(''),
                  choices: [
                    {
                      index: 0,
                      message: {
                        role: 'assistant',
                        content: null,
                        reasoning_content: null,
                        tool_calls: [
                          {
                            id: 'call_1',
                            type: 'function',
                            function: {
                              name: 'weather',
                              arguments: '{}',
                            },
                          },
                        ],
                      },
                      finish_reason: 'tool_calls',
                    },
                  ],
                },
              },
            },
          },
          successfulResult('valid', 'Berlin'),
        ],
        pagination_token: null,
      },
    };
    const batch = createXai({ apiKey: 'test-api-key' }).experimental_batch();

    const stream = await batch.doGetBatchResults({
      batchId: 'batch_123',
    });
    const results = await convertReadableStreamToArray(stream);

    expect(results).toMatchObject([
      {
        type: 'text',
        id: 'invalid',
        status: 'failed',
        error: { code: 'invalid_response' },
      },
      {
        type: 'text',
        id: 'tool-call',
        status: 'succeeded',
        result: {
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call_1',
              toolName: 'weather',
              input: '{}',
            },
            {
              type: 'source',
              sourceType: 'url',
              url: 'https://example.com/source',
            },
          ],
        },
      },
      {
        type: 'text',
        id: 'valid',
        status: 'succeeded',
        result: {
          content: [
            { type: 'text', text: 'Berlin' },
            { type: 'reasoning', text: 'Reasoning' },
            {
              type: 'source',
              sourceType: 'url',
              url: 'https://example.com/source',
            },
          ],
          providerMetadata: {
            xai: { costInUsdTicks: 123, serviceTier: 'default' },
          },
        },
      },
    ]);
  });

  it('preserves provider-executed tool calls and final text from batch transcripts', async () => {
    server.urls[urls.batch].response = {
      type: 'json-value',
      body: batchResponse(),
    };
    server.urls[urls.results].response = {
      type: 'json-value',
      body: {
        results: [
          {
            batch_request_id: 'provider-tool',
            batch_result: {
              response: {
                chat_get_completion: {
                  ...chatResultBody(''),
                  choices: [
                    {
                      index: 0,
                      message: {
                        role: 'assistant',
                        content: null,
                        tool_calls: [
                          {
                            id: 'web-search-1',
                            type: 'function',
                            function: {
                              name: 'web_search',
                              arguments: '{"query":"Vercel"}',
                            },
                          },
                        ],
                      },
                      finish_reason: '',
                    },
                    {
                      index: 1,
                      message: {
                        role: 'tool',
                        content: 'Search results',
                        tool_calls: [
                          {
                            id: 'web-search-1',
                            type: 'function',
                            function: {
                              name: 'web_search',
                              arguments: '{"query":"Vercel"}',
                            },
                          },
                        ],
                      },
                      finish_reason: '',
                    },
                    {
                      index: 2,
                      message: {
                        role: 'assistant',
                        content: 'Final answer',
                        tool_calls: null,
                      },
                      finish_reason: 'stop',
                    },
                    {
                      index: 3,
                      message: {
                        role: 'tool',
                        content: null,
                        tool_calls: [],
                      },
                      finish_reason: '',
                    },
                  ],
                },
              },
            },
          },
          {
            batch_request_id: 'client-tool-with-provider-name',
            batch_result: {
              response: {
                chat_get_completion: {
                  ...chatResultBody(''),
                  choices: [
                    {
                      index: 0,
                      message: {
                        role: 'assistant',
                        content: null,
                        tool_calls: [
                          {
                            id: 'client-web-search-1',
                            type: 'function',
                            function: {
                              name: 'web_search',
                              arguments: '{}',
                            },
                          },
                        ],
                      },
                      finish_reason: 'tool_calls',
                    },
                  ],
                },
              },
            },
          },
        ],
        pagination_token: null,
      },
    };
    const batch = createXai({ apiKey: 'test-api-key' }).experimental_batch();

    const stream = await batch.doGetBatchResults({
      batchId: 'batch_123',
    });

    await expect(convertReadableStreamToArray(stream)).resolves.toMatchObject([
      {
        type: 'text',
        id: 'provider-tool',
        status: 'succeeded',
        result: {
          content: [
            {
              type: 'tool-call',
              toolCallId: 'web-search-1',
              toolName: 'web_search',
              input: '{"query":"Vercel"}',
              providerExecuted: true,
              dynamic: true,
            },
            {
              type: 'tool-result',
              toolCallId: 'web-search-1',
              toolName: 'web_search',
              result: 'Search results',
              dynamic: true,
            },
            { type: 'text', text: 'Final answer' },
            {
              type: 'source',
              sourceType: 'url',
              url: 'https://example.com/source',
            },
          ],
          finishReason: { unified: 'stop', raw: 'stop' },
        },
      },
      {
        type: 'text',
        id: 'client-tool-with-provider-name',
        status: 'succeeded',
        result: {
          content: [
            {
              type: 'tool-call',
              toolCallId: 'client-web-search-1',
              toolName: 'web_search',
              input: '{}',
            },
            {
              type: 'source',
              sourceType: 'url',
              url: 'https://example.com/source',
            },
          ],
          finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
        },
      },
    ]);
  });

  it('exposes batch support on the provider', () => {
    const provider = createXai({ apiKey: 'test-api-key' });
    const batch = provider.experimental_batch();

    expect(batch.doStartBatch).toBeTypeOf('function');
    expect(batch.doGetBatchStatus).toBeTypeOf('function');
    expect(batch.doGetBatchResults).toBeTypeOf('function');

    for (const model of [
      provider('grok-4.3'),
      provider.responses('grok-4.3'),
      provider.chat('grok-4.3'),
    ]) {
      expect((model as any).doStartBatch).toBeUndefined();
    }
    expect(
      (new XaiResponsesLanguageModel('grok-4.3', config) as any).doStartBatch,
    ).toBeUndefined();
  });
});
