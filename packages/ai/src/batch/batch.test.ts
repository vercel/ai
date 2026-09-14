import {
  UnsupportedFunctionalityError,
  type Experimental_BatchV4 as BatchV4,
  type Experimental_BatchV4OperationOptions as BatchV4OperationOptions,
  type LanguageModelV4GenerateResult,
  type LanguageModelV4Usage,
} from '@ai-sdk/provider';
import { jsonSchema } from '@ai-sdk/provider-utils';
import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { describe, expect, it, vi } from 'vitest';
import { InvalidArgumentError } from '../error/invalid-argument-error';
import { MockProviderV4 } from '../test/mock-provider-v4';
import {
  cancelBatch,
  getBatchResults,
  getBatchStatus,
  listBatches,
  startBatch,
} from './batch';
import type { BatchReference } from './batch-types';

type MockBatchModelIds = {
  text: string;
  image: string;
};

vi.mock('../version', () => ({ VERSION: '0.0.0-test' }));

const testUsage: LanguageModelV4Usage = {
  inputTokens: {
    total: 3,
    noCache: 2,
    cacheRead: 1,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 5,
    text: 4,
    reasoning: 1,
  },
};

const batchReference: BatchReference = {
  version: 2,
  id: 'batch-123',
  provider: 'mock-provider',
};

function createMockBatchApi({
  doStartBatch = async () => ({
    batchId: 'batch-123',
    status: 'pending' as const,
    warnings: [],
  }),
  doGetBatchStatus = async () => ({ status: 'pending' as const }),
  doGetBatchResults = async () => convertArrayToReadableStream([]),
  doCancelBatch,
  doListBatches,
}: {
  doStartBatch?: BatchV4<MockBatchModelIds>['doStartBatch'];
  doGetBatchStatus?: BatchV4<MockBatchModelIds>['doGetBatchStatus'];
  doGetBatchResults?: BatchV4<MockBatchModelIds>['doGetBatchResults'];
  doCancelBatch?: BatchV4<MockBatchModelIds>['doCancelBatch'];
  doListBatches?: BatchV4<MockBatchModelIds>['doListBatches'];
} = {}): BatchV4<MockBatchModelIds> {
  return {
    specificationVersion: 'v4',
    provider: 'mock-provider',
    supportedUrls: {},
    doStartBatch: doStartBatch,
    doGetBatchStatus: doGetBatchStatus,
    doGetBatchResults: doGetBatchResults,
    doCancelBatch,
    doListBatches,
  };
}

describe('cancelBatch', () => {
  it('requests cancellation and returns provider metadata', async () => {
    const calls: BatchV4OperationOptions[] = [];
    const batchApi = createMockBatchApi({
      doCancelBatch: async options => {
        calls.push(options);
        return { providerMetadata: { mock: { cancellation: 'requested' } } };
      },
    });

    await expect(
      cancelBatch({ provider: batchApi, batch: batchReference }),
    ).resolves.toEqual({
      providerMetadata: { mock: { cancellation: 'requested' } },
    });
    expect(calls).toEqual([
      {
        batchId: 'batch-123',
        providerOptions: undefined,
        abortSignal: undefined,
        headers: { 'user-agent': 'ai/0.0.0-test' },
      },
    ]);
  });

  it('throws when cancellation is unsupported', async () => {
    await expect(
      cancelBatch({ provider: createMockBatchApi(), batch: batchReference }),
    ).rejects.toMatchObject({ functionality: 'batch cancellation' });
  });
});

