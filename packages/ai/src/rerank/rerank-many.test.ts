import type { RerankingModelV4CallOptions } from '@ai-sdk/provider';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as logWarningsModule from '../logger/log-warnings';
import { MockRerankingModelV4 } from '../test/mock-reranking-model-v4';
import { createResolvablePromise } from '../util/create-resolvable-promise';
import { rerankMany } from './rerank-many';
import type { RerankEndEvent, RerankStartEvent } from './rerank-events';
import type { RerankManyResult } from './rerank-many-result';

const testDocuments = ['d0', 'd1', 'd2', 'd3', 'd4'];

// Returns a per-window ranking keyed on the window's first document so the
// result is independent of the order in which windows are dispatched.
const windowedDoRerank = async ({ documents }: RerankingModelV4CallOptions) => {
  const values = documents.values as string[];
  switch (values[0]) {
    case 'd0':
      return {
        ranking: [
          { index: 1, relevanceScore: 0.5 },
          { index: 0, relevanceScore: 0.3 },
        ],
      };
    case 'd2':
      return {
        ranking: [
          { index: 0, relevanceScore: 0.9 },
          { index: 1, relevanceScore: 0.1 },
        ],
      };
    case 'd4':
      return { ranking: [{ index: 0, relevanceScore: 0.7 }] };
    default:
      throw new Error(`unexpected window starting with ${values[0]}`);
  }
};

