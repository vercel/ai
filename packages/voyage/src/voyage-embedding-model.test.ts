import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { createVoyage } from './voyage-provider';
import { beforeEach, describe, it, expect, vi } from 'vitest';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const testValues = ['sunny day at the beach', 'rainy day in the city'];

const provider = createVoyage({ apiKey: 'test-api-key' });
const model = provider.embeddingModel('voyage-3');

const server = createTestServer({
  'https://api.voyageai.com/v1/embeddings': {},
});

function prepareJsonFixtureResponse(
  filename: string,
  headers?: Record<string, string>,
) {
  server.urls['https://api.voyageai.com/v1/embeddings'].response = {
    type: 'json-value',
    headers,
    body: JSON.parse(
      fs.readFileSync(`src/__fixtures__/${filename}.json`, 'utf8'),
    ),
  };
}

describe('doEmbed', () => {
  beforeEach(() => {
    prepareJsonFixtureResponse('voyage-embedding');
  });

  it('should extract embedding', async () => {
    const { embeddings } = await model.doEmbed({ values: testValues });

    expect(embeddings).toMatchInlineSnapshot(`
      [
        [
          0.014539,
          -0.015625,
          0.011353,
          0.004562,
          0.023438,
        ],
        [
          -0.009033,
          0.015625,
          0.028564,
          -0.013672,
          -0.007812,
        ],
      ]
    `);
  });

  it('should expose the raw response', async () => {
    prepareJsonFixtureResponse('voyage-embedding', {
      'test-header': 'test-value',
    });

    const { response } = await model.doEmbed({ values: testValues });

    expect(response?.headers).toMatchInlineSnapshot(`
      {
        "content-length": "261",
        "content-type": "application/json",
        "test-header": "test-value",
      }
    `);
    expect(response).toMatchSnapshot();
  });

  it('should extract usage', async () => {
    const { usage } = await model.doEmbed({ values: testValues });

    expect(usage).toMatchInlineSnapshot(`
      {
        "tokens": 10,
      }
    `);
  });

  it('should pass the model and the values', async () => {
    await model.doEmbed({ values: testValues });

    expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
      {
        "input": [
          "sunny day at the beach",
          "rainy day in the city",
        ],
        "model": "voyage-3",
      }
    `);
  });

  it('should pass the input_type setting', async () => {
    await provider.embeddingModel('voyage-3').doEmbed({
      values: testValues,
      providerOptions: {
        voyage: {
          inputType: 'document',
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
      {
        "input": [
          "sunny day at the beach",
          "rainy day in the city",
        ],
        "input_type": "document",
        "model": "voyage-3",
      }
    `);
  });

  it('should pass the output_dimension setting', async () => {
    await provider.embeddingModel('voyage-3').doEmbed({
      values: testValues,
      providerOptions: {
        voyage: {
          outputDimension: 512,
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
      {
        "input": [
          "sunny day at the beach",
          "rainy day in the city",
        ],
        "model": "voyage-3",
        "output_dimension": 512,
      }
    `);
  });

  it('should pass the output_dtype setting', async () => {
    await provider.embeddingModel('voyage-3').doEmbed({
      values: testValues,
      providerOptions: {
        voyage: {
          outputDtype: 'int8',
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
      {
        "input": [
          "sunny day at the beach",
          "rainy day in the city",
        ],
        "model": "voyage-3",
        "output_dtype": "int8",
      }
    `);
  });

  it('should pass headers', async () => {
    const provider = createVoyage({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.embeddingModel('voyage-3').doEmbed({
      values: testValues,
      headers: {
        'Custom-Request-Header': 'request-header-value',
      },
    });

    const requestHeaders = server.calls[0].requestHeaders;

    expect(requestHeaders).toMatchInlineSnapshot(`
      {
        "authorization": "Bearer test-api-key",
        "content-type": "application/json",
        "custom-provider-header": "provider-header-value",
        "custom-request-header": "request-header-value",
      }
    `);
    expect(server.calls[0].requestUserAgent).toContain(
      `ai-sdk/voyage/0.0.0-test`,
    );
  });
});
