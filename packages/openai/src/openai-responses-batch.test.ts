import { JSONParseError } from '@ai-sdk/provider';
import {
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it, vi } from 'vitest';
import { OpenAIChatLanguageModel } from './chat/openai-chat-language-model';
import { OpenAIResponsesBatchLanguageModel } from './openai-responses-batch';
import { createOpenAI } from './openai-provider';
import { OpenAIResponsesLanguageModel } from './responses/openai-responses-language-model';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const urls = {
  responses: 'https://api.openai.com/v1/responses',
  files: 'https://api.openai.com/v1/files',
  batches: 'https://api.openai.com/v1/batches',
  batch: 'https://api.openai.com/v1/batches/batch_123',
  output: 'https://api.openai.com/v1/files/file-output/content',
  errors: 'https://api.openai.com/v1/files/file-errors/content',
} as const;

const server = createTestServer({
  [urls.responses]: {},
  [urls.files]: {},
  [urls.batches]: {},
  [urls.batch]: {},
  [urls.output]: {},
  [urls.errors]: {},
});

const config = {
  provider: 'openai.responses',
  url: ({ path }: { path: string }) => `https://api.openai.com/v1${path}`,
  headers: () => ({ Authorization: 'Bearer test-api-key' }),
};

function request(prompt: string, options: { topK?: number } = {}) {
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
    id: 'batch_123',
    status: 'completed',
    output_file_id: null,
    error_file_id: null,
    created_at: 1_700_000_000,
    expires_at: 1_700_086_400,
    request_counts: {
      total: 2,
      completed: 2,
      failed: 0,
    },
    errors: null,
    ...overrides,
  };
}

function prepareCreateResponse(overrides: Record<string, unknown> = {}) {
  server.urls[urls.files].response = {
    type: 'json-value',
    body: {
      id: 'file-input',
      object: 'file',
      filename: 'batch.jsonl',
      purpose: 'batch',
      expires_at: 1_700_172_800,
    },
  };
  server.urls[urls.batches].response = {
    type: 'json-value',
    body: batchResponse(overrides),
  };
}

function responsesResultBody(text: string) {
  return {
    id: 'resp_123',
    created_at: 1_700_000_000,
    model: 'gpt-5.6',
    output: [
      {
        type: 'message',
        role: 'assistant',
        id: 'msg_123',
        phase: null,
        content: [
          {
            type: 'output_text',
            text,
            logprobs: null,
            annotations: [],
          },
        ],
      },
    ],
    service_tier: 'default',
    reasoning: null,
    incomplete_details: null,
    usage: {
      input_tokens: 10,
      input_tokens_details: { cached_tokens: 2 },
      output_tokens: 3,
      output_tokens_details: { reasoning_tokens: 1 },
    },
  };
}

function resultLine({ id, body }: { id: string; body: unknown }) {
  return JSON.stringify({
    custom_id: id,
    response: {
      status_code: 200,
      request_id: `openai-${id}`,
      body,
    },
    error: null,
  });
}

