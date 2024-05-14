import { EmbeddingModelV1Embedding } from '@ai-sdk/provider';
import { JsonTestServer } from '@ai-sdk/provider-utils/test';
import { createOpenAI } from './openai-provider';

const dummyEmbeddings = [
  [0.1, 0.2, 0.3, 0.4, 0.5],
  [0.6, 0.7, 0.8, 0.9, 1.0],
];
const testValues = ['sunny day at the beach', 'rainy day in the city'];

const provider = createOpenAI({ apiKey: 'test-api-key' });
const model = provider.embedding('text-embedding-3-large');

describe('doEmbed', () => {
  const server = new JsonTestServer('https://api.openai.com/v1/embeddings');

  server.setupTestEnvironment();

  function prepareJsonResponse({
    embeddings = dummyEmbeddings,
  }: {
    embeddings?: EmbeddingModelV1Embedding[];
  } = {}) {
    server.responseBodyJson = {
      object: 'list',
      data: embeddings.map((embedding, i) => ({
        object: 'embedding',
        index: i,
        embedding,
      })),
      model: 'text-embedding-3-large',
      usage: { prompt_tokens: 8, total_tokens: 8 },
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
      model: 'text-embedding-3-large',
      input: testValues,
      encoding_format: 'float',
    });
  });

  it('should pass the dimensions setting', async () => {
    prepareJsonResponse();

    await provider
      .embedding('text-embedding-3-large', { dimensions: 64 })
      .doEmbed({ values: testValues });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      model: 'text-embedding-3-large',
      input: testValues,
      encoding_format: 'float',
      dimensions: 64,
    });
  });

  it('should pass custom headers', async () => {
    prepareJsonResponse();

    const provider = createOpenAI({
      apiKey: 'test-api-key',
      organization: 'test-organization',
      project: 'test-project',
      headers: {
        'Custom-Header': 'test-header',
      },
    });

    await provider.embedding('text-embedding-3-large').doEmbed({
      values: testValues,
    });

    const requestHeaders = await server.getRequestHeaders();

    expect(requestHeaders.get('OpenAI-Organization')).toStrictEqual(
      'test-organization',
    );
    expect(requestHeaders.get('OpenAI-Project')).toStrictEqual('test-project');
    expect(requestHeaders.get('Custom-Header')).toStrictEqual('test-header');
  });

  it('should pass the api key as Authorization header', async () => {
    prepareJsonResponse();

    const provider = createOpenAI({ apiKey: 'test-api-key' });

    await provider.embedding('text-embedding-3-large').doEmbed({
      values: testValues,
    });

    expect(
      (await server.getRequestHeaders()).get('Authorization'),
    ).toStrictEqual('Bearer test-api-key');
  });
});