describe('rerankMany', () => {
  describe('single call (no maxDocumentsPerCall)', () => {
    let result: RerankManyResult<string>;
    let model: MockRerankingModelV4;

    beforeEach(async () => {
      model = new MockRerankingModelV4({
        doRerank: async () => ({
          ranking: [
            { index: 2, relevanceScore: 0.9 },
            { index: 0, relevanceScore: 0.8 },
            { index: 4, relevanceScore: 0.7 },
            { index: 1, relevanceScore: 0.6 },
            { index: 3, relevanceScore: 0.5 },
          ],
        }),
      });

      result = await rerankMany({
        model,
        documents: testDocuments,
        query: 'q',
        topN: 3,
      });
    });

    it('should send all documents in a single call without a per-window topN', () => {
      expect(model.doRerankCalls.length).toBe(1);
      expect(model.doRerankCalls[0].documents).toEqual({
        type: 'text',
        values: testDocuments,
      });
      // topN is applied globally after merging, not by the provider.
      expect(model.doRerankCalls[0].topN).toBeUndefined();
    });

    it('should apply topN to the merged ranking', () => {
      expect(result.ranking.map(r => r.originalIndex)).toStrictEqual([2, 0, 4]);
      expect(result.rerankedDocuments).toStrictEqual(['d2', 'd0', 'd4']);
      expect(result.originalDocuments).toStrictEqual(testDocuments);
    });
  });

  describe('object documents', () => {
    it('should send documents as objects', async () => {
      const documents = [{ id: 0 }, { id: 1 }, { id: 2 }];
      const model = new MockRerankingModelV4({
        doRerank: async () => ({
          ranking: [
            { index: 1, relevanceScore: 0.9 },
            { index: 0, relevanceScore: 0.5 },
            { index: 2, relevanceScore: 0.2 },
          ],
        }),
      });

      const result = await rerankMany({ model, documents, query: 'q' });

      expect(model.doRerankCalls[0].documents).toEqual({
        type: 'object',
        values: documents,
      });
      expect(result.rerankedDocuments).toStrictEqual([
        { id: 1 },
        { id: 0 },
        { id: 2 },
      ]);
    });
  });

  describe('windowing with maxDocumentsPerCall', () => {
    let result: RerankManyResult<string>;
    let model: MockRerankingModelV4;

    beforeEach(async () => {
      model = new MockRerankingModelV4({
        maxDocumentsPerCall: 2,
        doRerank: windowedDoRerank,
      });

      result = await rerankMany({
        model,
        documents: testDocuments,
        query: 'q',
      });
    });

    it('should split the documents into windows', () => {
      expect(model.doRerankCalls.map(call => call.documents)).toStrictEqual([
        { type: 'text', values: ['d0', 'd1'] },
        { type: 'text', values: ['d2', 'd3'] },
        { type: 'text', values: ['d4'] },
      ]);
    });

    it('should remap window-local indices to global indices and sort by score', () => {
      // scores: d2=0.9, d4=0.7, d1=0.5, d0=0.3, d3=0.1
      expect(result.ranking).toStrictEqual([
        { originalIndex: 2, score: 0.9, document: 'd2' },
        { originalIndex: 4, score: 0.7, document: 'd4' },
        { originalIndex: 1, score: 0.5, document: 'd1' },
        { originalIndex: 0, score: 0.3, document: 'd0' },
        { originalIndex: 3, score: 0.1, document: 'd3' },
      ]);
      expect(result.rerankedDocuments).toStrictEqual([
        'd2',
        'd4',
        'd1',
        'd0',
        'd3',
      ]);
    });

    it('should apply topN across all windows', async () => {
      const topResult = await rerankMany({
        model: new MockRerankingModelV4({
          maxDocumentsPerCall: 2,
          doRerank: windowedDoRerank,
        }),
        documents: testDocuments,
        query: 'q',
        topN: 2,
      });

      expect(topResult.rerankedDocuments).toStrictEqual(['d2', 'd4']);
      expect(topResult.originalDocuments).toStrictEqual(testDocuments);
    });
  });

  describe('model.supportsParallelCalls', () => {
    const makeTimedModel = (
      events: string[],
      resolvables: Array<ReturnType<typeof createResolvablePromise<void>>>,
      supportsParallelCalls: boolean,
    ) => {
      let callCount = 0;
      return new MockRerankingModelV4({
        supportsParallelCalls,
        maxDocumentsPerCall: 1,
        doRerank: async () => {
          const index = callCount++;
          events.push(`start-${index}`);
          await resolvables[index].promise;
          events.push(`end-${index}`);
          return { ranking: [{ index: 0, relevanceScore: 1 - index * 0.1 }] };
        },
      });
    };

    it('should not parallelize when false', async () => {
      const events: string[] = [];
      const resolvables = [
        createResolvablePromise<void>(),
        createResolvablePromise<void>(),
        createResolvablePromise<void>(),
      ];

      const promise = rerankMany({
        model: makeTimedModel(events, resolvables, false),
        documents: ['a', 'b', 'c'],
        query: 'q',
      });

      resolvables.forEach(r => r.resolve());
      const result = await promise;

      expect(events).toStrictEqual([
        'start-0',
        'end-0',
        'start-1',
        'end-1',
        'start-2',
        'end-2',
      ]);
      expect(result.rerankedDocuments).toHaveLength(3);
    });

    it('should parallelize when true', async () => {
      const events: string[] = [];
      const resolvables = [
        createResolvablePromise<void>(),
        createResolvablePromise<void>(),
        createResolvablePromise<void>(),
      ];

      const promise = rerankMany({
        model: makeTimedModel(events, resolvables, true),
        documents: ['a', 'b', 'c'],
        query: 'q',
      });

      resolvables.forEach(r => r.resolve());
      await promise;

      expect(events).toStrictEqual([
        'start-0',
        'start-1',
        'start-2',
        'end-0',
        'end-1',
        'end-2',
      ]);
    });

    it('should support maxParallelCalls', async () => {
      const events: string[] = [];
      const resolvables = [
        createResolvablePromise<void>(),
        createResolvablePromise<void>(),
        createResolvablePromise<void>(),
      ];

      const promise = rerankMany({
        maxParallelCalls: 2,
        model: makeTimedModel(events, resolvables, true),
        documents: ['a', 'b', 'c'],
        query: 'q',
      });

      resolvables.forEach(r => r.resolve());
      await promise;

      expect(events).toStrictEqual([
        'start-0',
        'start-1',
        'end-0',
        'end-1',
        'start-2',
        'end-2',
      ]);
    });
  });

  describe('result.responses', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should include one response per window', async () => {
      const model = new MockRerankingModelV4({
        maxDocumentsPerCall: 2,
        doRerank: async ({ documents }) => {
          const values = documents.values as string[];
          return {
            ranking: [{ index: 0, relevanceScore: 0.5 }],
            response: {
              id: `resp-${values[0]}`,
              headers: { 'x-window': values[0] },
              body: { window: values[0] },
            },
          };
        },
      });

      const result = await rerankMany({
        model,
        documents: testDocuments,
        query: 'q',
      });

      expect(result.responses).toStrictEqual([
        {
          id: 'resp-d0',
          timestamp: new Date('2025-01-01T00:00:00Z'),
          modelId: 'mock-model-id',
          headers: { 'x-window': 'd0' },
          body: { window: 'd0' },
        },
        {
          id: 'resp-d2',
          timestamp: new Date('2025-01-01T00:00:00Z'),
          modelId: 'mock-model-id',
          headers: { 'x-window': 'd2' },
          body: { window: 'd2' },
        },
        {
          id: 'resp-d4',
          timestamp: new Date('2025-01-01T00:00:00Z'),
          modelId: 'mock-model-id',
          headers: { 'x-window': 'd4' },
          body: { window: 'd4' },
        },
      ]);
    });
  });

  describe('result.providerMetadata', () => {
    it('should merge provider metadata from every window', async () => {
      const model = new MockRerankingModelV4({
        maxDocumentsPerCall: 2,
        doRerank: async ({ documents }) => {
          const values = documents.values as string[];
          return {
            ranking: [{ index: 0, relevanceScore: 0.5 }],
            providerMetadata: {
              aProvider: { [`window_${values[0]}`]: true },
            },
          };
        },
      });

      const result = await rerankMany({
        model,
        documents: testDocuments,
        query: 'q',
      });

      expect(result.providerMetadata).toStrictEqual({
        aProvider: {
          window_d0: true,
          window_d2: true,
          window_d4: true,
        },
      });
    });
  });

  describe('empty documents', () => {
    it('should return an empty result without calling the model', async () => {
      const model = new MockRerankingModelV4({
        maxDocumentsPerCall: 2,
        doRerank: async () => {
          throw new Error('doRerank should not be called');
        },
      });

      const result = await rerankMany({ model, documents: [], query: 'q' });

      expect(model.doRerankCalls).toHaveLength(0);
      expect(result.ranking).toStrictEqual([]);
      expect(result.rerankedDocuments).toStrictEqual([]);
      expect(result.originalDocuments).toStrictEqual([]);
      expect(result.responses).toStrictEqual([]);
    });
  });

  describe('options.headers and providerOptions', () => {
    it('should forward headers and provider options to every window', async () => {
      const model = new MockRerankingModelV4({
        maxDocumentsPerCall: 2,
        doRerank: windowedDoRerank,
      });

      await rerankMany({
        model,
        documents: testDocuments,
        query: 'q',
        headers: { 'x-custom': 'value' },
        providerOptions: { aProvider: { someKey: 'someValue' } },
      });

      for (const call of model.doRerankCalls) {
        expect(call.headers).toStrictEqual({ 'x-custom': 'value' });
        expect(call.providerOptions).toStrictEqual({
          aProvider: { someKey: 'someValue' },
        });
      }
    });
  });

  describe('options.onStart and onEnd', () => {
    it('should send the aggregated start and end events', async () => {
      const startEvents: RerankStartEvent[] = [];
      const endEvents: RerankEndEvent[] = [];

      vi.spyOn(logWarningsModule, 'logWarnings').mockImplementation(() => {});

      const model = new MockRerankingModelV4({
        maxDocumentsPerCall: 2,
        doRerank: windowedDoRerank,
      });

      await rerankMany({
        model,
        documents: testDocuments,
        query: 'q',
        topN: 2,
        onStart: event => {
          startEvents.push(event);
        },
        onEnd: event => {
          endEvents.push(event);
        },
      });

      expect(startEvents).toHaveLength(1);
      expect(startEvents[0]).toMatchObject({
        operationId: 'ai.rerankMany',
        provider: 'mock-provider',
        modelId: 'mock-model-id',
        documents: testDocuments,
        query: 'q',
        topN: 2,
      });

      expect(endEvents).toHaveLength(1);
      expect(endEvents[0]).toMatchObject({
        operationId: 'ai.rerankMany',
        query: 'q',
        ranking: [
          { originalIndex: 2, score: 0.9, document: 'd2' },
          { originalIndex: 4, score: 0.7, document: 'd4' },
        ],
      });
      expect(Array.isArray(endEvents[0].response)).toBe(true);
    });
  });
});
