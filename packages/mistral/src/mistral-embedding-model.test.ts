import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { createMistral } from './mistral-provider';
import { beforeEach, describe, it, expect, vi } from 'vitest';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const testValues = ['sunny day at the beach', 'rainy day in the city'];

const provider = createMistral({ apiKey: 'test-api-key' });
const model = provider.embeddingModel('mistral-embed');

const server = createTestServer({
  'https://api.mistral.ai/v1/embeddings': {},
});

function prepareJsonFixtureResponse(
  filename: string,
  headers?: Record<string, string>,
) {
  server.urls['https://api.mistral.ai/v1/embeddings'].response = {
    type: 'json-value',
    headers,
    body: JSON.parse(
      fs.readFileSync(`src/__fixtures__/${filename}.json`, 'utf8'),
    ),
  };
}

describe('doEmbed', () => {
  beforeEach(() => {
    prepareJsonFixtureResponse('mistral-embedding');
  });

  it('should extract embedding', async () => {
    const { embeddings } = await model.doEmbed({ values: testValues });

    expect(embeddings).toMatchInlineSnapshot(`
      [
        [
          -0.0389404296875,
          0.048065185546875,
          0.07159423828125,
          0.00139617919921875,
          0.028350830078125,
        ],
        [
          -0.0535888671875,
          0.019500732421875,
          0.057464599609375,
          0.0029582977294921875,
          0.0467529296875,
        ],
      ]
    `);
  });

  it('should extract usage', async () => {
    const { usage } = await model.doEmbed({ values: testValues });

    expect(usage).toMatchInlineSnapshot(`
      {
        "tokens": 16,
      }
    `);
  });

  it('should expose the raw response', async () => {
    prepareJsonFixtureResponse('mistral-embedding', {
      'test-header': 'test-value',
    });

    const { response } = await model.doEmbed({ values: testValues });

    expect(response?.headers).toMatchInlineSnapshot(`
      {
        "content-length": "540",
        "content-type": "application/json",
        "test-header": "test-value",
      }
    `);
    expect(response).toMatchSnapshot();
  });

  it('should pass the model and the values', async () => {
    await model.doEmbed({ values: testValues });

    expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
      {
        "encoding_format": "float",
        "input": [
          "sunny day at the beach",
          "rainy day in the city",
        ],
        "model": "mistral-embed",
      }
    `);
  });

  it('should pass headers', async () => {
    const provider = createMistral({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.embedding('mistral-embed').doEmbed({
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
      `ai-sdk/mistral/0.0.0-test`,
    );
  });
});
