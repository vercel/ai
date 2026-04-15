import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { createVoyage } from '../voyage-provider';
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import { VoyageRerankingModelOptions } from './voyage-reranking-options';

const provider = createVoyage({ apiKey: 'test-api-key' });
const model = provider.rerankingModel('rerank-2.5');

describe('doRerank', () => {
  const server = createTestServer({
    'https://api.voyageai.com/v1/rerank': {},
  });

  function prepareJsonFixtureResponse(filename: string) {
    server.urls['https://api.voyageai.com/v1/rerank'].response = {
      type: 'json-value',
      body: JSON.parse(
        fs.readFileSync(`src/reranking/__fixtures__/${filename}.json`, 'utf8'),
      ),
    };
    return;
  }

  describe('object documents', () => {
    let result: Awaited<ReturnType<typeof model.doRerank>>;

    beforeEach(async () => {
      prepareJsonFixtureResponse('voyage-reranking.1');

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
          voyage: {
            returnDocuments: false,
            truncation: true,
          } satisfies VoyageRerankingModelOptions,
        },
      });
    });

    it('should send request body', async () => {
      expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
        {
          "documents": [
            "{"example":"sunny day at the beach"}",
            "{"example":"rainy day in the city"}",
          ],
          "model": "rerank-2.5",
          "query": "rainy day",
          "return_documents": false,
          "top_k": 2,
          "truncation": true,
        }
      `);
    });

    it('should send correct headers', async () => {
      expect(server.calls[0].requestHeaders).toMatchInlineSnapshot(`
        {
          "authorization": "Bearer test-api-key",
          "content-type": "application/json",
        }
      `);
    });

    it('should return warnings', async () => {
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

    it('should return correct ranking', async () => {
      expect(result.ranking).toMatchInlineSnapshot(`
        [
          {
            "index": 1,
            "relevanceScore": 0.5703125,
          },
          {
            "index": 0,
            "relevanceScore": 0.255859375,
          },
        ]
      `);
    });

    it('should return correct response', async () => {
      expect(result.response).toMatchInlineSnapshot(`
        {
          "body": {
            "data": [
              {
                "index": 1,
                "relevance_score": 0.5703125,
              },
              {
                "index": 0,
                "relevance_score": 0.255859375,
              },
            ],
            "model": "rerank-2.5",
            "object": "list",
            "usage": {
              "total_tokens": 12,
            },
          },
          "headers": {
            "content-length": "157",
            "content-type": "application/json",
          },
        }
      `);
    });
  });

  describe('text documents', () => {
    let result: Awaited<ReturnType<typeof model.doRerank>>;

    beforeEach(async () => {
      prepareJsonFixtureResponse('voyage-reranking.1');

      result = await model.doRerank({
        documents: {
          type: 'text',
          values: ['sunny day at the beach', 'rainy day in the city'],
        },
        query: 'rainy day',
        topN: 2,
        providerOptions: {
          voyage: {
            returnDocuments: false,
            truncation: true,
          } satisfies VoyageRerankingModelOptions,
        },
      });
    });

    it('should send request body', async () => {
      expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
        {
          "documents": [
            "sunny day at the beach",
            "rainy day in the city",
          ],
          "model": "rerank-2.5",
          "query": "rainy day",
          "return_documents": false,
          "top_k": 2,
          "truncation": true,
        }
      `);
    });

    it('should send correct headers', async () => {
      expect(server.calls[0].requestHeaders).toMatchInlineSnapshot(`
        {
          "authorization": "Bearer test-api-key",
          "content-type": "application/json",
        }
      `);
    });

    it('should return no warnings', async () => {
      expect(result.warnings).toMatchInlineSnapshot(`[]`);
    });

    it('should return correct ranking', async () => {
      expect(result.ranking).toMatchInlineSnapshot(`
        [
          {
            "index": 1,
            "relevanceScore": 0.5703125,
          },
          {
            "index": 0,
            "relevanceScore": 0.255859375,
          },
        ]
      `);
    });

    it('should return correct response', async () => {
      expect(result.response).toMatchInlineSnapshot(`
        {
          "body": {
            "data": [
              {
                "index": 1,
                "relevance_score": 0.5703125,
              },
              {
                "index": 0,
                "relevance_score": 0.255859375,
              },
            ],
            "model": "rerank-2.5",
            "object": "list",
            "usage": {
              "total_tokens": 12,
            },
          },
          "headers": {
            "content-length": "157",
            "content-type": "application/json",
          },
        }
      `);
    });
  });

  describe('provider options', () => {
    beforeEach(() => {
      prepareJsonFixtureResponse('voyage-reranking.1');
    });

    it('should pass returnDocuments and truncation', async () => {
      await model.doRerank({
        documents: {
          type: 'text',
          values: ['sunny day at the beach', 'rainy day in the city'],
        },
        query: 'rainy day',
        topN: 2,
        providerOptions: {
          voyage: {
            returnDocuments: true,
            truncation: false,
          } satisfies VoyageRerankingModelOptions,
        },
      });

      expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
        {
          "documents": [
            "sunny day at the beach",
            "rainy day in the city",
          ],
          "model": "rerank-2.5",
          "query": "rainy day",
          "return_documents": true,
          "top_k": 2,
          "truncation": false,
        }
      `);
    });
  });
});
