import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { GatewayBatchLanguageModel } from './gateway-language-model-batch';
import type { GatewayConfig } from './gateway-config';
import {
  GatewayInvalidRequestError,
  GatewayModelNotFoundError,
  GatewayNotFoundError,
} from './errors';
import { describe, it, expect, vi } from 'vitest';

const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const createTestModel = (
  config: Partial<
    GatewayConfig & { o11yHeaders?: Record<string, string> }
  > = {},
) => {
  return new GatewayBatchLanguageModel('test-model', {
    provider: 'test-provider',
    baseURL: 'https://api.test.com',
    headers: () => ({
      Authorization: 'Bearer test-token',
      'ai-gateway-auth-method': 'api-key',
    }),
    fetch: globalThis.fetch,
    o11yHeaders: config.o11yHeaders || {},
    ...config,
  });
};

describe('GatewayBatchLanguageModel', () => {
  const server = createTestServer({
    'https://api.test.com/batch/start': {},
    'https://api.test.com/batch/status': {},
    'https://api.test.com/batch/results': {},
  });

  const BATCH_PROMPT_REQUESTS = [
    { id: 'req-1', options: { prompt: TEST_PROMPT } },
    {
      id: 'req-2',
      options: { prompt: TEST_PROMPT, maxOutputTokens: 32, temperature: 0 },
    },
  ];

  function prepareBatchStartResponse(
    body: Record<string, unknown> = {
      batchId: 'job_123',
      status: 'pending',
      warnings: [],
    },
  ) {
    server.urls['https://api.test.com/batch/start'].response = {
      type: 'json-value',
      body,
    };
  }

  function prepareBatchStatusResponse(body: Record<string, unknown>) {
    server.urls['https://api.test.com/batch/status'].response = {
      type: 'json-value',
      body,
    };
  }

  function prepareBatchResultsResponse(chunks: string[]) {
    server.urls['https://api.test.com/batch/results'].response = {
      type: 'stream-chunks',
      headers: { 'Content-Type': 'application/x-ndjson' },
      chunks,
    };
  }

  describe('experimental_doStartBatch', () => {
    it('should send correct headers including the model id', async () => {
      prepareBatchStartResponse();

      await createTestModel({
        o11yHeaders: { 'ai-o11y-deployment-id': 'dpl_123' },
      }).experimental_doStartBatch({
        requests: BATCH_PROMPT_REQUESTS,
        headers: { 'Custom-Header': 'batch-value' },
      });

      expect(server.calls[0].requestHeaders).toMatchObject({
        authorization: 'Bearer test-token',
        'ai-gateway-auth-method': 'api-key',
        'ai-model-id': 'test-model',
        'ai-o11y-deployment-id': 'dpl_123',
        'custom-header': 'batch-value',
      });
      expect(server.calls[0].requestHeaders['idempotency-key']).toBeUndefined();
    });

    it('should send the model id, requests, and provider options in the body', async () => {
      prepareBatchStartResponse();

      await createTestModel().experimental_doStartBatch({
        requests: BATCH_PROMPT_REQUESTS,
        providerOptions: { gateway: { order: ['openai'] } },
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody).toEqual({
        modelId: 'test-model',
        requests: [
          { id: 'req-1', options: { prompt: TEST_PROMPT } },
          {
            id: 'req-2',
            options: {
              prompt: TEST_PROMPT,
              maxOutputTokens: 32,
              temperature: 0,
            },
          },
        ],
        providerOptions: { gateway: { order: ['openai'] } },
      });
    });

    it('should map the start response to a BatchV4StartResult', async () => {
      prepareBatchStartResponse({
        batchId: 'job_123',
        status: 'pending',
        rawStatus: 'validating',
        requestCounts: { total: 2, pending: 2, completed: 0, failed: 0 },
        warnings: [
          {
            requestId: 'req-1',
            warning: { type: 'other', message: 'a warning' },
          },
        ],
        providerMetadata: {
          gateway: { asyncJob: { jobId: 'job_123', status: 'queued' } },
        },
      });

      const result = await createTestModel().experimental_doStartBatch({
        requests: BATCH_PROMPT_REQUESTS,
      });

      expect(result).toEqual({
        batchId: 'job_123',
        status: 'pending',
        rawStatus: 'validating',
        requestCounts: { total: 2, pending: 2, completed: 0, failed: 0 },
        warnings: [
          {
            requestId: 'req-1',
            warning: { type: 'other', message: 'a warning' },
          },
        ],
        providerMetadata: {
          gateway: { asyncJob: { jobId: 'job_123', status: 'queued' } },
        },
      });
    });

    it('should send the idempotency-key header from providerOptions.gateway.idempotencyKey without forwarding it in the body', async () => {
      prepareBatchStartResponse();

      await createTestModel().experimental_doStartBatch({
        requests: BATCH_PROMPT_REQUESTS,
        providerOptions: { gateway: { idempotencyKey: 'idem-abc' } },
      });

      expect(server.calls[0].requestHeaders['idempotency-key']).toBe(
        'idem-abc',
      );
      // Transport metadata stays out of the payload the Gateway digests for
      // replay identity; an empty providerOptions is omitted entirely.
      expect(await server.calls[0].requestBodyJson).toEqual({
        modelId: 'test-model',
        requests: BATCH_PROMPT_REQUESTS,
      });
    });

    it('should keep other gateway provider options in the body while stripping the idempotency key', async () => {
      prepareBatchStartResponse();

      await createTestModel().experimental_doStartBatch({
        requests: BATCH_PROMPT_REQUESTS,
        providerOptions: {
          gateway: { idempotencyKey: 'idem-abc', order: ['openai'] },
        },
      });

      expect(server.calls[0].requestHeaders['idempotency-key']).toBe(
        'idem-abc',
      );
      expect((await server.calls[0].requestBodyJson).providerOptions).toEqual({
        gateway: { order: ['openai'] },
      });
    });

    it('should send webhookUrl as the top-level callbackUrl body field', async () => {
      prepareBatchStartResponse({
        batchId: 'batch_abc123',
        status: 'pending',
        warnings: [],
        providerMetadata: {
          gateway: {
            asyncJob: {
              jobId: 'batch_abc123',
              status: 'queued',
              webhookSigningSecret: 'whsec_test',
            },
          },
        },
      });

      const result = await createTestModel().experimental_doStartBatch({
        requests: BATCH_PROMPT_REQUESTS,
        webhookUrl: 'https://example.com/batch-webhook',
      });

      expect(await server.calls[0].requestBodyJson).toEqual({
        callbackUrl: 'https://example.com/batch-webhook',
        modelId: 'test-model',
        requests: BATCH_PROMPT_REQUESTS,
      });
      // The webhook signing secret rides back on providerMetadata.
      expect(result.providerMetadata).toEqual({
        gateway: {
          asyncJob: {
            jobId: 'batch_abc123',
            status: 'queued',
            webhookSigningSecret: 'whsec_test',
          },
        },
      });
    });

    it('should not send a callbackUrl body field when no webhookUrl is provided', async () => {
      prepareBatchStartResponse();

      await createTestModel().experimental_doStartBatch({
        requests: BATCH_PROMPT_REQUESTS,
      });

      expect(
        (await server.calls[0].requestBodyJson).callbackUrl,
      ).toBeUndefined();
    });

    it('should base64-encode Uint8Array file data in batch request prompts', async () => {
      prepareBatchStartResponse();
      const bytes = new Uint8Array([1, 2, 3, 4]);
      const expectedBase64 = Buffer.from(bytes).toString('base64');
      const prompt: LanguageModelV4Prompt = [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: { type: 'data', data: bytes },
              mediaType: 'image/png',
            },
          ],
        },
      ];

      await createTestModel().experimental_doStartBatch({
        requests: [{ id: 'req-1', options: { prompt } }],
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.requests[0].options.prompt[0].content[0].data).toEqual(
        {
          type: 'data',
          data: expectedBase64,
        },
      );
    });

    it('should pass abortSignal to fetch when provided', async () => {
      prepareBatchStartResponse();
      const mockFetch = vi.fn().mockImplementation(globalThis.fetch);
      const controller = new AbortController();

      await createTestModel({
        fetch: mockFetch,
      }).experimental_doStartBatch({
        requests: BATCH_PROMPT_REQUESTS,
        abortSignal: controller.signal,
      });

      expect(mockFetch.mock.calls[0][1].signal).toBe(controller.signal);
    });

    it('should preserve an AbortError instead of converting it to a retryable gateway error', async () => {
      const abortError = new DOMException(
        'The operation was aborted.',
        'AbortError',
      );
      const mockFetch = vi.fn().mockRejectedValue(abortError);

      // An aborted batch start may still have been accepted server-side;
      // surfacing a retryable 500 would invite a duplicate submission.
      await expect(
        createTestModel({
          fetch: mockFetch,
        }).experimental_doStartBatch({
          requests: BATCH_PROMPT_REQUESTS,
        }),
      ).rejects.toBe(abortError);
    });

    it('should convert HTTP errors via the gateway error path', async () => {
      server.urls['https://api.test.com/batch/start'].response = {
        type: 'error',
        status: 404,
        body: JSON.stringify({
          error: {
            message: 'Model xyz not found',
            type: 'model_not_found',
            param: { modelId: 'xyz' },
          },
        }),
      };

      try {
        await createTestModel().experimental_doStartBatch({
          requests: BATCH_PROMPT_REQUESTS,
        });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(GatewayModelNotFoundError.isInstance(error)).toBe(true);
        const modelError = error as GatewayModelNotFoundError;
        expect(modelError.message).toBe('Model xyz not found');
        expect(modelError.statusCode).toBe(404);
      }
    });
  });

  describe('experimental_doGetBatchStatus', () => {
    it('should post the batchId and map the status response', async () => {
      prepareBatchStatusResponse({
        batchId: 'job_123',
        status: 'completed',
        rawStatus: 'ended',
        requestCounts: { total: 2, pending: 0, completed: 2, failed: 0 },
        createdAt: '2026-08-18T00:00:00.000Z',
      });

      const status = await createTestModel().experimental_doGetBatchStatus({
        batchId: 'job_123',
      });

      expect(await server.calls[0].requestBodyJson).toEqual({
        batchId: 'job_123',
      });
      expect(server.calls[0].requestHeaders).toMatchObject({
        authorization: 'Bearer test-token',
        'ai-model-id': 'test-model',
      });
      expect(status).toEqual({
        status: 'completed',
        rawStatus: 'ended',
        requestCounts: { total: 2, pending: 0, completed: 2, failed: 0 },
        createdAt: '2026-08-18T00:00:00.000Z',
      });
    });

    it('should map a failed status with error details', async () => {
      prepareBatchStatusResponse({
        batchId: 'job_123',
        status: 'failed',
        error: {
          message: 'Batch failed.',
          type: 'batch_failed',
          statusCode: 502,
        },
      });

      const status = await createTestModel().experimental_doGetBatchStatus({
        batchId: 'job_123',
      });

      expect(status).toEqual({
        status: 'failed',
        error: {
          message: 'Batch failed.',
          type: 'batch_failed',
          statusCode: 502,
        },
      });
    });

    it('should omit partial request counts instead of fabricating zeros', async () => {
      prepareBatchStatusResponse({
        batchId: 'job_123',
        status: 'pending',
        requestCounts: { total: 2 },
      });

      const status = await createTestModel().experimental_doGetBatchStatus({
        batchId: 'job_123',
      });

      expect(status).toEqual({ status: 'pending' });
    });

    it('should map a 404 not_found response to GatewayNotFoundError', async () => {
      server.urls['https://api.test.com/batch/status'].response = {
        type: 'error',
        status: 404,
        body: JSON.stringify({
          error: { message: 'Async job not found.', type: 'not_found' },
        }),
      };

      try {
        await createTestModel().experimental_doGetBatchStatus({
          batchId: 'missing-job',
        });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(GatewayNotFoundError.isInstance(error)).toBe(true);
        const notFoundError = error as GatewayNotFoundError;
        expect(notFoundError.message).toBe('Async job not found.');
        expect(notFoundError.statusCode).toBe(404);
      }
    });

    it('should preserve an AbortError instead of converting it to a retryable gateway error', async () => {
      const abortError = new DOMException(
        'The operation was aborted.',
        'AbortError',
      );
      const mockFetch = vi.fn().mockRejectedValue(abortError);

      await expect(
        createTestModel({
          fetch: mockFetch,
        }).experimental_doGetBatchStatus({ batchId: 'job_123' }),
      ).rejects.toBe(abortError);
    });

    it('should pass abortSignal to fetch when provided', async () => {
      prepareBatchStatusResponse({ batchId: 'job_123', status: 'pending' });
      const mockFetch = vi.fn().mockImplementation(globalThis.fetch);
      const controller = new AbortController();

      await createTestModel({
        fetch: mockFetch,
      }).experimental_doGetBatchStatus({
        batchId: 'job_123',
        abortSignal: controller.signal,
      });

      expect(mockFetch.mock.calls[0][1].signal).toBe(controller.signal);
    });
  });

  describe('experimental_doGetBatchResults', () => {
    const succeededItem = {
      id: 'req-1',
      status: 'succeeded',
      result: {
        content: [{ type: 'text', text: 'pong 1' }],
        finishReason: { unified: 'stop' },
        response: {
          modelId: 'openai/gpt-5.6-luna',
          timestamp: '2026-08-18T00:00:00.000Z',
        },
        usage: {
          inputTokens: { total: 4, noCache: 4 },
          outputTokens: { total: 2, text: 2 },
        },
        warnings: [],
      },
    };
    // What the parsed stream yields: the wire's ISO timestamp revived to Date.
    const expectedSucceededItem = {
      ...succeededItem,
      result: {
        ...succeededItem.result,
        response: {
          ...succeededItem.result.response,
          timestamp: new Date('2026-08-18T00:00:00.000Z'),
        },
      },
    };
    const failedItem = {
      id: 'req-2',
      status: 'failed',
      error: { message: 'boom' },
    };
    const cancelledItem = { id: 'req-3', status: 'cancelled' };

    it('should revive response.timestamp into a Date on succeeded items', async () => {
      prepareBatchResultsResponse([`${JSON.stringify(succeededItem)}\n`]);

      const stream = await createTestModel().experimental_doGetBatchResults({
        batchId: 'job_123',
      });
      const [item] = await convertReadableStreamToArray(stream);

      if (item.status !== 'succeeded') {
        throw new Error(`expected succeeded, got ${item.status}`);
      }
      expect(item.result.response?.timestamp).toBeInstanceOf(Date);
      expect(item.result.response?.timestamp?.toISOString()).toBe(
        '2026-08-18T00:00:00.000Z',
      );
      // Nested V4 usage is the shape core dereferences
      // (`usage.inputTokens.total` / `usage.outputTokens.total`).
      expect(item.result.usage).toStrictEqual({
        inputTokens: { total: 4, noCache: 4 },
        outputTokens: { total: 2, text: 2 },
      });
    });

    it('should map a 404 not_found response to GatewayNotFoundError', async () => {
      server.urls['https://api.test.com/batch/results'].response = {
        type: 'error',
        status: 404,
        body: JSON.stringify({
          error: { message: 'Async job not found.', type: 'not_found' },
        }),
      };

      try {
        await createTestModel().experimental_doGetBatchResults({
          batchId: 'missing-job',
        });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(GatewayNotFoundError.isInstance(error)).toBe(true);
        const notFoundError = error as GatewayNotFoundError;
        expect(notFoundError.message).toBe('Async job not found.');
        expect(notFoundError.statusCode).toBe(404);
      }
    });

    it('should preserve an AbortError instead of converting it to a retryable gateway error', async () => {
      const abortError = new DOMException(
        'The operation was aborted.',
        'AbortError',
      );
      const mockFetch = vi.fn().mockRejectedValue(abortError);

      await expect(
        createTestModel({
          fetch: mockFetch,
        }).experimental_doGetBatchResults({ batchId: 'job_123' }),
      ).rejects.toBe(abortError);
    });

    it('should post the batchId with the correct headers', async () => {
      prepareBatchResultsResponse([`${JSON.stringify(succeededItem)}\n`]);

      const stream = await createTestModel().experimental_doGetBatchResults({
        batchId: 'job_123',
      });
      await convertReadableStreamToArray(stream);

      expect(await server.calls[0].requestBodyJson).toEqual({
        batchId: 'job_123',
      });
      expect(server.calls[0].requestHeaders).toMatchObject({
        authorization: 'Bearer test-token',
        'ai-model-id': 'test-model',
      });
    });

    it('should parse multi-line NDJSON results including lines split across chunks and a trailing line without a newline', async () => {
      const line1 = JSON.stringify(succeededItem);
      const line2 = JSON.stringify(failedItem);
      const line3 = JSON.stringify(cancelledItem);
      prepareBatchResultsResponse([
        // line 1 split across two chunks
        line1.slice(0, 25),
        `${line1.slice(25)}\n${line2.slice(0, 10)}`,
        // line 2 completes; line 3 has no trailing newline
        `${line2.slice(10)}\n${line3}`,
      ]);

      const stream = await createTestModel().experimental_doGetBatchResults({
        batchId: 'job_123',
      });
      const items = await convertReadableStreamToArray(stream);

      expect(items).toEqual([expectedSucceededItem, failedItem, cancelledItem]);
    });

    it('should skip empty lines', async () => {
      prepareBatchResultsResponse([
        `${JSON.stringify(succeededItem)}\n\n${JSON.stringify(failedItem)}\n`,
      ]);

      const stream = await createTestModel().experimental_doGetBatchResults({
        batchId: 'job_123',
      });
      const items = await convertReadableStreamToArray(stream);

      expect(items).toEqual([expectedSucceededItem, failedItem]);
    });

    it('should convert a 400 for a non-terminal batch via the gateway error path', async () => {
      server.urls['https://api.test.com/batch/results'].response = {
        type: 'error',
        status: 400,
        body: JSON.stringify({
          error: {
            message: 'The batch is not yet terminal.',
            type: 'invalid_request_error',
          },
        }),
      };

      try {
        await createTestModel().experimental_doGetBatchResults({
          batchId: 'job_123',
        });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(GatewayInvalidRequestError.isInstance(error)).toBe(true);
        const requestError = error as GatewayInvalidRequestError;
        expect(requestError.message).toBe('The batch is not yet terminal.');
        expect(requestError.statusCode).toBe(400);
      }
    });

    it('should pass abortSignal to fetch when provided', async () => {
      prepareBatchResultsResponse([`${JSON.stringify(succeededItem)}\n`]);
      const mockFetch = vi.fn().mockImplementation(globalThis.fetch);
      const controller = new AbortController();

      const stream = await createTestModel({
        fetch: mockFetch,
      }).experimental_doGetBatchResults({
        batchId: 'job_123',
        abortSignal: controller.signal,
      });
      await convertReadableStreamToArray(stream);

      expect(mockFetch.mock.calls[0][1].signal).toBe(controller.signal);
    });
  });

  it('should expose the three batch methods as functions (batch capability duck-type)', () => {
    const model = createTestModel();

    expect(typeof model.experimental_doStartBatch).toBe('function');
    expect(typeof model.experimental_doGetBatchStatus).toBe('function');
    expect(typeof model.experimental_doGetBatchResults).toBe('function');
  });
});
