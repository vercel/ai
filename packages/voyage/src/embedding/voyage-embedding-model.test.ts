import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { createVoyage } from '../voyage-provider';
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import { VoyageEmbeddingOptions } from './voyage-embedding-options';

const provider = createVoyage({ apiKey: 'test-api-key' });
const model = provider.embeddingModel('voyage-3.5');

describe('doEmbed', () => {
  const server = createTestServer({
    'https://api.voyageai.com/v1/embeddings': {},
  });

  function prepareJsonFixtureResponse(filename: string) {
    server.urls['https://api.voyageai.com/v1/embeddings'].response = {
      type: 'json-value',
      body: JSON.parse(
        fs.readFileSync(`src/embedding/__fixtures__/${filename}.json`, 'utf8'),
      ),
    };
    return;
  }

  describe('basic embedding', () => {
    let result: Awaited<ReturnType<typeof model.doEmbed>>;

    beforeEach(async () => {
      prepareJsonFixtureResponse('voyage-embedding.1');

      result = await model.doEmbed({
        values: ['sunny day at the beach', 'rainy day in the city'],
      });
    });

    it('should send request with text values', async () => {
      expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
        {
          "input": [
            "sunny day at the beach",
            "rainy day in the city",
          ],
          "model": "voyage-3.5",
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

    it('should return result with embeddings', async () => {
      expect(result.embeddings).toMatchInlineSnapshot(`
        [
          [
            0.1,
            0.2,
            0.3,
            0.4,
            0.5,
          ],
          [
            0.6,
            0.7,
            0.8,
            0.9,
            1,
          ],
        ]
      `);
    });

    it('should return result with usage', async () => {
      expect(result.usage).toMatchInlineSnapshot(`
        {
          "tokens": 12,
        }
      `);
    });

    it('should return result without warnings', async () => {
      expect(result.warnings).toMatchInlineSnapshot(`[]`);
    });
  });

  describe('with provider options', () => {
    let result: Awaited<ReturnType<typeof model.doEmbed>>;

    beforeEach(async () => {
      prepareJsonFixtureResponse('voyage-embedding.1');

      result = await model.doEmbed({
        values: ['sunny day at the beach', 'rainy day in the city'],
        providerOptions: {
          voyage: {
            inputType: 'document',
            outputDimension: 512,
            truncation: true,
          } satisfies VoyageEmbeddingOptions,
        },
      });
    });

    it('should send request with provider options', async () => {
      expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
        {
          "input": [
            "sunny day at the beach",
            "rainy day in the city",
          ],
          "input_type": "document",
          "model": "voyage-3.5",
          "output_dimension": 512,
          "truncation": true,
        }
      `);
    });

    it('should return result with embeddings', async () => {
      expect(result.embeddings).toMatchInlineSnapshot(`
        [
          [
            0.1,
            0.2,
            0.3,
            0.4,
            0.5,
          ],
          [
            0.6,
            0.7,
            0.8,
            0.9,
            1,
          ],
        ]
      `);
    });
  });

  describe('query input type', () => {
    beforeEach(async () => {
      prepareJsonFixtureResponse('voyage-embedding.1');

      await model.doEmbed({
        values: ['search query'],
        providerOptions: {
          voyage: {
            inputType: 'query',
          } satisfies VoyageEmbeddingOptions,
        },
      });
    });

    it('should send request with query input type', async () => {
      expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
        {
          "input": [
            "search query",
          ],
          "input_type": "query",
          "model": "voyage-3.5",
        }
      `);
    });
  });
});
