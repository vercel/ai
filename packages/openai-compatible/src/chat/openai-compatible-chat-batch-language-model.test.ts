import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import {
  createOpenAICompatible,
  type OpenAICompatibleProviderSettings,
} from '../openai-compatible-provider';

const urls = {
  files: 'https://api.example.com/v1/files',
  batches: 'https://api.example.com/v1/batches',
  batch: 'https://api.example.com/v1/batches/batch_123',
  output: 'https://api.example.com/v1/files/file-output/content',
  errors: 'https://api.example.com/v1/files/file-errors/content',
} as const;

const server = createTestServer({
  [urls.files]: {},
  [urls.batches]: {},
  [urls.batch]: {},
  [urls.output]: {},
  [urls.errors]: {},
});

function request(prompt: string) {
  return {
    options: {
      prompt: [
        {
          role: 'user' as const,
          content: [{ type: 'text' as const, text: prompt }],
        },
      ],
    },
  };
}

function batchResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'batch_123',
    status: 'completed',
    output_file_id: null,
    error_file_id: null,
    created_at: 1_700_000_000,
    expires_at: 1_700_086_400,
    request_counts: { total: 1, completed: 1, failed: 0 },
    errors: null,
    ...overrides,
  };
}

function resultLine({
  id,
  body,
  statusCode = 200,
}: {
  id: string;
  body: unknown;
  statusCode?: number;
}) {
  return JSON.stringify({
    custom_id: id,
    response: { status_code: statusCode, body },
    error: null,
  });
}

function model(
  options: Pick<
    OpenAICompatibleProviderSettings,
    'convertUsage' | 'metadataExtractor' | 'transformRequestBody'
  > = {},
) {
  return createOpenAICompatible({
    baseURL: 'https://api.example.com/v1',
    name: 'example',
    apiKey: 'test-api-key',
    supportsBatch: true,
    ...options,
  })('example-model');
}

