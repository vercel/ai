import { EmbeddingModelV2Embedding } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/provider-utils/test';
import { GoogleGenerativeAIEmbeddingModel } from './google-generative-ai-embedding-model';
import { createGoogleGenerativeAI } from './google-provider';

const dummyEmbeddings = [
  [0.1, 0.2, 0.3, 0.4, 0.5],
  [0.6, 0.7, 0.8, 0.9, 1.0],
];
const testValues = ['sunny day at the beach', 'rainy day in the city'];

const provider = createGoogleGenerativeAI({ apiKey: 'test-api-key' });
const model = provider.textEmbeddingModel('gemini-embedding-001');

const URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:something';

const server = createTestServer({
  [URL]: {},
});

describe('GoogleGenerativeAIEmbeddingModel', () => {
  function prepareBatchJsonResponse({
    embeddings = dummyEmbeddings,
    headers,
  }: {
    embeddings?: EmbeddingModelV2Embedding[];
    headers?: Record<string, string>;
  } = {}) {
    server.urls[URL].response = {
      type: 'json-value',
      headers,
      body: {
        embeddings: embeddings.map(embedding => ({ values: embedding })),
      },
    };
  }

  function prepareSingleJsonResponse({
    embeddings = dummyEmbeddings,
    headers,
  }: {
    embeddings?: EmbeddingModelV2Embedding[];
    headers?: Record<string, string>;
  } = {}) {
    server.urls[URL].response = {
      type: 'json-value',
      headers,
      body: {
        embedding: { values: embeddings[0] },
      },
    };
  }

  it('should extract embedding', async () => {
    prepareBatchJsonResponse();

    const { embeddings } = await model.doEmbed({ values: testValues });

    expect(embeddings).toStrictEqual(dummyEmbeddings);
  });

  it('should expose the raw response', async () => {
    prepareBatchJsonResponse({
      headers: {
        'test-header': 'test-value',
      },
    });

    const { response } = await model.doEmbed({ values: testValues });

    expect(response?.headers).toStrictEqual({
      // default headers:
      'content-length': '80',
      'content-type': 'application/json',

      // custom header
      'test-header': 'test-value',
    });
    expect(response).toMatchSnapshot();
  });

  it('should pass the model and the values', async () => {
    prepareBatchJsonResponse();

    await model.doEmbed({ values: testValues });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      requests: testValues.map(value => ({
        model: 'models/gemini-embedding-001',
        content: { role: 'user', parts: [{ text: value }] },
      })),
    });
  });

  it('should pass the outputDimensionality setting', async () => {
    prepareBatchJsonResponse();

    await provider.embedding('gemini-embedding-001').doEmbed({
      values: testValues,
      providerOptions: {
        google: { outputDimensionality: 64 },
      },
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      requests: testValues.map(value => ({
        model: 'models/gemini-embedding-001',
        content: { role: 'user', parts: [{ text: value }] },
        outputDimensionality: 64,
      })),
    });
  });

  it('should pass the taskType setting', async () => {
    prepareBatchJsonResponse();

    await provider.embedding('gemini-embedding-001').doEmbed({
      values: testValues,
      providerOptions: { google: { taskType: 'SEMANTIC_SIMILARITY' } },
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      requests: testValues.map(value => ({
        model: 'models/gemini-embedding-001',
        content: { role: 'user', parts: [{ text: value }] },
        taskType: 'SEMANTIC_SIMILARITY',
      })),
    });
  });

  it('should pass headers', async () => {
    prepareBatchJsonResponse();

    const provider = createGoogleGenerativeAI({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.embedding('gemini-embedding-001').doEmbed({
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
    const model = new GoogleGenerativeAIEmbeddingModel('gemini-embedding-001', {
      provider: 'google.generative-ai',
      baseURL: 'https://generativelanguage.googleapis.com/v1beta',
      headers: () => ({}),
    });

    const tooManyValues = Array(2049).fill('test');

    await expect(model.doEmbed({ values: tooManyValues })).rejects.toThrow(
      'Too many values for a single embedding call. The google.generative-ai model "gemini-embedding-001" can only embed up to 2048 values per call, but 2049 values were provided.',
    );
  });

  it('should use the batch embeddings endpoint', async () => {
    prepareBatchJsonResponse();
    const model = provider.textEmbeddingModel('gemini-embedding-001');
    await model.doEmbed({
      values: testValues,
    });

    expect(server.calls[0].requestUrl).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents',
    );
  });

  it('should use the single embeddings endpoint', async () => {
    prepareSingleJsonResponse();

    const model = provider.textEmbeddingModel('gemini-embedding-001');

    await model.doEmbed({
      values: [testValues[0]],
    });

    expect(server.calls[0].requestUrl).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent',
    );
  });
});
