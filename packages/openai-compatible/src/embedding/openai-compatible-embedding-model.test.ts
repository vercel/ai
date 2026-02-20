import { describe, it, expect } from 'vitest';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { createOpenAICompatible } from '../openai-compatible-provider';

const dummyEmbeddings = [
  [0.1, 0.2, 0.3, 0.4, 0.5],
  [0.6, 0.7, 0.8, 0.9, 1.0],
];
const testValues = ['sunny day at the beach', 'rainy day in the city'];

const provider = createOpenAICompatible({
  baseURL: 'https://my.api.com/v1/',
  name: 'test-provider',
  headers: {
    Authorization: `Bearer test-api-key`,
  },
});
const model = provider.embeddingModel('text-embedding-3-large');

const server = createTestServer({
  'https://my.api.com/v1/embeddings': {},
});

const defaultBody = {
  object: 'list',
  data: dummyEmbeddings.map((embedding, i) => ({
    object: 'embedding',
    index: i,
    embedding,
  })),
  model: 'text-embedding-3-large',
  usage: { prompt_tokens: 8, total_tokens: 8 },
};

describe('doEmbed', () => {
  it('should extract embedding', async () => {
    server.urls['https://my.api.com/v1/embeddings'].response = {
      type: 'json-value',
      body: defaultBody,
    };

    const { embeddings } = await model.doEmbed({ values: testValues });

    expect(embeddings).toStrictEqual(dummyEmbeddings);
  });

  it('should expose the raw response headers', async () => {
    server.urls['https://my.api.com/v1/embeddings'].response = {
      type: 'json-value',
      headers: { 'test-header': 'test-value' },
      body: defaultBody,
    };

    const { response } = await model.doEmbed({ values: testValues });

    expect(response?.headers).toStrictEqual({
      'content-length': '236',
      'content-type': 'application/json',
      'test-header': 'test-value',
    });
  });

  it('should extract usage', async () => {
    server.urls['https://my.api.com/v1/embeddings'].response = {
      type: 'json-value',
      body: {
        ...defaultBody,
        usage: { prompt_tokens: 20, total_tokens: 20 },
      },
    };

    const { usage } = await model.doEmbed({ values: testValues });

    expect(usage).toStrictEqual({ tokens: 20 });
  });

  it('should pass the model and the values', async () => {
    server.urls['https://my.api.com/v1/embeddings'].response = {
      type: 'json-value',
      body: defaultBody,
    };

    await model.doEmbed({ values: testValues });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      model: 'text-embedding-3-large',
      input: testValues,
      encoding_format: 'float',
    });
  });

  it('should pass the dimensions setting', async () => {
    server.urls['https://my.api.com/v1/embeddings'].response = {
      type: 'json-value',
      body: defaultBody,
    };

    await provider.embeddingModel('text-embedding-3-large').doEmbed({
      values: testValues,
      providerOptions: {
        openaiCompatible: {
          dimensions: 64,
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      model: 'text-embedding-3-large',
      input: testValues,
      encoding_format: 'float',
      dimensions: 64,
    });
  });

  it('should pass settings with deprecated openai-compatible key and emit warning', async () => {
    server.urls['https://my.api.com/v1/embeddings'].response = {
      type: 'json-value',
      body: defaultBody,
    };

    const result = await provider
      .embeddingModel('text-embedding-3-large')
      .doEmbed({
        values: testValues,
        providerOptions: {
          'openai-compatible': {
            dimensions: 64,
          },
        },
      });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      model: 'text-embedding-3-large',
      input: testValues,
      encoding_format: 'float',
      dimensions: 64,
    });

    expect(result.warnings).toContainEqual({
      type: 'other',
      message: `The 'openai-compatible' key in providerOptions is deprecated. Use 'openaiCompatible' instead.`,
    });
  });

  it('should pass headers', async () => {
    server.urls['https://my.api.com/v1/embeddings'].response = {
      type: 'json-value',
      body: defaultBody,
    };

    const provider = createOpenAICompatible({
      baseURL: 'https://my.api.com/v1/',
      name: 'test-provider',
      headers: {
        Authorization: `Bearer test-api-key`,
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.embeddingModel('text-embedding-3-large').doEmbed({
      values: testValues,
      headers: {
        'Custom-Request-Header': 'request-header-value',
      },
    });

    expect(server.calls[0].requestHeaders).toStrictEqual({
      authorization: 'Bearer test-api-key',
      'content-type': 'application/json',
      'custom-provider-header': 'provider-header-value',
      'custom-request-header': 'request-header-value',
    });
  });
});
