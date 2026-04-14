import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { createVoyage } from '../voyage-provider';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';

vi.mock('../version', () => ({
  VERSION: '0.0.0-test',
}));

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
  }

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
      });
    });

    it('should send request with text documents', async () => {
      expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
        {
          "documents": [
            "sunny day at the beach",
            "rainy day in the city",
          ],
          "model": "rerank-2.5",
          "query": "rainy day",
          "top_k": 2,
        }
      `);
    });

    it('should extract ranking', async () => {
      expect(result.ranking).toMatchInlineSnapshot(`
        [
          {
            "index": 1,
            "relevanceScore": 0.10183054,
          },
          {
            "index": 0,
            "relevanceScore": 0.03762639,
          },
        ]
      `);
    });

    it('should expose the raw response', async () => {
      expect(result.response).toMatchInlineSnapshot(`
        {
          "body": {
            "data": [
              {
                "index": 1,
                "relevance_score": 0.10183054,
              },
              {
                "index": 0,
                "relevance_score": 0.03762639,
              },
            ],
            "model": "rerank-2.5",
            "object": "list",
            "usage": {
              "total_tokens": 10,
            },
          },
          "headers": {
            "content-length": "157",
            "content-type": "application/json",
          },
        }
      `);
    });

    it('should return result without warnings', async () => {
      expect(result.warnings).toMatchInlineSnapshot(`[]`);
    });
  });

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
      });
    });

    it('should convert to strings', async () => {
      expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
        {
          "documents": [
            "{"example":"sunny day at the beach"}",
            "{"example":"rainy day in the city"}",
          ],
          "model": "rerank-2.5",
          "query": "rainy day",
          "top_k": 2,
        }
      `);
    });

    it('should add compatibility warning', async () => {
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
  });

  describe('provider options', () => {
    beforeEach(() => {
      prepareJsonFixtureResponse('voyage-reranking.1');
    });

    it('should pass returnDocuments provider option', async () => {
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
          },
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
        }
      `);
    });

    it('should pass truncation provider option', async () => {
      await model.doRerank({
        documents: {
          type: 'text',
          values: ['sunny day at the beach', 'rainy day in the city'],
        },
        query: 'rainy day',
        topN: 2,
        providerOptions: {
          voyage: {
            truncation: true,
          },
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
          "top_k": 2,
          "truncation": true,
        }
      `);
    });
  });

  describe('headers', () => {
    beforeEach(() => {
      prepareJsonFixtureResponse('voyage-reranking.1');
    });

    it('should send auth and user-agent headers', async () => {
      await model.doRerank({
        documents: {
          type: 'text',
          values: ['sunny day at the beach'],
        },
        query: 'rainy day',
        topN: 1,
      });

      expect(server.calls[0].requestHeaders).toMatchInlineSnapshot(`
        {
          "authorization": "Bearer test-api-key",
          "content-type": "application/json",
        }
      `);
      expect(server.calls[0].requestUserAgent).toContain(
        `ai-sdk/voyage/0.0.0-test`,
      );
    });
  });
});
