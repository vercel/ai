import {
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it, vi } from 'vitest';
import { GoogleBatchLanguageModel } from './google-batch';
import type { GoogleLanguageModelConfig } from './google-language-model';
import { createGoogle } from './google-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const urls = {
  uploadStart: 'https://generativelanguage.googleapis.com/upload/v1beta/files',
  uploadSession:
    'https://generativelanguage.googleapis.com/upload/v1beta/files/session-123',
  create:
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:batchGenerateContent',
  batch: 'https://generativelanguage.googleapis.com/v1beta/batches/batch-123',
  output:
    'https://generativelanguage.googleapis.com/download/v1beta/files/batch-output:download?alt=media',
} as const;

const server = createTestServer({
  [urls.uploadStart]: {},
  [urls.uploadSession]: {},
  [urls.create]: {},
  [urls.batch]: {},
  [urls.output]: {},
});

const config: GoogleLanguageModelConfig = {
  provider: 'google.generative-ai',
  baseURL: 'https://generativelanguage.googleapis.com/v1beta',
  headers: { 'x-goog-api-key': 'test-api-key' },
  generateId: () => 'test-id',
};

type BatchRequest = Parameters<
  GoogleBatchLanguageModel['experimental_doStartBatch']
>[0]['requests'][number];

function request(
  id: string,
  prompt: string,
  options: Omit<BatchRequest['options'], 'prompt'> = {},
): BatchRequest {
  return {
    id,
    options: {
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: prompt }],
        },
      ],
      ...options,
    },
  };
}

function operation(
  metadataOverrides: Record<string, unknown> = {},
  operationOverrides: Record<string, unknown> = {},
) {
  return {
    name: 'batches/batch-123',
    done: true,
    metadata: {
      name: 'batches/batch-123',
      model: 'models/gemini-2.5-flash',
      displayName: 'ai-sdk-batch-test-id',
      state: 'BATCH_STATE_SUCCEEDED',
      createTime: '2026-08-04T12:34:56.123Z',
      batchStats: {
        requestCount: '2',
        successfulRequestCount: '2',
        failedRequestCount: '0',
      },
      ...metadataOverrides,
    },
    ...operationOverrides,
  };
}

function prepareUpload() {
  server.urls[urls.uploadStart].response = {
    type: 'json-value',
    headers: { 'x-goog-upload-url': urls.uploadSession },
    body: {},
  };
  server.urls[urls.uploadSession].response = {
    type: 'json-value',
    body: {
      file: {
        name: 'files/batch-input',
        displayName: 'batch.jsonl',
        mimeType: 'application/jsonl',
        sizeBytes: '256',
        uri: 'https://generativelanguage.googleapis.com/v1beta/files/batch-input',
        state: 'ACTIVE',
        expirationTime: '2026-08-27T12:00:00Z',
      },
    },
  };
}

function googleResponse({ id, text }: { id: string; text: string }) {
  return {
    responseId: id,
    candidates: [
      {
        content: {
          role: 'model',
          parts: [{ text }],
        },
        finishReason: 'STOP',
        finishMessage: 'Generation completed.',
        safetyRatings: [
          {
            category: 'HARM_CATEGORY_HATE_SPEECH',
            probability: 'NEGLIGIBLE',
          },
        ],
        groundingMetadata: {
          webSearchQueries: ['capital of France'],
        },
      },
    ],
    promptFeedback: {
      safetyRatings: [
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          probability: 'NEGLIGIBLE',
        },
      ],
    },
    usageMetadata: {
      promptTokenCount: 10,
      candidatesTokenCount: 3,
      totalTokenCount: 14,
      cachedContentTokenCount: 2,
      thoughtsTokenCount: 1,
      serviceTier: 'priority',
    },
  };
}

function prepareOutput(lines: unknown[]) {
  server.urls[urls.batch].response = {
    type: 'json-value',
    body: operation({
      output: { responsesFile: 'files/batch-output' },
    }),
  };

  const encodedLines = lines.map(line => JSON.stringify(line));
  const body = encodedLines.join('\n');
  server.urls[urls.output].response = {
    type: 'stream-chunks',
    headers: { 'Content-Type': 'application/jsonl' },
    chunks: [body.slice(0, 17), body.slice(17, 61), body.slice(61)],
  };
}

