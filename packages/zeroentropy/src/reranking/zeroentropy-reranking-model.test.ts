import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { createZeroEntropy } from '../zeroentropy-provider';
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import { ZeroEntropyRerankingModelOptions } from './zeroentropy-reranking-options';

const provider = createZeroEntropy({ apiKey: 'test-api-key' });
const model = provider.rerankingModel('zerank-2');

describe('doRerank', () => {
  const server = createTestServer({
    'https://api.zeroentropy.dev/v1/models/rerank': {},
  });

  function prepareJsonFixtureResponse(filename: string) {
    server.urls['https://api.zeroentropy.dev/v1/models/rerank'].response = {
      type: 'json-value',
      body: JSON.parse(
        fs.readFileSync(`src/reranking/__fixtures__/${filename}.json`, 'utf8'),
      ),
    };
  }

  describe('object documents', () => {
    let result: Awaited<ReturnType<typeof model.doRerank>>;

    beforeEach(async () => {
      prepareJsonFixtureResponse('zeroentropy-reranking.1');

      result = await model.doRerank({
        documents: {
          type: 'object',
          values: [
            { example: 'sunny day at the beach' },
            { example: 'rainy day in the city' },
          ],
        },
        query: 'rainy day',
        topN: 2,
        providerOptions: {
          zeroentropy: {
            latency: 'fast',
          } satisfies ZeroEntropyRerankingModelOptions,
        },
      });
    });

    it('should send request with stringified json documents', async () => {
      expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
        {
          "documents": [
            "{"example":"sunny day at the beach"}",
            "{"example":"rainy day in the city"}",
          ],
          "latency": "fast",
          "model": "zerank-2",
          "query": "rainy day",
          "top_n": 2,
        }
      `);
    });

    it('should send request with the correct headers', async () => {
      expect(server.calls[0].requestHeaders).toMatchInlineSnapshot(`
        {
          "authorization": "Bearer test-api-key",
          "content-type": "application/json",
        }
      `);
    });

    it('should return result with warnings', async () => {
      expect(result.warnings).toMatchInlineSnapshot(`
        [
          {
            "details": "Object documents are converted to strings.",
            "feature": "object documents",
            "type": "compatibility",
          },
        ]
      `);
    });

    it('should return result with the correct ranking', async () => {
      expect(result.ranking).toMatchInlineSnapshot(`
        [
          {
            "index": 1,
            "relevanceScore": 0.9321,
          },
          {
            "index": 0,
            "relevanceScore": 0.1234,
          },
        ]
      `);
    });

    it('should return result with the correct response', async () => {
      expect(result.response).toMatchInlineSnapshot(`
        {
          "body": {
            "actual_latency_mode": "fast",
            "e2e_latency": 123.4,
            "inference_latency": 98.7,
            "results": [
              {
                "index": 1,
                "relevance_score": 0.9321,
              },
              {
                "index": 0,
                "relevance_score": 0.1234,
              },
            ],
            "total_bytes": 512,
            "total_tokens": 64,
          },
          "headers": {
            "content-length": "197",
            "content-type": "application/json",
          },
        }
      `);
    });
  });

  describe('text documents', () => {
    let result: Awaited<ReturnType<typeof model.doRerank>>;

    beforeEach(async () => {
      prepareJsonFixtureResponse('zeroentropy-reranking.1');

      result = await model.doRerank({
        documents: {
          type: 'text',
          values: ['sunny day at the beach', 'rainy day in the city'],
        },
        query: 'rainy day',
        topN: 2,
      });
    });

    it('should send request with text documents', async () => {
      expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
        {
          "documents": [
            "sunny day at the beach",
            "rainy day in the city",
          ],
          "model": "zerank-2",
          "query": "rainy day",
          "top_n": 2,
        }
      `);
    });

    it('should return result without warnings', async () => {
      expect(result.warnings).toMatchInlineSnapshot(`[]`);
    });

    it('should return result with the correct ranking', async () => {
      expect(result.ranking).toMatchInlineSnapshot(`
        [
          {
            "index": 1,
            "relevanceScore": 0.9321,
          },
          {
            "index": 0,
            "relevanceScore": 0.1234,
          },
        ]
      `);
    });
  });
});
