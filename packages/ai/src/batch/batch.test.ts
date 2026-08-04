import {
  UnsupportedFunctionalityError,
  type Experimental_BatchLanguageModelV4 as BatchLanguageModelV4,
  type Experimental_BatchV4OperationOptions as BatchV4OperationOptions,
  type LanguageModelV4GenerateResult,
  type LanguageModelV4Usage,
} from '@ai-sdk/provider';
import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { describe, expect, it, vi } from 'vitest';
import { InvalidArgumentError } from '../error/invalid-argument-error';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { createTextBatch, getBatchResults, getBatchStatus } from './batch';
import type { TextBatchReference } from './batch-types';

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

const batchReference: TextBatchReference = {
  version: 1,
  type: 'text',
  id: 'batch-123',
  provider: 'mock-provider',
  modelId: 'mock-model-id',
};

function createBatchModel({
  doCreateBatch = async () => ({
    batchId: 'batch-123',
    status: 'pending' as const,
    warnings: [],
  }),
  doGetBatchStatus = async () => ({ status: 'pending' as const }),
  doGetBatchResults = async () => convertArrayToReadableStream([]),
}: {
  doCreateBatch?: BatchLanguageModelV4['experimental_doCreateBatch'];
  doGetBatchStatus?: BatchLanguageModelV4['experimental_doGetBatchStatus'];
  doGetBatchResults?: BatchLanguageModelV4['experimental_doGetBatchResults'];
} = {}): BatchLanguageModelV4 {
  return Object.assign(new MockLanguageModelV4(), {
    experimental_doCreateBatch: doCreateBatch,
    experimental_doGetBatchStatus: doGetBatchStatus,
    experimental_doGetBatchResults: doGetBatchResults,
  });
}

describe('createTextBatch', () => {
  it('normalizes requests and returns the acknowledged batch', async () => {
    const calls: Array<
      Parameters<BatchLanguageModelV4['experimental_doCreateBatch']>[0]
    > = [];
    const model = createBatchModel({
      doCreateBatch: async options => {
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

    const result = await createTextBatch({
      model,
      requests: [
        {
          id: 'request-1',
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
      version: 1,
      type: 'text',
      id: 'batch-456',
      provider: 'mock-provider',
      modelId: 'mock-model-id',
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
    const model = createBatchModel();

    await expect(
      createTextBatch({ model, requests: [] }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);

    await expect(
      createTextBatch({
        model,
        requests: [
          { id: 'duplicate', prompt: 'one' },
          { id: 'duplicate', prompt: 'two' },
        ],
      }),
    ).rejects.toThrow('request IDs must be unique');
  });

  it('rejects models without batch support', async () => {
    await expect(
      createTextBatch({
        model: new MockLanguageModelV4() as unknown as BatchLanguageModelV4,
        requests: [{ id: 'request-1', prompt: 'hello' }],
      }),
    ).rejects.toBeInstanceOf(UnsupportedFunctionalityError);
  });
});

describe('getBatchStatus', () => {
  it('returns the latest status without the batch reference', async () => {
    const calls: BatchV4OperationOptions[] = [];
    const model = createBatchModel({
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
      model,
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

  it('rejects an incompatible model', async () => {
    const model = createBatchModel();

    await expect(
      getBatchStatus({
        model,
        batch: { ...batchReference, modelId: 'different-model' },
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
    const model = createBatchModel({
      doGetBatchResults: async () => {
        callCount++;
        return convertArrayToReadableStream([
          { id: 'request-1', status: 'succeeded', result: generateResult },
          {
            id: 'request-2',
            status: 'failed',
            error: { message: 'request failed', code: 'bad_request' },
          },
        ]);
      },
    });

    const stream = getBatchResults({
      model,
      batch: batchReference,
      maxRetries: 0,
    });

    await vi.waitFor(() => expect(callCount).toBe(1));

    const items = [];
    for await (const item of stream) {
      items.push(item);
    }

    expect(items).toMatchObject([
      {
        id: 'request-1',
        status: 'succeeded',
        result: {
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
      },
      {
        id: 'request-2',
        status: 'failed',
        error: { message: 'request failed', code: 'bad_request' },
      },
    ]);
  });
});
