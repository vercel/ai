import { EmbeddingModelV1Embedding } from '@ai-sdk/provider';
import { JsonTestServer } from '@ai-sdk/provider-utils/test';
import { createMistral } from './mistral-provider';

const dummyEmbeddings = [
  [0.1, 0.2, 0.3, 0.4, 0.5],
  [0.6, 0.7, 0.8, 0.9, 1.0],
];
const testValues = ['sunny day at the beach', 'rainy day in the city'];

const provider = createMistral({ apiKey: 'test-api-key' });
const model = provider.embedding('mistral-embed');

describe('doEmbed', () => {
  const server = new JsonTestServer('https://api.mistral.ai/v1/embeddings');

  server.setupTestEnvironment();

  function prepareJsonResponse({
    embeddings = dummyEmbeddings,
  }: {
    embeddings?: EmbeddingModelV1Embedding[];
  } = {}) {
    server.responseBodyJson = {
      id: 'b322cfc2b9d34e2f8e14fc99874faee5',
      object: 'list',
      data: embeddings.map((embedding, i) => ({
        object: 'embedding',
        embedding,
        index: i,
      })),
      model: 'mistral-embed',
      usage: { prompt_tokens: 8, total_tokens: 8, completion_tokens: 0 },
    };
  }

  it('should extract embedding', async () => {
    prepareJsonResponse();

    const { embeddings } = await model.doEmbed({ values: testValues });

    expect(embeddings).toStrictEqual(dummyEmbeddings);
  });

  it('should expose the raw response headers', async () => {
    prepareJsonResponse();

    server.responseHeaders = {
      'test-header': 'test-value',
    };

    const { rawResponse } = await model.doEmbed({ values: testValues });

    expect(rawResponse?.headers).toStrictEqual({
      // default headers:
      'content-type': 'application/json',

      // custom header
      'test-header': 'test-value',
    });
  });

  it('should pass the model and the values', async () => {
    prepareJsonResponse();

    await model.doEmbed({ values: testValues });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      model: 'mistral-embed',
      input: testValues,
      encoding_format: 'float',
    });
  });

  it('should pass custom headers', async () => {
    prepareJsonResponse();

    const provider = createMistral({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Header': 'test-header',
      },
    });

    await provider.embedding('mistral-embed').doEmbed({
      values: testValues,
    });

    const requestHeaders = await server.getRequestHeaders();
    expect(requestHeaders.get('Custom-Header')).toStrictEqual('test-header');
  });

  it('should pass the api key as Authorization header', async () => {
    prepareJsonResponse();

    const provider = createMistral({ apiKey: 'test-api-key' });

    await provider.embedding('mistral-embed').doEmbed({
      values: testValues,
    });

    expect(
      (await server.getRequestHeaders()).get('Authorization'),
    ).toStrictEqual('Bearer test-api-key');
  });
});