describe('OpenAI batch language models', () => {
  it('creates a Responses batch from prepared JSONL requests', async () => {
    prepareCreateResponse({
      status: 'validating',
      request_counts: { total: 2, completed: 0, failed: 0 },
    });
    const model = createOpenAI({
      apiKey: 'test-api-key',
      headers: { 'Provider-Header': 'provider' },
    }).responses('gpt-5.6');

    const result = await model.experimental_doStartBatch({
      requests: [
        { id: 'france', ...request('What is the capital of France?') },
        {
          id: 'germany',
          ...request('What is the capital of Germany?', { topK: 10 }),
        },
      ],
      headers: { 'Operation-Header': 'operation' },
      webhookUrl: 'https://example.com/batch-webhook',
    });

    expect(result).toEqual({
      batchId: 'batch_123',
      status: 'pending',
      rawStatus: 'validating',
      requestCounts: {
        total: 2,
        pending: 2,
        completed: 0,
        failed: 0,
      },
      createdAt: '2023-11-14T22:13:20.000Z',
      expiresAt: '2023-11-15T22:13:20.000Z',
      providerMetadata: {
        openai: {
          inputFileId: 'file-input',
          inputFileExpiresAt: '2023-11-16T22:13:20.000Z',
        },
      },
      warnings: [
        {
          warning: {
            type: 'unsupported',
            feature: 'webhookUrl',
            details:
              'The OpenAI Batch API does not support per-batch webhook URLs.',
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
    expect(multipart?.purpose).toBe('batch');
    expect(multipart?.['expires_after[anchor]']).toBe('created_at');
    expect(multipart?.['expires_after[seconds]']).toBe('172800');
    expect(file.name).toBe('batch.jsonl');
    expect(file.type).toBe('application/jsonl');

    const lines = (await file.text())
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      custom_id: 'france',
      method: 'POST',
      url: '/v1/responses',
      body: {
        model: 'gpt-5.6',
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
    });
    expect(await server.calls[1].requestBodyJson).toEqual({
      input_file_id: 'file-input',
      endpoint: '/v1/responses',
      completion_window: '24h',
    });
    expect(server.calls[0].requestHeaders).toMatchObject({
      authorization: 'Bearer test-api-key',
      'provider-header': 'provider',
      'operation-header': 'operation',
    });
    expect(server.calls[1].requestHeaders).toMatchObject({
      authorization: 'Bearer test-api-key',
      'provider-header': 'provider',
      'operation-header': 'operation',
    });
  });

  it('applies the inputFileExpiresAfter provider option to the input file upload', async () => {
    prepareCreateResponse();
    const model = createOpenAI({ apiKey: 'test-api-key' }).responses('gpt-5.6');

    await model.experimental_doStartBatch({
      requests: [
        { id: 'france', ...request('What is the capital of France?') },
      ],
      providerOptions: { openai: { inputFileExpiresAfter: 3600 } },
    });

    const multipart = await server.calls[0].requestBodyMultipart;
    expect(multipart?.['expires_after[anchor]']).toBe('created_at');
    expect(multipart?.['expires_after[seconds]']).toBe('3600');
  });

  it('omits inputFileExpiresAt when the upload response carries no expiry', async () => {
    prepareCreateResponse();
    server.urls[urls.files].response = {
      type: 'json-value',
      body: { id: 'file-input', object: 'file' },
    };
    const model = createOpenAI({ apiKey: 'test-api-key' }).responses('gpt-5.6');

    const result = await model.experimental_doStartBatch({
      requests: [
        { id: 'france', ...request('What is the capital of France?') },
      ],
    });

    expect(result.providerMetadata).toEqual({
      openai: { inputFileId: 'file-input' },
    });
  });

  it('warns when a provider tool can return unsupported batch output', async () => {
    prepareCreateResponse();
    const model = createOpenAI({ apiKey: 'test-api-key' }).responses('gpt-5.6');

    const result = await model.experimental_doStartBatch({
      requests: [
        {
          id: 'image',
          ...request('Generate an image.'),
          options: {
            ...request('Generate an image.').options,
            tools: [
              {
                type: 'provider',
                id: 'openai.image_generation',
                name: 'image',
                args: {},
              },
            ],
          },
        },
      ],
    });

    expect(result.warnings).toContainEqual({
      requestId: 'image',
      warning: {
        type: 'unsupported',
        feature: 'batch result conversion for tool "image"',
        details:
          'OpenAI may return output for this tool that AI SDK text batches cannot currently convert.',
      },
    });
  });

  it('appends an explicit compaction trigger to batch request input', async () => {
    prepareCreateResponse();
    const model = createOpenAI({
      apiKey: 'test-api-key',
    }).responses('gpt-5.6');

    await model.experimental_doStartBatch({
      requests: [
        {
          id: 'compact',
          options: {
            prompt: [
              {
                role: 'user',
                content: [{ type: 'text', text: 'Compact this context.' }],
              },
            ],
            providerOptions: {
              openai: {
                compactionTrigger: true,
              },
            },
          },
        },
      ],
    });

    const multipart = await server.calls[0].requestBodyMultipart;
    const file = multipart?.file as File;
    const line = JSON.parse((await file.text()).trim());

    expect(line.body.input).toEqual([
      {
        role: 'user',
        content: [{ type: 'input_text', text: 'Compact this context.' }],
      },
      { type: 'compaction_trigger' },
    ]);
  });

  it('forwards the abort signal to file upload and batch creation', async () => {
    prepareCreateResponse();
    const mockFetch = vi.fn().mockImplementation(globalThis.fetch);
    const abortController = new AbortController();
    const model = createOpenAI({
      apiKey: 'test-api-key',
      fetch: mockFetch,
    })('gpt-5.6');

    await model.experimental_doStartBatch({
      requests: [
        { id: 'france', ...request('What is the capital of France?') },
      ],
      abortSignal: abortController.signal,
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][1].signal).toBe(abortController.signal);
    expect(mockFetch.mock.calls[1][1].signal).toBe(abortController.signal);
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
    const model = createOpenAI({ apiKey: 'test-api-key' })('gpt-5.6');

    await expect(
      model.experimental_doGetBatchStatus({ batchId: 'batch_123' }),
    ).resolves.toMatchObject({ status, rawStatus });
  });

  it('normalizes status counts, timestamps, and batch errors', async () => {
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
    const model = createOpenAI({ apiKey: 'test-api-key' })('gpt-5.6');

    await expect(
      model.experimental_doGetBatchStatus({ batchId: 'batch_123' }),
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
  });

  it('accepts incomplete batch error details', async () => {
    server.urls[urls.batch].response = {
      type: 'json-value',
      body: batchResponse({
        status: 'failed',
        errors: { data: [{ code: 'invalid_request' }] },
      }),
    };
    const model = createOpenAI({ apiKey: 'test-api-key' })('gpt-5.6');

    await expect(
      model.experimental_doGetBatchStatus({ batchId: 'batch_123' }),
    ).resolves.toMatchObject({
      status: 'failed',
      error: {
        code: 'invalid_request',
        message: 'OpenAI batch failed.',
      },
    });
  });

  it('incrementally parses Responses results across chunk boundaries', async () => {
    server.urls[urls.batch].response = {
      type: 'json-value',
      body: batchResponse({ output_file_id: 'file-output' }),
    };
    const first = resultLine({
      id: 'france',
      body: responsesResultBody('Paris'),
    });
    const second = resultLine({
      id: 'germany',
      body: responsesResultBody('Berlin'),
    });
    server.urls[urls.output].response = {
      type: 'stream-chunks',
      headers: { 'Content-Type': 'application/jsonl' },
      chunks: [
        first.slice(0, 19),
        `${first.slice(19)}\r`,
        `\n${second.slice(0, 31)}`,
        second.slice(31),
      ],
    };
    const model = createOpenAI({ apiKey: 'test-api-key' })('gpt-5.6');

    const stream = await model.experimental_doGetBatchResults({
      batchId: 'batch_123',
    });
    const results = await convertReadableStreamToArray(stream);

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      id: 'france',
      status: 'succeeded',
      result: {
        content: [{ type: 'text', text: 'Paris' }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: {
          inputTokens: { total: 10, noCache: 8, cacheRead: 2 },
          outputTokens: { total: 3, text: 2, reasoning: 1 },
        },
        response: {
          id: 'resp_123',
          timestamp: new Date('2023-11-14T22:13:20.000Z'),
          modelId: 'gpt-5.6',
        },
        providerMetadata: {
          openai: { responseId: 'resp_123', serviceTier: 'default' },
        },
      },
    });
    expect(results[1]).toMatchObject({
      id: 'germany',
      status: 'succeeded',
      result: { content: [{ type: 'text', text: 'Berlin' }] },
    });
    expect(server.calls.map(call => call.requestUrl)).toEqual([
      urls.batch,
      urls.output,
    ]);
  });

  it('preserves reasoning output and its provider metadata', async () => {
    server.urls[urls.batch].response = {
      type: 'json-value',
      body: batchResponse({ output_file_id: 'file-output' }),
    };
    server.urls[urls.output].response = {
      type: 'stream-chunks',
      chunks: [
        resultLine({
          id: 'reasoning',
          body: {
            ...responsesResultBody('Paris'),
            output: [
              {
                type: 'reasoning',
                id: 'reasoning-123',
                encrypted_content: 'encrypted-reasoning',
                summary: [
                  { type: 'summary_text', text: 'I should answer directly.' },
                ],
              },
              ...responsesResultBody('Paris').output,
            ],
          },
        }),
      ],
    };
    const model = createOpenAI({ apiKey: 'test-api-key' })('gpt-5.6');

    const stream = await model.experimental_doGetBatchResults({
      batchId: 'batch_123',
    });

    await expect(convertReadableStreamToArray(stream)).resolves.toMatchObject([
      {
        id: 'reasoning',
        status: 'succeeded',
        result: {
          content: [
            {
              type: 'reasoning',
              text: 'I should answer directly.',
              providerMetadata: {
                openai: {
                  itemId: 'reasoning-123',
                  reasoningEncryptedContent: 'encrypted-reasoning',
                },
              },
            },
            { type: 'text', text: 'Paris' },
          ],
        },
      },
    ]);
  });

  it('forwards the abort signal when retrieving results', async () => {
    server.urls[urls.batch].response = {
      type: 'json-value',
      body: batchResponse({ output_file_id: 'file-output' }),
    };
    server.urls[urls.output].response = {
      type: 'stream-chunks',
      chunks: [
        resultLine({
          id: 'france',
          body: responsesResultBody('Paris'),
        }),
      ],
    };
    const mockFetch = vi.fn().mockImplementation(globalThis.fetch);
    const abortController = new AbortController();
    const model = createOpenAI({
      apiKey: 'test-api-key',
      fetch: mockFetch,
    })('gpt-5.6');

    const stream = await model.experimental_doGetBatchResults({
      batchId: 'batch_123',
      abortSignal: abortController.signal,
    });
    await convertReadableStreamToArray(stream);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][1].signal).toBe(abortController.signal);
    expect(mockFetch.mock.calls[1][1].signal).toBe(abortController.signal);
  });

  it('errors the result stream when a JSONL line is malformed', async () => {
    server.urls[urls.batch].response = {
      type: 'json-value',
      body: batchResponse({ output_file_id: 'file-output' }),
    };
    server.urls[urls.output].response = {
      type: 'stream-chunks',
      chunks: [
        `${resultLine({
          id: 'france',
          body: responsesResultBody('Paris'),
        })}\n`,
        '{not json}\n',
      ],
    };
    const model = createOpenAI({ apiKey: 'test-api-key' })('gpt-5.6');

    const stream = await model.experimental_doGetBatchResults({
      batchId: 'batch_123',
    });
    const reader = stream.getReader();

    await expect(reader.read()).resolves.toMatchObject({
      done: false,
      value: { id: 'france', status: 'succeeded' },
    });
    await expect(reader.read()).rejects.toThrow(JSONParseError);
  });

  it('streams output and error files after retrieving fresh batch metadata', async () => {
    server.urls[urls.batch].response = {
      type: 'json-value',
      body: batchResponse({
        output_file_id: 'file-output',
        error_file_id: 'file-errors',
      }),
    };
    server.urls[urls.output].response = {
      type: 'stream-chunks',
      chunks: [
        JSON.stringify({
          custom_id: 'http-error',
          response: {
            status_code: 400,
            request_id: 'request-error',
            body: {
              error: {
                message: 'Invalid request.',
                type: 'invalid_request_error',
                param: null,
                code: 'invalid_request',
              },
            },
          },
          error: null,
        }),
      ],
    };
    server.urls[urls.errors].response = {
      type: 'stream-chunks',
      chunks: [
        `${JSON.stringify({
          custom_id: 'cancelled',
          response: null,
          error: { code: 'batch_cancelled', message: 'Batch cancelled.' },
        })}\n`,
        `${JSON.stringify({
          custom_id: 'expired',
          response: null,
          error: { code: 'batch_expired', message: 'Batch expired.' },
        })}\n`,
        JSON.stringify({
          custom_id: 'failed',
          response: null,
          error: { code: 'request_timeout', message: 'Request timed out.' },
        }),
      ],
    };
    const model = createOpenAI({ apiKey: 'test-api-key' })('gpt-5.6');

    await model.experimental_doGetBatchStatus({ batchId: 'batch_123' });
    const stream = await model.experimental_doGetBatchResults({
      batchId: 'batch_123',
    });
    const results = await convertReadableStreamToArray(stream);

    expect(results).toEqual([
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
      {
        id: 'failed',
        status: 'failed',
        error: { message: 'Request timed out.', code: 'request_timeout' },
      },
    ]);
    expect(server.calls.map(call => call.requestUrl)).toEqual([
      urls.batch,
      urls.batch,
      urls.output,
      urls.errors,
    ]);
  });

  it('only exposes batch support on OpenAI Responses models', () => {
    const provider = createOpenAI({ apiKey: 'test-api-key' });

    for (const model of [provider('gpt-5.6'), provider.responses('gpt-5.6')]) {
      expect(model.experimental_doStartBatch).toBeTypeOf('function');
      expect(model.experimental_doGetBatchStatus).toBeTypeOf('function');
      expect(model.experimental_doGetBatchResults).toBeTypeOf('function');
    }

    expect(
      (provider.chat('gpt-5.6') as any).experimental_doStartBatch,
    ).toBeUndefined();
    expect(
      (provider.completion('gpt-3.5-turbo-instruct') as any)
        .experimental_doStartBatch,
    ).toBeUndefined();
    expect(
      (new OpenAIResponsesLanguageModel('gpt-5.6', config) as any)
        .experimental_doStartBatch,
    ).toBeUndefined();
    expect(
      (
        new OpenAIChatLanguageModel('gpt-5.6', {
          ...config,
          provider: 'openai.chat',
        }) as any
      ).experimental_doStartBatch,
    ).toBeUndefined();
  });

  it('preserves Responses config and batch support across a workflow round trip', async () => {
    server.urls[urls.responses].response = {
      type: 'json-value',
      body: responsesResultBody('Paris'),
    };
    const model = createOpenAI({ apiKey: 'test-api-key' })(
      'gpt-5.6',
    ) as OpenAIResponsesBatchLanguageModel;
    const serialized =
      OpenAIResponsesBatchLanguageModel[WORKFLOW_SERIALIZE](model);
    const responsesModel =
      OpenAIResponsesBatchLanguageModel[WORKFLOW_DESERIALIZE](serialized);

    expect(responsesModel.experimental_doStartBatch).toBeTypeOf('function');
    await expect(
      responsesModel.doGenerate(
        request('What is the capital of France?').options,
      ),
    ).resolves.toMatchObject({
      content: [{ type: 'text', text: 'Paris' }],
    });
    expect(server.calls[0].requestHeaders.authorization).toBe(
      'Bearer test-api-key',
    );
  });

  describe('batch result lifecycle', () => {
    it('rejects result retrieval while the batch is pending', async () => {
      server.urls[urls.batch].response = {
        type: 'json-value',
        body: batchResponse({
          status: 'in_progress',
          request_counts: { total: 2, completed: 1, failed: 0 },
        }),
      };
      const model = createOpenAI({ apiKey: 'test-api-key' })('gpt-5.6');

      await expect(
        model.experimental_doGetBatchResults({ batchId: 'batch_123' }),
      ).rejects.toMatchObject({
        name: 'AI_InvalidArgumentError',
        argument: 'batchId',
        message: 'OpenAI batch "batch_123" is not complete.',
      });
    });

    it('fails an invalid item and continues with later results', async () => {
      server.urls[urls.batch].response = {
        type: 'json-value',
        body: batchResponse({ output_file_id: 'file-output' }),
      };
      server.urls[urls.output].response = {
        type: 'stream-chunks',
        chunks: [
          `${resultLine({ id: 'invalid', body: { output: 42 } })}\n`,
          resultLine({ id: 'valid', body: responsesResultBody('Paris') }),
        ],
      };
      const model = createOpenAI({ apiKey: 'test-api-key' })('gpt-5.6');

      const stream = await model.experimental_doGetBatchResults({
        batchId: 'batch_123',
      });
      const results = await convertReadableStreamToArray(stream);

      expect(results).toHaveLength(2);
      expect(results).toMatchObject([
        {
          id: 'invalid',
          status: 'failed',
          error: {
            message: 'OpenAI returned an invalid Responses batch result.',
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

    it('rejects a completed batch without output', async () => {
      server.urls[urls.batch].response = {
        type: 'json-value',
        body: batchResponse(),
      };
      const model = createOpenAI({ apiKey: 'test-api-key' })('gpt-5.6');

      await expect(
        model.experimental_doGetBatchResults({ batchId: 'batch_123' }),
      ).rejects.toMatchObject({
        name: 'AI_InvalidResponseDataError',
        message: 'OpenAI batch "batch_123" completed without batch output.',
      });
    });

    it('preserves tool calls and fails unsupported items without stopping later results', async () => {
      server.urls[urls.batch].response = {
        type: 'json-value',
        body: batchResponse({
          output_file_id: 'file-output',
          request_counts: { total: 6, completed: 6, failed: 0 },
        }),
      };
      server.urls[urls.output].response = {
        type: 'stream-chunks',
        chunks: [
          `${resultLine({
            id: 'function-call',
            body: {
              ...responsesResultBody(''),
              output: [
                {
                  type: 'function_call',
                  id: 'function-call',
                  call_id: 'call-123',
                  name: 'get_weather',
                  arguments: '{"city":"Paris"}',
                  namespace: null,
                  caller: null,
                },
              ],
            },
          })}\n`,
          `${resultLine({
            id: 'custom-tool-call',
            body: {
              ...responsesResultBody(''),
              output: [
                {
                  type: 'custom_tool_call',
                  id: 'custom-tool-call',
                  call_id: 'call-123',
                  name: 'shell',
                  input: 'echo Paris',
                },
              ],
            },
          })}\n`,
          `${resultLine({
            id: 'web-search',
            body: {
              ...responsesResultBody(''),
              output: [
                {
                  type: 'web_search_call',
                  id: 'web-search',
                  status: 'completed',
                  action: { type: 'search', query: 'weather in Paris' },
                },
              ],
            },
          })}\n`,
          `${resultLine({
            id: 'file-search',
            body: {
              ...responsesResultBody(''),
              output: [
                {
                  type: 'file_search_call',
                  id: 'file-search',
                  queries: ['weather in Paris'],
                  results: [
                    {
                      attributes: { country: 'France' },
                      file_id: 'file_123',
                      filename: 'weather.md',
                      score: 0.9,
                      text: 'Paris is sunny.',
                    },
                  ],
                },
              ],
            },
          })}\n`,
          `${resultLine({
            id: 'image',
            body: {
              ...responsesResultBody(''),
              output: [
                {
                  type: 'image_generation_call',
                  id: 'image-123',
                  result: 'aW1hZ2U=',
                },
              ],
            },
          })}\n`,
          resultLine({ id: 'valid', body: responsesResultBody('Paris') }),
        ],
      };
      const model = createOpenAI({ apiKey: 'test-api-key' })('gpt-5.6');

      const stream = await model.experimental_doGetBatchResults({
        batchId: 'batch_123',
      });
      const results = await convertReadableStreamToArray(stream);

      expect(results).toHaveLength(6);
      expect(results).toMatchObject([
        {
          id: 'function-call',
          status: 'succeeded',
          result: {
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call-123',
                toolName: 'get_weather',
                input: '{"city":"Paris"}',
                providerMetadata: { openai: { itemId: 'function-call' } },
              },
            ],
          },
        },
        {
          id: 'custom-tool-call',
          status: 'succeeded',
          result: {
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call-123',
                toolName: 'shell',
                input: '"echo Paris"',
                providerMetadata: { openai: { itemId: 'custom-tool-call' } },
              },
            ],
          },
        },
        {
          id: 'web-search',
          status: 'succeeded',
          result: {
            content: [
              {
                type: 'tool-call',
                toolCallId: 'web-search',
                toolName: 'web_search',
                input: '{}',
                providerExecuted: true,
                dynamic: true,
              },
              {
                type: 'tool-result',
                toolCallId: 'web-search',
                toolName: 'web_search',
                result: {
                  action: { type: 'search', query: 'weather in Paris' },
                },
                dynamic: true,
              },
            ],
          },
        },
        {
          id: 'file-search',
          status: 'succeeded',
          result: {
            content: [
              {
                type: 'tool-call',
                toolCallId: 'file-search',
                toolName: 'file_search',
                input: '{}',
                providerExecuted: true,
                dynamic: true,
              },
              {
                type: 'tool-result',
                toolCallId: 'file-search',
                toolName: 'file_search',
                result: {
                  queries: ['weather in Paris'],
                  results: [
                    {
                      attributes: { country: 'France' },
                      fileId: 'file_123',
                      filename: 'weather.md',
                      score: 0.9,
                      text: 'Paris is sunny.',
                    },
                  ],
                },
                dynamic: true,
              },
            ],
          },
        },
        {
          id: 'image',
          status: 'failed',
          error: {
            message:
              'OpenAI returned an unsupported "image_generation_call" output item in an AI SDK text batch.',
            code: 'unsupported_content',
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
