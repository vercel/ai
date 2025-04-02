import { EmbeddingModelV1Embedding } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/provider-utils/test';
import { GoogleGenerativeAIEmbeddingModel } from './google-generative-ai-embedding-model';
import { createGoogleGenerativeAI } from './google-provider';

const dummyEmbeddings = [
  [0.1, 0.2, 0.3, 0.4, 0.5],
  [0.6, 0.7, 0.8, 0.9, 1.0],
];
const testValues = ['sunny day at the beach', 'rainy day in the city'];

const provider = createGoogleGenerativeAI({ apiKey: 'test-api-key' });
const model = provider.textEmbeddingModel('text-embedding-004');

const server = createTestServer({
  'https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents':
    {},
});

describe('GoogleGenerativeAIEmbeddingModel', () => {
  function prepareJsonResponse({
    embeddings = dummyEmbeddings,
    headers,
  }: {
    embeddings?: EmbeddingModelV1Embedding[];
    headers?: Record<string, string>;
  } = {}) {
    server.urls[
      'https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents'
    ].response = {
      type: 'json-value',
      headers,
      body: {
        embeddings: embeddings.map(embedding => ({ values: embedding })),
      },
    };
  }

  it('should extract embedding', async () => {
    prepareJsonResponse();

    const { embeddings } = await model.doEmbed({ values: testValues });

    expect(embeddings).toStrictEqual(dummyEmbeddings);
  });

  it('should expose the raw response headers', async () => {
    prepareJsonResponse({
      headers: {
        'test-header': 'test-value',
      },
    });

    const { rawResponse } = await model.doEmbed({ values: testValues });

    expect(rawResponse?.headers).toStrictEqual({
      // default headers:
      'content-length': '80',
      'content-type': 'application/json',

      // custom header
      'test-header': 'test-value',
    });
  });

  it('should pass the model and the values', async () => {
    prepareJsonResponse();

    await model.doEmbed({ values: testValues });

    expect(await server.calls[0].requestBody).toStrictEqual({
      requests: testValues.map(value => ({
        model: 'models/text-embedding-004',
        content: { role: 'user', parts: [{ text: value }] },
      })),
    });
  });

  it('should pass the outputDimensionality setting', async () => {
    prepareJsonResponse();

    await provider
      .embedding('text-embedding-004', { outputDimensionality: 64 })
      .doEmbed({ values: testValues });

    expect(await server.calls[0].requestBody).toStrictEqual({
      requests: testValues.map(value => ({
        model: 'models/text-embedding-004',
        content: { role: 'user', parts: [{ text: value }] },
        outputDimensionality: 64,
      })),
    });
  });

  it('should pass headers', async () => {
    prepareJsonResponse();

    const provider = createGoogleGenerativeAI({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.embedding('text-embedding-004').doEmbed({
      values: testValues,
      headers: {
        'Custom-Request-Header': 'request-header-value',
      },
    });

    expect(server.calls[0].requestHeaders).toStrictEqual({
      'x-goog-api-key': 'test-api-key',
      'content-type': 'application/json',
      'custom-provider-header': 'provider-header-value',
      'custom-request-header': 'request-header-value',
    });
  });

  it('should throw an error if too many values are provided', async () => {
    const model = new GoogleGenerativeAIEmbeddingModel(
      'text-embedding-004',
      {},
      {
        provider: 'google.generative-ai',
        baseURL: 'https://generativelanguage.googleapis.com/v1beta',
        headers: () => ({}),
      },
    );

    const tooManyValues = Array(2049).fill('test');

    await expect(model.doEmbed({ values: tooManyValues })).rejects.toThrow(
      'Too many values for a single embedding call. The google.generative-ai model "text-embedding-004" can only embed up to 2048 values per call, but 2049 values were provided.',
    );
  });
});
