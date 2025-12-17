import { RerankingModelV3CallOptions } from '@ai-sdk/provider';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockRerankingModelV3 } from '../test/mock-reranking-model-v3';
import { rerank } from './rerank';
import { RerankResult } from './rerank-result';
import { MockTracer } from '../test/mock-tracer';

describe('rerank', () => {
  describe('rerank with string documents', () => {
    let result: RerankResult<string>;
    let calls: RerankingModelV3CallOptions[];

    beforeEach(async () => {
      calls = [];

      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));

      const model = new MockRerankingModelV3({
        doRerank: async options => {
          calls.push(options);
          return {
            ranking: [
              { index: 2, relevanceScore: 0.9 },
              { index: 0, relevanceScore: 0.8 },
              { index: 1, relevanceScore: 0.7 },
            ],
            providerMetadata: {
              aProvider: {
                someResponseKey: 'someResponseValue',
              },
            },
            response: {
              headers: {
                'content-type': 'application/json',
              },
              body: {
                id: '123',
              },
              modelId: 'mock-response-model-id',
              id: 'mock-response-id',
            },
          };
        },
      });

      result = await rerank({
        model,
        documents: [
          'sunny day at the beach',
          'rainy day in the city',
          'cloudy day in the mountains',
        ],
        query: 'rainy day',
        topN: 3,
        providerOptions: {
          aProvider: { someKey: 'someValue' },
        },
      });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should call the model with the correct options', () => {
      expect(calls).toMatchInlineSnapshot(`
        [
          {
            "abortSignal": undefined,
            "documents": {
              "type": "text",
              "values": [
                "sunny day at the beach",
                "rainy day in the city",
                "cloudy day in the mountains",
              ],
            },
            "headers": undefined,
            "providerOptions": {
              "aProvider": {
                "someKey": "someValue",
              },
            },
            "query": "rainy day",
            "topN": 3,
          },
        ]
      `);
    });

    it('should return the correct original documents', () => {
      expect(result.originalDocuments).toMatchInlineSnapshot(`
        [
          "sunny day at the beach",
          "rainy day in the city",
          "cloudy day in the mountains",
        ]
      `);
    });

    it('should return the correct reranked documents', () => {
      expect(result.rerankedDocuments).toMatchInlineSnapshot(`
        [
          "cloudy day in the mountains",
          "sunny day at the beach",
          "rainy day in the city",
        ]
      `);
    });

    it('should return the correct ranking', () => {
      expect(result.ranking).toMatchInlineSnapshot(`
        [
          {
            "document": "cloudy day in the mountains",
            "originalIndex": 2,
            "score": 0.9,
          },
          {
            "document": "sunny day at the beach",
            "originalIndex": 0,
            "score": 0.8,
          },
          {
            "document": "rainy day in the city",
            "originalIndex": 1,
            "score": 0.7,
          },
        ]
      `);
    });

    it('should return the correct provider metadata', () => {
      expect(result.providerMetadata).toMatchInlineSnapshot(`
        {
          "aProvider": {
            "someResponseKey": "someResponseValue",
          },
        }
      `);
    });

    it('should return the correct response', () => {
      expect(result.response).toMatchInlineSnapshot(`
        {
          "body": {
            "id": "123",
          },
          "headers": {
            "content-type": "application/json",
          },
          "id": "mock-response-id",
          "modelId": "mock-response-model-id",
          "timestamp": 2025-01-01T00:00:00.000Z,
        }
      `);
    });
  });

  describe('rerank with object documents', () => {
    let result: RerankResult<{ id: string; name: string }>;
    let calls: RerankingModelV3CallOptions[];

    beforeEach(async () => {
      calls = [];

      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));

      const model = new MockRerankingModelV3({
        doRerank: async options => {
          calls.push(options);
          return {
            ranking: [
              { index: 2, relevanceScore: 0.9 },
              { index: 0, relevanceScore: 0.8 },
              { index: 1, relevanceScore: 0.7 },
            ],
            providerMetadata: {
              aProvider: {
                someResponseKey: 'someResponseValue',
              },
            },
            response: {
              headers: {
                'content-type': 'application/json',
              },
              body: {
                id: '123',
              },
              modelId: 'mock-response-model-id',
              id: 'mock-response-id',
            },
          };
        },
      });

      result = await rerank({
        model,
        documents: [
          { id: '123', name: 'sunny day at the beach' },
          { id: '456', name: 'rainy day in the city' },
          { id: '789', name: 'cloudy day in the mountains' },
        ],
        query: 'rainy day',
        topN: 3,
        providerOptions: {
          aProvider: { someKey: 'someValue' },
        },
      });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should call the model with the correct options', () => {
      expect(calls).toMatchInlineSnapshot(`
        [
          {
            "abortSignal": undefined,
            "documents": {
              "type": "object",
              "values": [
                {
                  "id": "123",
                  "name": "sunny day at the beach",
                },
                {
                  "id": "456",
                  "name": "rainy day in the city",
                },
                {
                  "id": "789",
                  "name": "cloudy day in the mountains",
                },
              ],
            },
            "headers": undefined,
            "providerOptions": {
              "aProvider": {
                "someKey": "someValue",
              },
            },
            "query": "rainy day",
            "topN": 3,
          },
        ]
      `);
    });

    it('should return the correct original documents', () => {
      expect(result.originalDocuments).toMatchInlineSnapshot(`
        [
          {
            "id": "123",
            "name": "sunny day at the beach",
          },
          {
            "id": "456",
            "name": "rainy day in the city",
          },
          {
            "id": "789",
            "name": "cloudy day in the mountains",
          },
        ]
      `);
    });

    it('should return the correct reranked documents', () => {
      expect(result.rerankedDocuments).toMatchInlineSnapshot(`
        [
          {
            "id": "789",
            "name": "cloudy day in the mountains",
          },
          {
            "id": "123",
            "name": "sunny day at the beach",
          },
          {
            "id": "456",
            "name": "rainy day in the city",
          },
        ]
      `);
    });

    it('should return the correct ranking', () => {
      expect(result.ranking).toMatchInlineSnapshot(`
        [
          {
            "document": {
              "id": "789",
              "name": "cloudy day in the mountains",
            },
            "originalIndex": 2,
            "score": 0.9,
          },
          {
            "document": {
              "id": "123",
              "name": "sunny day at the beach",
            },
            "originalIndex": 0,
            "score": 0.8,
          },
          {
            "document": {
              "id": "456",
              "name": "rainy day in the city",
            },
            "originalIndex": 1,
            "score": 0.7,
          },
        ]
      `);
    });

    it('should return the correct provider metadata', () => {
      expect(result.providerMetadata).toMatchInlineSnapshot(`
        {
          "aProvider": {
            "someResponseKey": "someResponseValue",
          },
        }
      `);
    });

    it('should return the correct response', () => {
      expect(result.response).toMatchInlineSnapshot(`
        {
          "body": {
            "id": "123",
          },
          "headers": {
            "content-type": "application/json",
          },
          "id": "mock-response-id",
          "modelId": "mock-response-model-id",
          "timestamp": 2025-01-01T00:00:00.000Z,
        }
      `);
    });
  });

  describe('telemetry', () => {
    let tracer: MockTracer;

    const model = new MockRerankingModelV3({
      doRerank: async options => {
        return {
          ranking: [
            { index: 2, relevanceScore: 0.9 },
            { index: 0, relevanceScore: 0.8 },
            { index: 1, relevanceScore: 0.7 },
          ],
          providerMetadata: {
            aProvider: {
              someResponseKey: 'someResponseValue',
            },
          },
          response: {
            headers: {
              'content-type': 'application/json',
            },
            body: {
              id: '123',
            },
          },
        };
      },
    });

    beforeEach(() => {
      tracer = new MockTracer();
    });

    it('should not record any telemetry data when not explicitly enabled', async () => {
      await rerank({
        model,
        documents: [
          'sunny day at the beach',
          'rainy day in the city',
          'cloudy day in the mountains',
        ],
        query: 'rainy day',
        topN: 3,
      });

      expect(tracer.jsonSpans).toMatchInlineSnapshot(`[]`);
    });

    it('should record telemetry data when enabled (single call path)', async () => {
      await rerank({
        model,
        documents: [
          'sunny day at the beach',
          'rainy day in the city',
          'cloudy day in the mountains',
        ],
        query: 'rainy day',
        topN: 3,
        experimental_telemetry: {
          isEnabled: true,
          functionId: 'test-function-id',
          metadata: {
            test1: 'value1',
            test2: false,
          },
          tracer,
        },
      });

      expect(tracer.jsonSpans).toMatchInlineSnapshot(`
        [
          {
            "attributes": {
              "ai.documents": [
                ""sunny day at the beach"",
                ""rainy day in the city"",
                ""cloudy day in the mountains"",
              ],
              "ai.model.id": "mock-model-id",
              "ai.model.provider": "mock-provider",
              "ai.operationId": "ai.rerank",
              "ai.settings.maxRetries": 2,
              "ai.telemetry.functionId": "test-function-id",
              "ai.telemetry.metadata.test1": "value1",
              "ai.telemetry.metadata.test2": false,
              "operation.name": "ai.rerank test-function-id",
              "resource.name": "test-function-id",
            },
            "events": [],
            "name": "ai.rerank",
          },
          {
            "attributes": {
              "ai.documents": [
                ""sunny day at the beach"",
                ""rainy day in the city"",
                ""cloudy day in the mountains"",
              ],
              "ai.model.id": "mock-model-id",
              "ai.model.provider": "mock-provider",
              "ai.operationId": "ai.rerank.doRerank",
              "ai.ranking": [
                "{"index":2,"relevanceScore":0.9}",
                "{"index":0,"relevanceScore":0.8}",
                "{"index":1,"relevanceScore":0.7}",
              ],
              "ai.ranking.type": "text",
              "ai.settings.maxRetries": 2,
              "ai.telemetry.functionId": "test-function-id",
              "ai.telemetry.metadata.test1": "value1",
              "ai.telemetry.metadata.test2": false,
              "operation.name": "ai.rerank.doRerank test-function-id",
              "resource.name": "test-function-id",
            },
            "events": [],
            "name": "ai.rerank.doRerank",
          },
        ]
      `);
    });

    it('should not record telemetry inputs / outputs when disabled', async () => {
      await rerank({
        model,
        documents: [
          'sunny day at the beach',
          'rainy day in the city',
          'cloudy day in the mountains',
        ],
        query: 'rainy day',
        topN: 3,
        experimental_telemetry: {
          isEnabled: true,
          recordInputs: false,
          recordOutputs: false,
          tracer,
        },
      });

      expect(tracer.jsonSpans).toMatchInlineSnapshot(`
        [
          {
            "attributes": {
              "ai.model.id": "mock-model-id",
              "ai.model.provider": "mock-provider",
              "ai.operationId": "ai.rerank",
              "ai.settings.maxRetries": 2,
              "operation.name": "ai.rerank",
            },
            "events": [],
            "name": "ai.rerank",
          },
          {
            "attributes": {
              "ai.model.id": "mock-model-id",
              "ai.model.provider": "mock-provider",
              "ai.operationId": "ai.rerank.doRerank",
              "ai.ranking.type": "text",
              "ai.settings.maxRetries": 2,
              "operation.name": "ai.rerank.doRerank",
            },
            "events": [],
            "name": "ai.rerank.doRerank",
          },
        ]
      `);
    });
  });
});