describe('GoogleBatchLanguageModel', () => {
  it('starts a batch with inline requests when the creation body is under 20 MB', async () => {
    server.urls[urls.create].response = {
      type: 'json-value',
      body: operation(
        {
          state: 'BATCH_STATE_PENDING',
          batchStats: {
            requestCount: '1',
            successfulRequestCount: '0',
            failedRequestCount: '0',
            pendingRequestCount: '1',
          },
        },
        { done: false },
      ),
    };

    const mockFetch = vi.fn().mockImplementation(globalThis.fetch);
    const abortController = new AbortController();
    const model = createGoogle({
      apiKey: 'test-api-key',
      generateId: () => 'test-id',
      headers: { 'Provider-Header': 'provider' },
      fetch: mockFetch,
    })('gemini-2.5-flash');

    const result = await model.experimental_doStartBatch({
      requests: [
        {
          id: 'france',
          options: {
            prompt: [
              {
                role: 'system',
                content: 'Answer with only the city name.',
              },
              {
                role: 'user',
                content: [
                  { type: 'text', text: 'What is the capital of France?' },
                ],
              },
            ],
            maxOutputTokens: 20,
            temperature: 0.2,
            topP: 0.9,
            topK: 10,
            frequencyPenalty: 0.1,
            presencePenalty: 0.2,
            stopSequences: ['END'],
            seed: 42,
            providerOptions: {
              google: { sharedRequestType: 'flex' },
            },
          },
        },
      ],
      webhookUrl: 'https://example.com/google-batch-webhook',
      headers: { 'Operation-Header': 'operation' },
      abortSignal: abortController.signal,
    });

    expect(result.providerMetadata).toBeUndefined();
    expect(result).toMatchObject({
      batchId: 'batches/batch-123',
      status: 'pending',
      rawStatus: 'BATCH_STATE_PENDING',
      requestCounts: {
        total: 1,
        pending: 1,
        completed: 0,
        failed: 0,
      },
      createdAt: '2026-08-04T12:34:56.123Z',
      warnings: [
        {
          requestId: 'france',
          warning: {
            type: 'other',
            message: expect.stringContaining(
              "'sharedRequestType' and 'requestType' are Vertex AI options",
            ),
          },
        },
        {
          requestId: 'france',
          warning: {
            type: 'unsupported',
            feature: 'frequencyPenalty',
          },
        },
        {
          requestId: 'france',
          warning: {
            type: 'unsupported',
            feature: 'presencePenalty',
          },
        },
      ],
    });

    expect(server.calls.map(call => call.requestUrl)).toEqual([urls.create]);
    expect(server.calls[0].requestMethod).toBe('POST');
    expect(server.calls[0].requestHeaders).toMatchObject({
      'provider-header': 'provider',
      'operation-header': 'operation',
      'x-goog-api-key': 'test-api-key',
    });
    expect(await server.calls[0].requestBodyJson).toEqual({
      batch: {
        displayName: 'ai-sdk-batch-test-id',
        webhookConfig: {
          uris: ['https://example.com/google-batch-webhook'],
        },
        inputConfig: {
          requests: {
            requests: [
              {
                request: {
                  generationConfig: {
                    maxOutputTokens: 20,
                    temperature: 0.2,
                    topK: 10,
                    topP: 0.9,
                    stopSequences: ['END'],
                    seed: 42,
                  },
                  contents: [
                    {
                      role: 'user',
                      parts: [{ text: 'What is the capital of France?' }],
                    },
                  ],
                  systemInstruction: {
                    parts: [{ text: 'Answer with only the city name.' }],
                  },
                },
                metadata: { key: 'france' },
              },
            ],
          },
        },
      },
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][1]?.signal).toBe(abortController.signal);
  });

  it('uses a resumable file upload when the creation body reaches 20 MB', async () => {
    prepareUpload();
    server.urls[urls.create].response = {
      type: 'json-value',
      body: operation(),
    };

    const inlinedRequest = (id: string, prompt: string) => ({
      request: {
        generationConfig: {},
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
      },
      metadata: { key: id },
    });
    const inlineBody = (largePrompt: string) => ({
      batch: {
        displayName: 'ai-sdk-batch-test-id',
        webhookConfig: {
          uris: ['https://example.com/google-batch-webhook'],
        },
        inputConfig: {
          requests: {
            requests: [
              inlinedRequest('small-request', 'small'),
              inlinedRequest('large-request', largePrompt),
            ],
          },
        },
      },
    });
    const textEncoder = new TextEncoder();
    const emptyBodyBytes = textEncoder.encode(
      JSON.stringify(inlineBody('')),
    ).byteLength;
    const prompt = 'a'.repeat(20_000_000 - emptyBodyBytes);
    expect(
      textEncoder.encode(JSON.stringify(inlineBody(prompt))).byteLength,
    ).toBe(20_000_000);

    const mockFetch = vi.fn().mockImplementation(globalThis.fetch);
    const abortController = new AbortController();
    const model = createGoogle({
      apiKey: 'test-api-key',
      generateId: () => 'test-id',
      headers: { 'Provider-Header': 'provider' },
      fetch: mockFetch,
    })('gemini-2.5-flash');

    const result = await model.experimental_doStartBatch({
      requests: [
        request('small-request', 'small'),
        request('large-request', prompt),
      ],
      webhookUrl: 'https://example.com/google-batch-webhook',
      headers: { 'Operation-Header': 'operation' },
      abortSignal: abortController.signal,
    });

    expect(result.warnings).toEqual([]);
    expect(result.providerMetadata).toEqual({
      google: {
        inputFileId: 'files/batch-input',
        inputFileExpiresAt: '2026-08-27T12:00:00Z',
      },
    });

    expect(server.calls.map(call => call.requestUrl)).toEqual([
      urls.uploadStart,
      urls.uploadSession,
      urls.create,
    ]);
    expect(server.calls[0].requestHeaders).toMatchObject({
      'provider-header': 'provider',
      'operation-header': 'operation',
      'x-goog-api-key': 'test-api-key',
      'x-goog-upload-protocol': 'resumable',
      'x-goog-upload-command': 'start',
      'x-goog-upload-header-content-type': 'application/jsonl',
    });
    expect(server.calls[1].requestHeaders).toMatchObject({
      'x-goog-upload-command': 'upload, finalize',
      'x-goog-upload-offset': '0',
    });
    expect(server.calls[1].requestHeaders).not.toHaveProperty('x-goog-api-key');
    expect(server.calls[1].requestHeaders).not.toHaveProperty(
      'provider-header',
    );
    expect(server.calls[1].requestHeaders).not.toHaveProperty(
      'operation-header',
    );
    expect(await server.calls[2].requestBodyJson).toEqual({
      batch: {
        displayName: 'ai-sdk-batch-test-id',
        webhookConfig: {
          uris: ['https://example.com/google-batch-webhook'],
        },
        inputConfig: { fileName: 'files/batch-input' },
      },
    });
    expect(server.calls[2].requestHeaders).toMatchObject({
      'provider-header': 'provider',
      'operation-header': 'operation',
      'x-goog-api-key': 'test-api-key',
    });

    expect(mockFetch).toHaveBeenCalledTimes(3);
    const uploadBody = mockFetch.mock.calls[1][1]?.body;
    expect(uploadBody).toBeInstanceOf(Blob);
    if (!(uploadBody instanceof Blob)) {
      throw new Error('Expected the Google batch upload body to be a Blob.');
    }
    const uploadText = await uploadBody.text();
    expect(uploadText.startsWith('{"key":"small-request","request":')).toBe(
      true,
    );
    expect(uploadText).toContain('\n{"key":"large-request","request":');
    expect(uploadText.endsWith('\n')).toBe(true);
    for (const [, init] of mockFetch.mock.calls) {
      expect(init.signal).toBe(abortController.signal);
    }
  });

  it.each([
    ['JOB_STATE_PENDING', 'pending'],
    ['JOB_STATE_RUNNING', 'pending'],
    ['JOB_STATE_SUCCEEDED', 'completed'],
    ['JOB_STATE_FAILED', 'failed'],
    ['JOB_STATE_CANCELLED', 'failed'],
    ['JOB_STATE_EXPIRED', 'failed'],
    ['BATCH_STATE_SUCCEEDED', 'completed'],
  ] as const)('maps status %s to %s', async (rawStatus, status) => {
    server.urls[urls.batch].response = {
      type: 'json-value',
      body: operation({ state: rawStatus }),
    };
    const model = createGoogle({ apiKey: 'test-api-key' })('gemini-2.5-flash');

    await expect(
      model.experimental_doGetBatchStatus({
        batchId: 'batches/batch-123',
      }),
    ).resolves.toMatchObject({ status, rawStatus });
  });

  it.each([
    { done: false, error: undefined, status: 'pending' },
    { done: true, error: undefined, status: 'completed' },
    {
      done: true,
      error: { code: 13, message: 'The operation failed.' },
      status: 'failed',
    },
  ] as const)(
    'uses Operation.done and error when metadata has no state ($status)',
    async ({ done, error, status }) => {
      server.urls[urls.batch].response = {
        type: 'json-value',
        body: operation({ state: undefined }, { done, error }),
      };
      const model = createGoogle({ apiKey: 'test-api-key' })(
        'gemini-2.5-flash',
      );

      await expect(
        model.experimental_doGetBatchStatus({
          batchId: 'batches/batch-123',
        }),
      ).resolves.toMatchObject({ status });
    },
  );

  it('normalizes int64 counts, timestamps, and a top-level RPC error', async () => {
    server.urls[urls.batch].response = {
      type: 'json-value',
      body: operation(
        {
          state: 'BATCH_STATE_FAILED',
          batchStats: {
            requestCount: '7',
            successfulRequestCount: '2',
            failedRequestCount: '3',
            pendingRequestCount: '2',
          },
        },
        {
          error: {
            code: 3,
            message: 'The batch input was invalid.',
            details: [{ reason: 'INVALID_ARGUMENT' }],
          },
        },
      ),
    };
    const model = createGoogle({ apiKey: 'test-api-key' })('gemini-2.5-flash');

    await expect(
      model.experimental_doGetBatchStatus({
        batchId: 'batches/batch-123',
      }),
    ).resolves.toMatchObject({
      status: 'failed',
      rawStatus: 'BATCH_STATE_FAILED',
      requestCounts: {
        total: 7,
        pending: 2,
        completed: 2,
        failed: 3,
      },
      error: {
        message: 'The batch input was invalid.',
        code: '3',
      },
      createdAt: '2026-08-04T12:34:56.123Z',
    });
  });

  it.each([
    {
      name: 'all-failed batch with omitted zero counters',
      batchStats: {
        requestCount: '1',
        failedRequestCount: '1',
      },
      requestCounts: {
        total: 1,
        pending: 0,
        completed: 0,
        failed: 1,
      },
    },
    {
      name: 'running batch with omitted zero counters',
      batchStats: {
        requestCount: '2',
        pendingRequestCount: '2',
      },
      requestCounts: {
        total: 2,
        pending: 2,
        completed: 0,
        failed: 0,
      },
    },
  ])('normalizes $name', async ({ batchStats, requestCounts }) => {
    server.urls[urls.batch].response = {
      type: 'json-value',
      body: operation({ batchStats }),
    };
    const model = createGoogle({ apiKey: 'test-api-key' })('gemini-2.5-flash');

    await expect(
      model.experimental_doGetBatchStatus({
        batchId: 'batches/batch-123',
      }),
    ).resolves.toMatchObject({ requestCounts });
  });

  it('streams successful and failed results across JSONL chunk boundaries', async () => {
    const usageMetadata = {
      promptTokenCount: 10,
      candidatesTokenCount: 3,
      totalTokenCount: 14,
      cachedContentTokenCount: 2,
      thoughtsTokenCount: 1,
      serviceTier: 'priority',
    };
    prepareOutput([
      {
        key: 'france',
        response: googleResponse({ id: 'response-france', text: 'Paris' }),
      },
      {
        key: 'germany',
        error: {
          code: 3,
          message: 'The request was invalid.',
          details: [{ reason: 'INVALID_ARGUMENT' }],
        },
      },
    ]);
    const model = createGoogle({
      apiKey: 'test-api-key',
      generateId: () => 'test-id',
    })('gemini-2.5-flash');

    const stream = await model.experimental_doGetBatchResults({
      batchId: 'batches/batch-123',
    });
    const results = await convertReadableStreamToArray(stream);

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      id: 'france',
      status: 'succeeded',
      result: {
        content: [{ type: 'text', text: 'Paris' }],
        finishReason: { unified: 'stop', raw: 'STOP' },
        usage: {
          inputTokens: { total: 10, noCache: 8, cacheRead: 2 },
          outputTokens: { total: 4, text: 3, reasoning: 1 },
          raw: usageMetadata,
        },
        response: { id: 'response-france' },
        warnings: [],
        providerMetadata: {
          google: {
            promptFeedback: {
              safetyRatings: [
                {
                  category: 'HARM_CATEGORY_HATE_SPEECH',
                  probability: 'NEGLIGIBLE',
                },
              ],
            },
            groundingMetadata: {
              webSearchQueries: ['capital of France'],
            },
            safetyRatings: [
              {
                category: 'HARM_CATEGORY_HATE_SPEECH',
                probability: 'NEGLIGIBLE',
              },
            ],
            usageMetadata,
            finishMessage: 'Generation completed.',
            serviceTier: 'priority',
          },
        },
      },
    });
    expect(results[1]).toMatchObject({
      id: 'germany',
      status: 'failed',
      error: {
        message: 'The request was invalid.',
        code: '3',
      },
    });
    expect(server.calls.map(call => call.requestUrl)).toEqual([
      urls.batch,
      urls.output,
    ]);
  });

  it('reads inline results without downloading an output file', async () => {
    server.urls[urls.batch].response = {
      type: 'json-value',
      body: operation(
        { output: undefined },
        {
          response: {
            inlinedResponses: {
              inlinedResponses: [
                {
                  metadata: { key: 'france' },
                  response: googleResponse({
                    id: 'response-france',
                    text: 'Paris',
                  }),
                },
                {
                  metadata: { key: 'germany' },
                  error: {
                    code: 8,
                    message: 'Resource has been exhausted.',
                    status: 'RESOURCE_EXHAUSTED',
                  },
                },
              ],
            },
          },
        },
      ),
    };
    const model = createGoogle({ apiKey: 'test-api-key' })('gemini-2.5-flash');

    const stream = await model.experimental_doGetBatchResults({
      batchId: 'batches/batch-123',
    });

    await expect(convertReadableStreamToArray(stream)).resolves.toMatchObject([
      {
        id: 'france',
        status: 'succeeded',
        result: { content: [{ type: 'text', text: 'Paris' }] },
      },
      {
        id: 'germany',
        status: 'failed',
        error: {
          message: 'Resource has been exhausted.',
          type: 'RESOURCE_EXHAUSTED',
          code: '8',
        },
      },
    ]);
    expect(server.calls.map(call => call.requestUrl)).toEqual([urls.batch]);
  });

  it('maps numeric gRPC cancellation errors to cancelled results', async () => {
    prepareOutput([
      {
        key: 'cancelled-request',
        error: { code: 1, message: 'The request was cancelled.' },
      },
    ]);
    const model = createGoogle({ apiKey: 'test-api-key' })('gemini-2.5-flash');

    const stream = await model.experimental_doGetBatchResults({
      batchId: 'batches/batch-123',
    });

    await expect(convertReadableStreamToArray(stream)).resolves.toEqual([
      {
        id: 'cancelled-request',
        status: 'cancelled',
        error: {
          message: 'The request was cancelled.',
          code: '1',
        },
      },
    ]);
  });

  it.each([undefined, []])(
    'returns a failed item when a blocked response has candidates %j',
    async candidates => {
      prepareOutput([
        {
          key: 'blocked-request',
          response: {
            candidates,
            promptFeedback: {
              blockReason: 'SAFETY',
              safetyRatings: [
                {
                  category: 'HARM_CATEGORY_HATE_SPEECH',
                  probability: 'HIGH',
                },
              ],
            },
          },
        },
      ]);
      const model = createGoogle({ apiKey: 'test-api-key' })(
        'gemini-2.5-flash',
      );

      const stream = await model.experimental_doGetBatchResults({
        batchId: 'batches/batch-123',
      });

      await expect(convertReadableStreamToArray(stream)).resolves.toEqual([
        {
          id: 'blocked-request',
          status: 'failed',
          error: {
            message: 'Google blocked the batch request (SAFETY).',
            type: 'SAFETY',
            code: 'prompt_blocked',
          },
          providerMetadata: {
            google: {
              promptFeedback: { blockReason: 'SAFETY' },
            },
          },
        },
      ]);
    },
  );

  it('reads the output file from the operation response', async () => {
    server.urls[urls.batch].response = {
      type: 'json-value',
      body: operation(
        { output: undefined },
        { response: { responsesFile: 'files/batch-output' } },
      ),
    };
    server.urls[urls.output].response = {
      type: 'stream-chunks',
      chunks: [
        JSON.stringify({
          key: 'france',
          response: googleResponse({
            id: 'response-france',
            text: 'Paris',
          }),
        }),
      ],
    };
    const model = createGoogle({ apiKey: 'test-api-key' })('gemini-2.5-flash');

    const stream = await model.experimental_doGetBatchResults({
      batchId: 'batches/batch-123',
    });

    await expect(convertReadableStreamToArray(stream)).resolves.toMatchObject([
      {
        id: 'france',
        status: 'succeeded',
        result: { content: [{ type: 'text', text: 'Paris' }] },
      },
    ]);
  });

  it('encodes response file path segments in the download URL', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            operation({
              output: {
                responsesFile: 'files/batch-output?alt=json#fragment',
              },
            }),
          ),
          { headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            key: 'france',
            response: googleResponse({
              id: 'response-france',
              text: 'Paris',
            }),
          }),
        ),
      );
    const model = createGoogle({
      apiKey: 'test-api-key',
      fetch: mockFetch,
    })('gemini-2.5-flash');

    const stream = await model.experimental_doGetBatchResults({
      batchId: 'batches/batch-123',
    });

    await expect(convertReadableStreamToArray(stream)).resolves.toMatchObject([
      {
        id: 'france',
        status: 'succeeded',
      },
    ]);
    expect(mockFetch.mock.calls.map(call => call[0])).toEqual([
      urls.batch,
      'https://generativelanguage.googleapis.com/download/v1beta/files/batch-output%3Falt%3Djson%23fragment:download?alt=media',
    ]);
  });

  it('returns an empty stream for a failed batch without output', async () => {
    server.urls[urls.batch].response = {
      type: 'json-value',
      body: operation({
        state: 'BATCH_STATE_FAILED',
        output: undefined,
      }),
    };
    const model = createGoogle({ apiKey: 'test-api-key' })('gemini-2.5-flash');

    const stream = await model.experimental_doGetBatchResults({
      batchId: 'batches/batch-123',
    });

    await expect(convertReadableStreamToArray(stream)).resolves.toEqual([]);
    expect(server.calls.map(call => call.requestUrl)).toEqual([urls.batch]);
  });

  it('surfaces Google HTTP errors from status retrieval', async () => {
    server.urls[urls.batch].response = {
      type: 'error',
      status: 404,
      body: JSON.stringify({
        error: {
          code: 404,
          message: 'Batch not found.',
          status: 'NOT_FOUND',
        },
      }),
    };
    const model = createGoogle({ apiKey: 'test-api-key' })('gemini-2.5-flash');

    await expect(
      model.experimental_doGetBatchStatus({
        batchId: 'batches/batch-123',
      }),
    ).rejects.toMatchObject({
      name: 'AI_APICallError',
      message: 'Batch not found.',
      statusCode: 404,
      url: urls.batch,
    });
  });

  it('surfaces Google HTTP errors from starting a batch', async () => {
    server.urls[urls.create].response = {
      type: 'error',
      status: 400,
      body: JSON.stringify({
        error: {
          code: 400,
          message: 'The batch input was invalid.',
          status: 'INVALID_ARGUMENT',
        },
      }),
    };
    const model = createGoogle({ apiKey: 'test-api-key' })('gemini-2.5-flash');

    await expect(
      model.experimental_doStartBatch({
        requests: [request('france', 'What is the capital of France?')],
      }),
    ).rejects.toMatchObject({
      name: 'AI_APICallError',
      message: 'The batch input was invalid.',
      statusCode: 400,
      url: urls.create,
    });
  });

  it('preserves batch support and ID generation across a workflow round trip', async () => {
    server.urls[urls.create].response = {
      type: 'json-value',
      body: operation(),
    };
    const serialized = GoogleBatchLanguageModel[WORKFLOW_SERIALIZE](
      new GoogleBatchLanguageModel('gemini-2.5-flash', config),
    );
    expect(serialized.config).not.toHaveProperty('generateId');
    const model = GoogleBatchLanguageModel[WORKFLOW_DESERIALIZE](
      serialized as unknown as {
        modelId: string;
        config: GoogleLanguageModelConfig;
      },
    );

    expect(model.experimental_doStartBatch).toBeTypeOf('function');
    expect(model.experimental_doGetBatchStatus).toBeTypeOf('function');
    expect(model.experimental_doGetBatchResults).toBeTypeOf('function');

    await model.experimental_doStartBatch({
      requests: [request('france', 'What is the capital of France?')],
    });
    await expect(server.calls[0].requestBodyJson).resolves.toMatchObject({
      batch: {
        displayName: expect.stringMatching(/^ai-sdk-batch-/),
      },
    });
  });

  describe('batch result lifecycle', () => {
    it('rejects result retrieval while the batch is pending', async () => {
      server.urls[urls.batch].response = {
        type: 'json-value',
        body: operation(
          { state: 'BATCH_STATE_RUNNING', output: undefined },
          { done: false },
        ),
      };
      const model = createGoogle({ apiKey: 'test-api-key' })(
        'gemini-2.5-flash',
      );

      await expect(
        model.experimental_doGetBatchResults({
          batchId: 'batches/batch-123',
        }),
      ).rejects.toMatchObject({
        name: 'AI_InvalidArgumentError',
        argument: 'batchId',
        message: 'Google batch "batches/batch-123" is not complete.',
      });
    });

    it('fails an invalid item and continues with later results', async () => {
      prepareOutput([
        {
          key: 'invalid-request',
          response: {
            candidates: [
              {
                content: {
                  role: 'model',
                  parts: [{ text: 42 }],
                },
              },
            ],
          },
        },
        {
          key: 'valid-request',
          response: googleResponse({ id: 'response-valid', text: 'Paris' }),
        },
      ]);
      const model = createGoogle({ apiKey: 'test-api-key' })(
        'gemini-2.5-flash',
      );

      const stream = await model.experimental_doGetBatchResults({
        batchId: 'batches/batch-123',
      });
      const results = await convertReadableStreamToArray(stream);

      expect(results).toHaveLength(2);
      expect(results).toMatchObject([
        {
          id: 'invalid-request',
          status: 'failed',
          error: {
            message: 'Google returned an invalid GenerateContent batch result.',
            code: 'invalid_response',
          },
        },
        {
          id: 'valid-request',
          status: 'succeeded',
          result: { content: [{ type: 'text', text: 'Paris' }] },
        },
      ]);
    });

    it('rejects a completed batch without output', async () => {
      server.urls[urls.batch].response = {
        type: 'json-value',
        body: operation({ output: undefined }),
      };
      const model = createGoogle({ apiKey: 'test-api-key' })(
        'gemini-2.5-flash',
      );

      await expect(
        model.experimental_doGetBatchResults({
          batchId: 'batches/batch-123',
        }),
      ).rejects.toMatchObject({
        name: 'AI_InvalidResponseDataError',
        message:
          'Google batch "batches/batch-123" completed without batch output.',
      });
    });

    it('fails unsupported items and continues with later results', async () => {
      prepareOutput([
        {
          key: 'image-request',
          response: {
            candidates: [
              {
                content: {
                  role: 'model',
                  parts: [
                    { text: 'Generated image:' },
                    {
                      inlineData: {
                        mimeType: 'image/png',
                        data: 'aW1hZ2U=',
                      },
                    },
                  ],
                },
                finishReason: 'STOP',
              },
            ],
          },
        },
        {
          key: 'text-request',
          response: googleResponse({ id: 'response-text', text: 'Paris' }),
        },
        {
          key: 'tool-request',
          response: {
            ...googleResponse({ id: 'response-tool', text: '' }),
            candidates: [
              {
                content: {
                  role: 'model',
                  parts: [
                    {
                      functionCall: {
                        id: 'call-1',
                        name: 'weather',
                        args: { city: 'Paris' },
                      },
                    },
                  ],
                },
                finishReason: 'STOP',
              },
            ],
          },
        },
      ]);
      const model = createGoogle({ apiKey: 'test-api-key' })(
        'gemini-2.5-flash',
      );

      const stream = await model.experimental_doGetBatchResults({
        batchId: 'batches/batch-123',
      });
      const results = await convertReadableStreamToArray(stream);

      expect(results).toHaveLength(3);
      expect(results).toMatchObject([
        {
          id: 'image-request',
          status: 'failed',
          error: {
            message:
              'Google returned a "file" content block, but that content is not supported in AI SDK text batches.',
            code: 'unsupported_content',
          },
        },
        {
          id: 'text-request',
          status: 'succeeded',
          result: { content: [{ type: 'text', text: 'Paris' }] },
        },
        {
          id: 'tool-request',
          status: 'succeeded',
          result: {
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'weather',
                input: '{"city":"Paris"}',
              },
            ],
          },
        },
      ]);
    });
  });
});