describe('listBatches', () => {
  it('preserves the batch API as the method receiver', async () => {
    const batchApi = createMockBatchApi();
    batchApi.doListBatches = async function () {
      expect(this).toBe(batchApi);
      return { batches: [] };
    };

    await expect(
      listBatches({ provider: batchApi, maxRetries: 0 }),
    ).resolves.toEqual({ batches: [] });
  });

  it('returns normalized batch references and the next cursor', async () => {
    const batchApi = createMockBatchApi({
      doListBatches: async options => {
        expect(options).toEqual({
          providerOptions: undefined,
          abortSignal: undefined,
          headers: { 'user-agent': 'ai/0.0.0-test' },
          limit: 20,
          cursor: 'cursor-1',
        });
        return {
          batches: [
            {
              batchId: 'batch-456',
              status: 'completed',
              rawStatus: 'done',
            },
          ],
          nextCursor: 'cursor-2',
          providerMetadata: { mock: { page: 1 } },
        };
      },
    });

    await expect(
      listBatches({
        provider: batchApi,
        limit: 20,
        cursor: 'cursor-1',
        maxRetries: 0,
      }),
    ).resolves.toEqual({
      batches: [
        {
          version: 2,
          id: 'batch-456',
          provider: 'mock-provider',
          status: 'completed',
          rawStatus: 'done',
        },
      ],
      nextCursor: 'cursor-2',
      providerMetadata: { mock: { page: 1 } },
    });
  });

  it('throws when listing is unsupported', async () => {
    await expect(
      listBatches({ provider: createMockBatchApi() }),
    ).rejects.toMatchObject({ functionality: 'batch listing' });
  });
});

