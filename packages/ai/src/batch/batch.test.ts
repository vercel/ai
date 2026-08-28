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
import { getBatchResults, getBatchStatus, startTextBatch } from './batch';
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

function createMockBatchModel({
  doStartBatch = async () => ({
    batchId: 'batch-123',
    status: 'pending' as const,
    warnings: [],
  }),
  doGetBatchStatus = async () => ({ status: 'pending' as const }),
  doGetBatchResults = async () => convertArrayToReadableStream([]),
}: {
  doStartBatch?: BatchLanguageModelV4['experimental_doStartBatch'];
  doGetBatchStatus?: BatchLanguageModelV4['experimental_doGetBatchStatus'];
  doGetBatchResults?: BatchLanguageModelV4['experimental_doGetBatchResults'];
} = {}): BatchLanguageModelV4 {
  return Object.assign(new MockLanguageModelV4(), {
    experimental_doStartBatch: doStartBatch,
    experimental_doGetBatchStatus: doGetBatchStatus,
    experimental_doGetBatchResults: doGetBatchResults,
  });
}

describe('startTextBatch', () => {
  it('normalizes requests and returns the acknowledged batch', async () => {
    const calls: Array<
      Parameters<BatchLanguageModelV4['experimental_doStartBatch']>[0]
    > = [];
    const model = createMockBatchModel({
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

    const result = await startTextBatch({
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
    const model = createMockBatchModel();

    await expect(
      startTextBatch({ model, requests: [] }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);

    await expect(
      startTextBatch({
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
      startTextBatch({
        model: new MockLanguageModelV4() as unknown as BatchLanguageModelV4,
        requests: [{ id: 'request-1', prompt: 'hello' }],
      }),
    ).rejects.toBeInstanceOf(UnsupportedFunctionalityError);
  });

  it('forwards the webhook URL to the batch model', async () => {
    const calls: Array<
      Parameters<BatchLanguageModelV4['experimental_doStartBatch']>[0]
    > = [];
    const model = createMockBatchModel({
      doStartBatch: async options => {
        calls.push(options);
        return { batchId: 'batch-123', status: 'pending', warnings: [] };
      },
    });

    const result = await startTextBatch({
      model,
      requests: [{ id: 'request-1', prompt: 'hello' }],
      webhookUrl: 'https://example.com/batch-webhook',
    });

    expect(calls[0].webhookUrl).toBe('https://example.com/batch-webhook');
    expect(result.warnings).toEqual([]);
  });
});

describe('getBatchStatus', () => {
  it('returns the latest status without the batch reference', async () => {
    const calls: BatchV4OperationOptions[] = [];
    const model = createMockBatchModel({
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
    const model = createMockBatchModel();

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
    const model = createMockBatchModel({
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
        content: [{ type: 'text', text: 'Paris' }],
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
        id: 'request-2',
        status: 'failed',
        error: { message: 'request failed', code: 'bad_request' },
      },
    ]);
  });

  it('preserves ordered Core-normalized content', async () => {
    const generateResult: LanguageModelV4GenerateResult = {
      content: [
        {
          type: 'text',
          text: 'The answer is ',
          providerMetadata: { mock: { part: 'text' } },
        },
        {
          type: 'reasoning',
          text: 'I should use the weather tool.',
          providerMetadata: { mock: { part: 'reasoning' } },
        },
        {
          type: 'reasoning-file',
          mediaType: 'text/plain',
          data: { type: 'data', data: 'cmVhc29uaW5n' },
          providerMetadata: { mock: { part: 'reasoning-file' } },
        },
        {
          type: 'file',
          mediaType: 'application/octet-stream',
          data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
          providerMetadata: { mock: { part: 'file' } },
        },
        {
          type: 'source',
          sourceType: 'url',
          id: 'source-1',
          url: 'https://example.com/weather',
          title: 'Weather',
          providerMetadata: { mock: { part: 'source' } },
        },
        {
          type: 'custom',
          kind: 'mock.trace',
          providerMetadata: { mock: { part: 'custom' } },
        },
        {
          type: 'tool-call',
          toolCallId: 'tool-1',
          toolName: 'weather',
          input: '{"city":"Paris"}',
          providerExecuted: true,
          dynamic: true,
          providerMetadata: { mock: { part: 'tool-call' } },
        },
        {
          type: 'tool-result',
          toolCallId: 'tool-1',
          toolName: 'weather',
          result: { temperature: 20 },
          dynamic: true,
          preliminary: true,
          providerMetadata: { mock: { part: 'tool-result' } },
        },
        {
          type: 'tool-call',
          toolCallId: 'tool-2',
          toolName: 'broken',
          input: '{not json',
          providerExecuted: true,
          dynamic: true,
        },
        {
          type: 'tool-result',
          toolCallId: 'tool-2',
          toolName: 'broken',
          result: 'tool failed',
          isError: true,
          dynamic: true,
        },
        {
          type: 'tool-approval-request',
          approvalId: 'approval-1',
          toolCallId: 'tool-1',
          providerMetadata: { mock: { part: 'approval' } },
        },
        { type: 'text', text: '20°C.' },
      ],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: testUsage,
      warnings: [],
    };
    const model = createMockBatchModel({
      doGetBatchResults: async () =>
        convertArrayToReadableStream([
          { id: 'request-1', status: 'succeeded', result: generateResult },
        ]),
    });

    const [item] = await Array.fromAsync(
      getBatchResults({ model, batch: batchReference, maxRetries: 0 }),
    );

    expect(item).toMatchObject({
      id: 'request-1',
      status: 'succeeded',
      text: 'The answer is 20°C.',
    });
    if (item.status !== 'succeeded') {
      throw new Error(`expected succeeded item, got ${item.status}`);
    }

    expect(item.content).toHaveLength(generateResult.content.length);
    expect(item.content[0]).toEqual(generateResult.content[0]);
    expect(item.content[1]).toEqual(generateResult.content[1]);
    expect(item.content[2]).toMatchObject({
      type: 'reasoning-file',
      file: {
        mediaType: 'text/plain',
        base64: 'cmVhc29uaW5n',
      },
      providerMetadata: { mock: { part: 'reasoning-file' } },
    });
    expect(item.content[3]).toMatchObject({
      type: 'file',
      file: {
        mediaType: 'application/octet-stream',
        base64: 'AQID',
      },
      providerMetadata: { mock: { part: 'file' } },
    });
    expect(item.content.slice(4, 8)).toEqual([
      generateResult.content[4],
      generateResult.content[5],
      {
        type: 'tool-call',
        toolCallId: 'tool-1',
        toolName: 'weather',
        input: { city: 'Paris' },
        providerExecuted: true,
        dynamic: true,
        providerMetadata: { mock: { part: 'tool-call' } },
      },
      {
        type: 'tool-result',
        toolCallId: 'tool-1',
        toolName: 'weather',
        input: { city: 'Paris' },
        output: { temperature: 20 },
        providerExecuted: true,
        dynamic: true,
        preliminary: true,
        providerMetadata: { mock: { part: 'tool-result' } },
      },
    ]);
    expect(item.content[8]).toMatchObject({
      type: 'tool-call',
      toolCallId: 'tool-2',
      toolName: 'broken',
      input: '{not json',
      providerExecuted: true,
      dynamic: true,
      invalid: true,
      error: expect.anything(),
    });
    expect(item.content[9]).toEqual({
      type: 'tool-error',
      toolCallId: 'tool-2',
      toolName: 'broken',
      input: '{not json',
      error: 'tool failed',
      providerExecuted: true,
      dynamic: true,
      preliminary: undefined,
    });
    expect(item.content[10]).toEqual({
      type: 'tool-approval-request',
      approvalId: 'approval-1',
      toolCall: item.content[6],
      providerMetadata: { mock: { part: 'approval' } },
    });
    expect(item.content[11]).toEqual({ type: 'text', text: '20°C.' });
  });

  it('returns non-text content with an empty text projection', async () => {
    const model = createMockBatchModel({
      doGetBatchResults: async () =>
        convertArrayToReadableStream([
          {
            id: 'request-1',
            status: 'succeeded',
            result: {
              content: [{ type: 'reasoning', text: 'Reasoning only.' }],
              finishReason: { unified: 'stop', raw: undefined },
              usage: testUsage,
              warnings: [],
            },
          },
        ]),
    });

    const [item] = await Array.fromAsync(
      getBatchResults({ model, batch: batchReference, maxRetries: 0 }),
    );

    expect(item).toMatchObject({
      id: 'request-1',
      status: 'succeeded',
      content: [{ type: 'reasoning', text: 'Reasoning only.' }],
      text: '',
    });
  });

  it('leaves failed, cancelled, and expired items unchanged', async () => {
    const terminalItems = [
      {
        id: 'failed',
        status: 'failed' as const,
        error: { message: 'request failed', code: 'bad_request' },
        providerMetadata: { mock: { terminal: true } },
      },
      {
        id: 'cancelled',
        status: 'cancelled' as const,
        error: { message: 'request cancelled' },
      },
      {
        id: 'expired',
        status: 'expired' as const,
        providerMetadata: { mock: { expired: true } },
      },
    ];
    const model = createMockBatchModel({
      doGetBatchResults: async () =>
        convertArrayToReadableStream(terminalItems),
    });

    const items = await Array.fromAsync(
      getBatchResults({ model, batch: batchReference, maxRetries: 0 }),
    );

    expect(items).toEqual(terminalItems);
  });
});
