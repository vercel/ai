import { EmbeddingModelV4Embedding } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { createZeroEntropy } from './zeroentropy-provider';
import { describe, it, expect, vi } from 'vitest';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const dummyEmbeddings: EmbeddingModelV4Embedding[] = [
  [0.1, 0.2, 0.3, 0.4, 0.5],
  [0.6, 0.7, 0.8, 0.9, 1.0],
];
const testValues = ['sunny day at the beach', 'rainy day in the city'];

const provider = createZeroEntropy({ apiKey: 'test-api-key' });
const model = provider.embeddingModel('zembed-1');

const server = createTestServer({
  'https://api.zeroentropy.dev/v1/models/embed': {},
});

describe('doEmbed', () => {
  function prepareJsonResponse({
    embeddings = dummyEmbeddings,
    usage = { total_bytes: 42, total_tokens: 8 },
    headers,
  }: {
    embeddings?: EmbeddingModelV4Embedding[];
    usage?: { total_bytes: number; total_tokens: number };
    headers?: Record<string, string>;
  } = {}) {
    server.urls['https://api.zeroentropy.dev/v1/models/embed'].response = {
      type: 'json-value',
      headers,
      body: {
        results: embeddings.map(embedding => ({ embedding })),
        usage,
      },
    };
  }

  it('should extract embeddings', async () => {
    prepareJsonResponse();

    const { embeddings } = await model.doEmbed({ values: testValues });

    expect(embeddings).toStrictEqual(dummyEmbeddings);
  });

  it('should extract usage', async () => {
    prepareJsonResponse({
      usage: { total_bytes: 100, total_tokens: 20 },
    });

    const { usage } = await model.doEmbed({ values: testValues });

    expect(usage).toStrictEqual({ tokens: 20 });
  });

  it('should expose the raw response', async () => {
    prepareJsonResponse({
      headers: { 'test-header': 'test-value' },
    });

    const { response } = await model.doEmbed({ values: testValues });

    expect(response?.headers).toStrictEqual({
      'content-length': expect.any(String),
      'content-type': 'application/json',
      'test-header': 'test-value',
    });
    expect(response).toMatchSnapshot();
  });

  it('should pass the model and values with defaults', async () => {
    prepareJsonResponse();

    await model.doEmbed({ values: testValues });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      model: 'zembed-1',
      input: testValues,
      input_type: 'query',
      encoding_format: 'float',
    });
  });

  it('should pass input_type document when specified', async () => {
    prepareJsonResponse();

    const documentModel = provider.embeddingModel('zembed-1', {
      inputType: 'document',
    });
    await documentModel.doEmbed({ values: testValues });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      model: 'zembed-1',
      input: testValues,
      input_type: 'document',
      encoding_format: 'float',
    });
  });

  it('should pass optional dimensions and latency', async () => {
    prepareJsonResponse();

    const customModel = provider.embeddingModel('zembed-1', {
      dimensions: 640,
      latency: 'fast',
    });
    await customModel.doEmbed({ values: testValues });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      model: 'zembed-1',
      input: testValues,
      input_type: 'query',
      encoding_format: 'float',
      dimensions: 640,
      latency: 'fast',
    });
  });

  it('should pass headers', async () => {
    prepareJsonResponse();

    const customProvider = createZeroEntropy({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await customProvider.embedding('zembed-1').doEmbed({
      values: testValues,
      headers: {
        'Custom-Request-Header': 'request-header-value',
      },
    });

    const requestHeaders = server.calls[0].requestHeaders;

    expect(requestHeaders).toStrictEqual({
      authorization: 'Bearer test-api-key',
      'content-type': 'application/json',
      'custom-provider-header': 'provider-header-value',
      'custom-request-header': 'request-header-value',
    });
    expect(server.calls[0].requestUserAgent).toContain(
      'ai-sdk/zeroentropy/0.0.0-test',
    );
  });
});