describe('startBatch', () => {
  it('rejects unsupported request types before starting a batch', async () => {
    const doStartBatch = vi.fn(createMockBatchApi().doStartBatch);
    const batchApi = createMockBatchApi({ doStartBatch });

    await expect(
      startBatch({
        provider: batchApi,
        requests: [
          {
            id: 'request-1',
            // @ts-expect-error intentionally testing an unknown future type
            type: 'audio',
            model: 'audio-model',
            prompt: 'Hello',
          },
        ],
      }),
    ).rejects.toMatchObject({
      name: 'AI_InvalidArgumentError',
      parameter: 'requests',
    });

    expect(doStartBatch).not.toHaveBeenCalled();
  });

  it('normalizes image requests before starting a batch', async () => {
    const doStartBatch = vi.fn(createMockBatchApi().doStartBatch);
    const batchApi = createMockBatchApi({ doStartBatch });

    await startBatch({
      provider: batchApi,
      requests: [
        {
          id: 'request-1',
          type: 'image',
          model: 'image-model',
          prompt: 'A red panda',
          n: 2,
          aspectRatio: '16:9',
        },
      ],
    });

    expect(doStartBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        requests: [
          {
            id: 'request-1',
            type: 'image',
            modelId: 'image-model',
            options: {
              prompt: 'A red panda',
              n: 2,
              size: undefined,
              aspectRatio: '16:9',
              seed: undefined,
              files: undefined,
              mask: undefined,
              providerOptions: {},
            },
          },
        ],
      }),
    );
  });

  it('uses the global default provider when provider is omitted', async () => {
    const calls: Array<Parameters<BatchV4['doStartBatch']>[0]> = [];
    const batchApi = createMockBatchApi({
      doStartBatch: async options => {
        calls.push(options);
        return { batchId: 'batch-123', status: 'pending', warnings: [] };
      },
    });
    globalThis.AI_SDK_DEFAULT_PROVIDER = Object.assign(new MockProviderV4(), {
      experimental_batch: () => batchApi,
    });

    try {
      await startBatch({
        requests: [
          {
            id: 'request-1',
            type: 'text',
            model: 'anthropic/claude-sonnet-5',
            prompt: 'hello',
          },
        ],
      });
    } finally {
      delete globalThis.AI_SDK_DEFAULT_PROVIDER;
    }

    expect(calls[0]).toMatchObject({
      requests: [
        {
          id: 'request-1',
          type: 'text',
          modelId: 'anthropic/claude-sonnet-5',
        },
      ],
    });
  });

  it('resolves the batch service from a provider', async () => {
    const calls: Array<Parameters<BatchV4['doStartBatch']>[0]> = [];
    const batchApi = createMockBatchApi({
      doStartBatch: async options => {
        calls.push(options);
        return { batchId: 'batch-123', status: 'pending', warnings: [] };
      },
    });
    const provider = Object.assign(new MockProviderV4(), {
      experimental_batch: () => batchApi,
    });

    await startBatch({
      provider,
      requests: [
        {
          id: 'request-1',
          type: 'text',
          model: 'default-model-id',
          prompt: 'hello',
        },
      ],
    });

    expect(calls[0]).toMatchObject({
      requests: [
        { id: 'request-1', type: 'text', modelId: 'default-model-id' },
      ],
    });
  });

  it('normalizes requests and returns the acknowledged batch', async () => {
    const calls: Array<Parameters<BatchV4['doStartBatch']>[0]> = [];
    const batchApi = createMockBatchApi({
      doStartBatch: async options => {
        calls.push(options);
        return {
          batchId: 'batch-456',
          status: 'pending',
          rawStatus: 'validating',
          requestCounts: { total: 1, pending: 1, completed: 0, failed: 0 },
          createdAt: '2026-08-03T12:00:00.000Z',
          warnings: [],
        };
      },
    });

    const result = await startBatch({
      provider: batchApi,
      requests: [
        {
          id: 'request-1',
          type: 'text',
          model: 'request-model-id',
          prompt: 'What is the capital of France?',
          maxOutputTokens: 100,
          temperature: 0,
          topP: 0.9,
          topK: 10,
          presencePenalty: 0.1,
          frequencyPenalty: 0.2,
          stopSequences: ['STOP'],
          seed: 42,
          reasoning: 'low',
          providerOptions: { mock: { perRequest: true } },
        },
      ],
      providerOptions: { mock: { batch: true } },
      headers: { 'x-test': 'test-value' },
    });

    expect(result).toEqual({
      version: 2,
      id: 'batch-456',
      provider: 'mock-provider',
      status: 'pending',
      rawStatus: 'validating',
      requestCounts: { total: 1, pending: 1, completed: 0, failed: 0 },
      createdAt: '2026-08-03T12:00:00.000Z',
      warnings: [],
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      requests: [
        {
          id: 'request-1',
          type: 'text',
          modelId: 'request-model-id',
          options: {
            prompt: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: 'What is the capital of France?' },
                ],
              },
            ],
            maxOutputTokens: 100,
            temperature: 0,
            topP: 0.9,
            topK: 10,
            presencePenalty: 0.1,
            frequencyPenalty: 0.2,
            stopSequences: ['STOP'],
            seed: 42,
            reasoning: 'low',
            providerOptions: { mock: { perRequest: true } },
          },
        },
      ],
      providerOptions: { mock: { batch: true } },
      headers: {
        'user-agent': 'ai/0.0.0-test',
        'x-test': 'test-value',
      },
    });
  });

  it('rejects empty and duplicate request IDs', async () => {
    const batchApi = createMockBatchApi();

    await expect(
      startBatch({
        provider: batchApi,
        requests: [],
      }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);

    await expect(
      startBatch({
        provider: batchApi,
        requests: [
          {
            id: 'duplicate',
            type: 'text',
            model: 'mock-model-id',
            prompt: 'one',
          },
          {
            id: 'duplicate',
            type: 'text',
            model: 'mock-model-id',
            prompt: 'two',
          },
        ],
      }),
    ).rejects.toThrow('request IDs must be unique');
  });

  it('rejects providers without batch support', async () => {
    await expect(
      startBatch({
        provider: new MockProviderV4(),
        requests: [
          {
            id: 'request-1',
            type: 'text',
            model: 'mock-model-id',
            prompt: 'hello',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(UnsupportedFunctionalityError);
  });

  it('forwards the webhook URL to the batch service', async () => {
    const calls: Array<Parameters<BatchV4['doStartBatch']>[0]> = [];
    const batchApi = createMockBatchApi({
      doStartBatch: async options => {
        calls.push(options);
        return { batchId: 'batch-123', status: 'pending', warnings: [] };
      },
    });

    const result = await startBatch({
      provider: batchApi,
      requests: [
        {
          id: 'request-1',
          type: 'text',
          model: 'mock-model-id',
          prompt: 'hello',
        },
      ],
      webhookUrl: 'https://example.com/batch-webhook',
    });

    expect(calls[0].webhookUrl).toBe('https://example.com/batch-webhook');
    expect(result.warnings).toEqual([]);
  });

  it('logs request warnings with the request model', async () => {
    const warningLogger = vi.fn();
    globalThis.AI_SDK_LOG_WARNINGS = warningLogger;
    const batchApi = createMockBatchApi({
      doStartBatch: async () => ({
        batchId: 'batch-123',
        status: 'pending',
        warnings: [
          {
            requestId: 'request-2',
            warning: { type: 'other', message: 'request warning' },
          },
        ],
      }),
    });

    try {
      await startBatch({
        provider: batchApi,
        requests: [
          {
            id: 'request-1',
            type: 'text',
            model: 'default-model',
            prompt: 'hello',
          },
          {
            id: 'request-2',
            type: 'text',
            model: 'override-model',
            prompt: 'hello',
          },
        ],
      });

      expect(warningLogger).toHaveBeenCalledWith({
        warnings: [{ type: 'other', message: 'request warning' }],
        provider: 'mock-provider',
        model: 'override-model',
      });
    } finally {
      delete globalThis.AI_SDK_LOG_WARNINGS;
    }
  });

  it('forwards definition-only tools without executing them', async () => {
    const execute = vi.fn(async () => ({ temperature: 20 }));
    const calls: Array<Parameters<BatchV4['doStartBatch']>[0]> = [];
    const batchApi = createMockBatchApi({
      doStartBatch: async options => {
        calls.push(options);
        return { batchId: 'batch-123', status: 'pending', warnings: [] };
      },
    });

    await startBatch({
      provider: batchApi,
      requests: [
        {
          id: 'request-1',
          type: 'text',
          model: 'mock-model-id',
          prompt: 'What is the weather in Paris?',
          tools: {
            weather: {
              description: 'Get the weather for a city.',
              inputSchema: jsonSchema({
                type: 'object',
                properties: { city: { type: 'string' } },
                required: ['city'],
                additionalProperties: false,
              }),
              execute,
            },
          },
          toolChoice: 'required',
        },
      ],
    });

    expect(execute).not.toHaveBeenCalled();
    expect(calls[0].requests[0].options).toMatchObject({
      tools: [
        {
          type: 'function',
          name: 'weather',
          description: 'Get the weather for a city.',
          inputSchema: {
            type: 'object',
            properties: { city: { type: 'string' } },
            required: ['city'],
            additionalProperties: false,
          },
        },
      ],
      toolChoice: { type: 'required' },
    });
  });

  it('rejects incompatible definitions for the same tool name', async () => {
    const batchApi = createMockBatchApi();

    await expect(
      startBatch({
        provider: batchApi,
        requests: [
          {
            id: 'request-1',
            type: 'text',
            model: 'mock-model-id',
            prompt: 'hello',
            tools: {
              lookup: {
                inputSchema: jsonSchema({ type: 'string' }),
              },
            },
          },
          {
            id: 'request-2',
            type: 'text',
            model: 'mock-model-id',
            prompt: 'hello',
            tools: {
              lookup: {
                inputSchema: jsonSchema({ type: 'number' }),
              },
            },
          },
        ],
      }),
    ).rejects.toThrow(
      'tool "lookup" must have the same definition in every batch request',
    );
  });
});

describe('getBatchStatus', () => {
  it('returns the latest status without the batch reference', async () => {
    const calls: BatchV4OperationOptions[] = [];
    const batchApi = createMockBatchApi({
      doGetBatchStatus: async options => {
        calls.push(options);
        return {
          status: 'completed',
          rawStatus: 'ended',
          requestCounts: { total: 2, pending: 0, completed: 1, failed: 1 },
        };
      },
    });

    const staleBatch = {
      ...batchReference,
      status: 'pending' as const,
      warnings: [
        { warning: { type: 'other' as const, message: 'old warning' } },
      ],
    };

    const result = await getBatchStatus({
      provider: batchApi,
      batch: staleBatch,
      maxRetries: 0,
    });

    expect(result).toEqual({
      status: 'completed',
      rawStatus: 'ended',
      requestCounts: { total: 2, pending: 0, completed: 1, failed: 1 },
    });
    expect(calls).toEqual([
      {
        batchId: 'batch-123',
        providerOptions: undefined,
        abortSignal: undefined,
        headers: { 'user-agent': 'ai/0.0.0-test' },
      },
    ]);
  });

  it('rejects an incompatible provider', async () => {
    const batchApi = createMockBatchApi();

    await expect(
      getBatchStatus({
        provider: batchApi,
        batch: { ...batchReference, provider: 'different-provider' },
      }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
  });

  it('rejects a version 1 batch reference', async () => {
    await expect(
      getBatchStatus({
        provider: createMockBatchApi(),
        batch: {
          ...batchReference,
          version: 1,
        } as unknown as BatchReference,
      }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
  });
});

describe('getBatchResults', () => {
  it('opens eagerly and streams normalized item results', async () => {
    let callCount = 0;
    const generateResult: LanguageModelV4GenerateResult = {
      content: [{ type: 'text', text: 'Paris' }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: testUsage,
      warnings: [],
      response: {
        id: 'response-1',
        timestamp: new Date('2026-08-03T12:00:00.000Z'),
        modelId: 'provider-model-id',
      },
      providerMetadata: { mock: { result: true } },
    };
    const batchApi = createMockBatchApi({
      doGetBatchResults: async () => {
        callCount++;
        return convertArrayToReadableStream([
          {
            type: 'text',
            id: 'request-1',
            status: 'succeeded',
            result: generateResult,
          },
          {
            type: 'text',
            id: 'request-2',
            status: 'failed',
            error: { message: 'request failed', code: 'bad_request' },
          },
        ]);
      },
    });

    const stream = getBatchResults({
      provider: batchApi,
      batch: batchReference,
      maxRetries: 0,
    });

    await vi.waitFor(() => expect(callCount).toBe(1));

    const items = [];
    for await (const item of stream) {
      items.push(item);
    }

    expect(items.every(item => item.type === 'text')).toBe(true);
    expect(items).toMatchObject([
      {
        type: 'text',
        content: [{ text: 'Paris', type: 'text' }],
        id: 'request-1',
        status: 'succeeded',
        text: 'Paris',
        finishReason: 'stop',
        rawFinishReason: 'stop',
        usage: {
          inputTokens: 3,
          outputTokens: 5,
          totalTokens: 8,
        },
        response: {
          id: 'response-1',
          timestamp: '2026-08-03T12:00:00.000Z',
          modelId: 'provider-model-id',
        },
        providerMetadata: { mock: { result: true } },
      },
      {
        type: 'text',
        id: 'request-2',
        status: 'failed',
        error: { message: 'request failed', code: 'bad_request' },
      },
    ]);
  });

  it('normalizes provider-executed tool content and preserves usage', async () => {
    const batchApi = createMockBatchApi({
      doGetBatchResults: async () =>
        convertArrayToReadableStream([
          {
            type: 'text',
            id: 'request-1',
            status: 'succeeded',
            result: {
              content: [
                {
                  type: 'tool-call',
                  toolCallId: 'call-1',
                  toolName: 'weather',
                  input: '{"city":"Paris"}',
                  providerExecuted: true,
                  dynamic: true,
                },
                {
                  type: 'tool-result',
                  toolCallId: 'call-1',
                  toolName: 'weather',
                  result: { temperature: 20 },
                  providerExecuted: true,
                  dynamic: true,
                },
              ],
              finishReason: { unified: 'tool-calls', raw: 'tool_use' },
              usage: testUsage,
              warnings: [],
              providerMetadata: { mock: { result: true } },
            },
          },
        ]),
    });

    const items = [];
    for await (const item of getBatchResults({
      provider: batchApi,
      batch: batchReference,
      maxRetries: 0,
    })) {
      items.push(item);
    }

    expect(items).toEqual([
      {
        type: 'text',
        content: [
          {
            dynamic: true,
            input: { city: 'Paris' },
            providerExecuted: true,
            providerMetadata: undefined,
            toolCallId: 'call-1',
            toolName: 'weather',
            type: 'tool-call',
          },
          {
            dynamic: true,
            input: { city: 'Paris' },
            output: { temperature: 20 },
            providerExecuted: true,
            toolCallId: 'call-1',
            toolName: 'weather',
            type: 'tool-result',
          },
        ],
        finishReason: 'tool-calls',
        id: 'request-1',
        providerMetadata: { mock: { result: true } },
        rawFinishReason: 'tool_use',
        status: 'succeeded',
        text: '',
        usage: {
          inputTokenDetails: {
            cacheReadTokens: 1,
            cacheWriteTokens: undefined,
            noCacheTokens: 2,
          },
          inputTokens: 3,
          outputTokenDetails: {
            reasoningTokens: 1,
            textTokens: 4,
          },
          outputTokens: 5,
          raw: undefined,
          totalTokens: 8,
        },
      },
    ]);
  });

  it('normalizes successful image results', async () => {
    const batchApi = createMockBatchApi({
      doGetBatchResults: async () =>
        convertArrayToReadableStream([
          {
            type: 'image',
            id: 'image-1',
            status: 'succeeded',
            result: {
              images: ['aGVsbG8='],
              warnings: [],
              response: {
                timestamp: new Date('2026-09-09T12:00:00.000Z'),
                modelId: 'image-model',
                headers: { 'x-request-id': 'request-1' },
              },
              providerMetadata: {
                mock: { images: [{ revisedPrompt: 'A vivid red panda' }] },
              },
              usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
            },
          },
        ]),
    });

    const items = [];
    for await (const item of getBatchResults({
      provider: batchApi,
      batch: batchReference,
      maxRetries: 0,
    })) {
      items.push(item);
    }

    expect(items[0]).toMatchObject({
      type: 'image',
      id: 'image-1',
      status: 'succeeded',
      warnings: [],
      response: {
        timestamp: new Date('2026-09-09T12:00:00.000Z'),
        modelId: 'image-model',
      },
      providerMetadata: {
        mock: { images: [{ revisedPrompt: 'A vivid red panda' }] },
      },
      usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
    });
    const item = items[0];
    if (item?.type !== 'image' || item.status !== 'succeeded') {
      throw new Error('Expected a successful image result.');
    }
    expect(item.images[0].base64).toBe('aGVsbG8=');
    expect(item.images[0].providerMetadata).toEqual({
      mock: { revisedPrompt: 'A vivid red panda' },
    });
  });

  it('normalizes client tool calls with their definitions without executing them', async () => {
    const execute = vi.fn(async () => ({ temperature: 20 }));
    const batchApi = createMockBatchApi({
      doGetBatchResults: async () =>
        convertArrayToReadableStream([
          {
            type: 'text',
            id: 'request-1',
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
              finishReason: { unified: 'tool-calls', raw: 'tool_use' },
              usage: testUsage,
              warnings: [],
            },
          },
        ]),
    });

    const items = [];
    for await (const item of getBatchResults({
      provider: batchApi,
      batch: batchReference,
      maxRetries: 0,
      tools: {
        weather: {
          inputSchema: jsonSchema({
            type: 'object',
            properties: { city: { type: 'string' } },
            required: ['city'],
            additionalProperties: false,
          }),
          execute,
        },
      },
    })) {
      items.push(item);
    }

    expect(execute).not.toHaveBeenCalled();
    expect(items).toMatchObject([
      {
        id: 'request-1',
        status: 'succeeded',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'weather',
            input: { city: 'Paris' },
          },
        ],
      },
    ]);
  });
});