describe('OpenAI-compatible chat batch language model', () => {
  it('creates a chat-completions batch from prepared JSONL requests', async () => {
    server.urls[urls.files].response = {
      type: 'json-value',
      body: { id: 'file-input' },
    };
    server.urls[urls.batches].response = {
      type: 'json-value',
      body: batchResponse({
        status: 'validating',
        request_counts: { total: 1, completed: 0, failed: 0 },
      }),
    };

    const result = await model().experimental_doStartBatch({
      requests: [
        { id: 'france', ...request('What is the capital of France?') },
      ],
      webhookUrl: 'https://example.com/batch-webhook',
    });

    expect(result).toMatchObject({
      batchId: 'batch_123',
      status: 'pending',
      rawStatus: 'validating',
      requestCounts: { total: 1, pending: 1, completed: 0, failed: 0 },
      warnings: [
        {
          warning: {
            type: 'unsupported',
            feature: 'webhookUrl',
            details:
              'OpenAI-compatible batch APIs do not support per-batch webhook URLs.',
          },
        },
      ],
    });
    const multipart = await server.calls[0].requestBodyMultipart;
    expect(multipart?.purpose).toBe('batch');
    const file = multipart?.file as File;
    expect(file.name).toBe('batch.jsonl');
    await expect(file.text()).resolves.toBe(
      `${JSON.stringify({
        custom_id: 'france',
        method: 'POST',
        url: '/v1/chat/completions',
        body: {
          model: 'example-model',
          messages: [
            {
              role: 'user',
              content: 'What is the capital of France?',
            },
          ],
        },
      })}\n`,
    );
    await expect(server.calls[1].requestBodyJson).resolves.toEqual({
      input_file_id: 'file-input',
      endpoint: '/v1/chat/completions',
      completion_window: '24h',
    });
  });

  it('converts chat-completion result files', async () => {
    server.urls[urls.batch].response = {
      type: 'json-value',
      body: batchResponse({ output_file_id: 'file-output' }),
    };
    server.urls[urls.output].response = {
      type: 'stream-chunks',
      headers: { 'Content-Type': 'application/jsonl' },
      chunks: [
        JSON.stringify({
          custom_id: 'france',
          response: {
            status_code: 200,
            body: {
              id: 'chatcmpl_123',
              created: 1_700_000_000,
              model: 'example-model',
              choices: [
                {
                  message: { role: 'assistant', content: 'Paris' },
                  finish_reason: 'stop',
                },
              ],
              usage: {
                prompt_tokens: 10,
                completion_tokens: 3,
                prompt_tokens_details: { cached_tokens: 2 },
                completion_tokens_details: { reasoning_tokens: 1 },
              },
            },
          },
        }),
        '\n',
      ],
    };

    const results = await convertReadableStreamToArray(
      await model().experimental_doGetBatchResults({ batchId: 'batch_123' }),
    );

    expect(results).toEqual([
      {
        id: 'france',
        status: 'succeeded',
        result: {
          content: [{ type: 'text', text: 'Paris' }],
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: {
            inputTokens: { total: 10, noCache: 8, cacheRead: 2 },
            outputTokens: { total: 3, text: 2, reasoning: 1 },
            raw: {
              prompt_tokens: 10,
              completion_tokens: 3,
              prompt_tokens_details: { cached_tokens: 2 },
              completion_tokens_details: { reasoning_tokens: 1 },
            },
          },
          response: {
            id: 'chatcmpl_123',
            timestamp: new Date('2023-11-14T22:13:20.000Z'),
            modelId: 'example-model',
          },
          providerMetadata: { example: {} },
          warnings: [],
        },
      },
    ]);
  });

  it.each([
    ['validating', 'pending'],
    ['in_progress', 'pending'],
    ['finalizing', 'pending'],
    ['cancelling', 'pending'],
    ['completed', 'completed'],
    ['failed', 'failed'],
    ['expired', 'failed'],
    ['cancelled', 'failed'],
    ['future_status', 'pending'],
  ] as const)('maps status %s to %s', async (rawStatus, status) => {
    server.urls[urls.batch].response = {
      type: 'json-value',
      body: batchResponse({ status: rawStatus }),
    };

    await expect(
      model().experimental_doGetBatchStatus({ batchId: 'batch_123' }),
    ).resolves.toMatchObject({ status, rawStatus });
  });

  it('normalizes status details and omits invalid request counts', async () => {
    server.urls[urls.batch].response = {
      type: 'json-value',
      body: batchResponse({
        status: 'failed',
        request_counts: { total: 5, completed: 2, failed: 1 },
        errors: {
          data: [{ code: 'invalid_request', message: 'Invalid input file.' }],
        },
      }),
    };

    await expect(
      model().experimental_doGetBatchStatus({ batchId: 'batch_123' }),
    ).resolves.toEqual({
      status: 'failed',
      rawStatus: 'failed',
      requestCounts: {
        total: 5,
        pending: 2,
        completed: 2,
        failed: 1,
      },
      error: {
        code: 'invalid_request',
        message: 'Invalid input file.',
      },
      createdAt: '2023-11-14T22:13:20.000Z',
      expiresAt: '2023-11-15T22:13:20.000Z',
    });

    server.urls[urls.batch].response = {
      type: 'json-value',
      body: batchResponse({
        request_counts: { total: 1, completed: 2, failed: 0 },
      }),
    };

    await expect(
      model().experimental_doGetBatchStatus({ batchId: 'batch_123' }),
    ).resolves.not.toHaveProperty('requestCounts');
  });

  it('parses chunked output and error files without failing other items', async () => {
    server.urls[urls.batch].response = {
      type: 'json-value',
      body: batchResponse({
        output_file_id: 'file-output',
        error_file_id: 'file-errors',
      }),
    };
    const invalid = resultLine({ id: 'invalid', body: { choices: 42 } });
    const valid = resultLine({
      id: 'valid',
      body: {
        choices: [
          {
            message: { role: 'assistant', content: 'Paris' },
            finish_reason: 'stop',
          },
        ],
      },
    });
    server.urls[urls.output].response = {
      type: 'stream-chunks',
      headers: { 'Content-Type': 'application/jsonl' },
      chunks: [
        invalid.slice(0, 17),
        `${invalid.slice(17)}\r`,
        `\n${valid.slice(0, 29)}`,
        valid.slice(29),
      ],
    };
    server.urls[urls.errors].response = {
      type: 'stream-chunks',
      headers: { 'Content-Type': 'application/jsonl' },
      chunks: [
        `${resultLine({
          id: 'http-error',
          statusCode: 400,
          body: {
            error: {
              message: 'Invalid request.',
              type: 'invalid_request_error',
              code: 'invalid_request',
            },
          },
        })}\n`,
        `${JSON.stringify({
          custom_id: 'cancelled',
          response: null,
          error: { code: 'batch_cancelled', message: 'Batch cancelled.' },
        })}\n`,
        JSON.stringify({
          custom_id: 'expired',
          response: null,
          error: { code: 'batch_expired', message: 'Batch expired.' },
        }),
      ],
    };

    const results = await convertReadableStreamToArray(
      await model().experimental_doGetBatchResults({ batchId: 'batch_123' }),
    );

    expect(results).toMatchObject([
      {
        id: 'invalid',
        status: 'failed',
        error: {
          message:
            'OpenAI-compatible provider returned an invalid chat-completion batch result.',
          code: 'invalid_response',
        },
      },
      {
        id: 'valid',
        status: 'succeeded',
        result: { content: [{ type: 'text', text: 'Paris' }] },
      },
      {
        id: 'http-error',
        status: 'failed',
        error: {
          message: 'Invalid request.',
          type: 'invalid_request_error',
          code: 'invalid_request',
          statusCode: 400,
        },
      },
      {
        id: 'cancelled',
        status: 'cancelled',
        error: { message: 'Batch cancelled.', code: 'batch_cancelled' },
      },
      {
        id: 'expired',
        status: 'expired',
        error: { message: 'Batch expired.', code: 'batch_expired' },
      },
    ]);
  });

  it('rejects result retrieval before completion and without output', async () => {
    server.urls[urls.batch].response = {
      type: 'json-value',
      body: batchResponse({ status: 'in_progress' }),
    };

    await expect(
      model().experimental_doGetBatchResults({ batchId: 'batch_123' }),
    ).rejects.toMatchObject({
      name: 'AI_InvalidArgumentError',
      argument: 'batchId',
      message: 'OpenAI-compatible batch "batch_123" is not complete.',
    });

    server.urls[urls.batch].response = {
      type: 'json-value',
      body: batchResponse(),
    };

    await expect(
      model().experimental_doGetBatchResults({ batchId: 'batch_123' }),
    ).rejects.toMatchObject({
      name: 'AI_InvalidResponseDataError',
      message:
        'OpenAI-compatible batch "batch_123" completed without batch output.',
    });
  });

  it('applies provider request and response customizations', async () => {
    server.urls[urls.files].response = {
      type: 'json-value',
      body: { id: 'file-input' },
    };
    server.urls[urls.batches].response = {
      type: 'json-value',
      body: batchResponse({ status: 'validating' }),
    };

    const customizedModel = model({
      transformRequestBody: body => ({
        ...body,
        provider_setting: 'enabled',
      }),
      convertUsage: () => ({
        inputTokens: {
          total: 101,
          noCache: 101,
          cacheRead: 0,
          cacheWrite: undefined,
        },
        outputTokens: {
          total: 202,
          text: 202,
          reasoning: 0,
        },
        raw: undefined,
      }),
      metadataExtractor: {
        extractMetadata: async () => ({
          example: { providerBatchId: 'provider-batch-id' },
        }),
        createStreamExtractor: () => ({
          processChunk() {},
          buildMetadata: () => undefined,
        }),
      },
    });

    await customizedModel.experimental_doStartBatch({
      requests: [{ id: 'request', ...request('Hello') }],
    });

    const multipart = await server.calls[0].requestBodyMultipart;
    const file = multipart?.file as File;
    const inputLine = JSON.parse(await file.text()) as Record<string, any>;
    expect(inputLine.body.provider_setting).toBe('enabled');

    server.urls[urls.batch].response = {
      type: 'json-value',
      body: batchResponse({ output_file_id: 'file-output' }),
    };
    server.urls[urls.output].response = {
      type: 'stream-chunks',
      headers: { 'Content-Type': 'application/jsonl' },
      chunks: [
        `${JSON.stringify({
          custom_id: 'request',
          response: {
            status_code: 200,
            body: {
              choices: [
                {
                  message: { role: 'assistant', content: 'Hi' },
                  finish_reason: 'stop',
                },
              ],
              usage: { prompt_tokens: 1, completion_tokens: 2 },
            },
          },
        })}\n`,
      ],
    };

    const [result] = await convertReadableStreamToArray(
      await customizedModel.experimental_doGetBatchResults({
        batchId: 'batch_123',
      }),
    );

    expect(result).toMatchObject({
      status: 'succeeded',
      result: {
        usage: {
          inputTokens: { total: 101 },
          outputTokens: { total: 202 },
        },
        providerMetadata: {
          example: { providerBatchId: 'provider-batch-id' },
        },
      },
    });
  });

  it('does not expose batch methods without the opt-in', () => {
    const model = createOpenAICompatible({
      baseURL: 'https://api.example.com/v1',
      name: 'example',
    })('example-model');

    expect('experimental_doStartBatch' in model).toBe(false);
  });
});
