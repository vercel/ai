import type { EmbeddingModelV4Embedding } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it, vi } from 'vitest';
import { createAlibaba } from './alibaba-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const dummyEmbeddings = [
  [0.1, 0.2, 0.3, 0.4, 0.5],
  [0.6, 0.7, 0.8, 0.9, 1.0],
];
const testValues = ['sunny day at the beach', 'rainy day in the city'];

const provider = createAlibaba({ apiKey: 'test-api-key' });
const model = provider.embeddingModel('text-embedding-v3');

const server = createTestServer({
  'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/embeddings': {},
});

describe('doEmbed', () => {
  function prepareJsonResponse({
    embeddings = dummyEmbeddings,
    usage = { prompt_tokens: 8, total_tokens: 8 },
    headers,
  }: {
    embeddings?: EmbeddingModelV4Embedding[];
    usage?: { prompt_tokens: number; total_tokens: number };
    headers?: Record<string, string>;
  } = {}) {
    server.urls[
      'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/embeddings'
    ].response = {
      type: 'json-value',
      headers,
      body: {
        object: 'list',
        data: embeddings.map((embedding, i) => ({
          object: 'embedding',
          embedding,
          index: i,
        })),
        model: 'text-embedding-v3',
        usage,
      },
    };
  }

  it('should extract embedding', async () => {
    prepareJsonResponse();

    const { embeddings } = await model.doEmbed({ values: testValues });

    expect(embeddings).toStrictEqual(dummyEmbeddings);
  });

  it('should extract usage', async () => {
    prepareJsonResponse({
      usage: { prompt_tokens: 20, total_tokens: 20 },
    });

    const { usage } = await model.doEmbed({ values: testValues });

    expect(usage).toStrictEqual({ tokens: 20 });
  });

  it('should pass correct request body', async () => {
    prepareJsonResponse();

    await model.doEmbed({ values: testValues });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      model: 'text-embedding-v3',
      input: testValues,
      encoding_format: 'float',
    });
  });

  it('should pass provider options', async () => {
    prepareJsonResponse();

    await model.doEmbed({
      values: testValues,
      providerOptions: {
        alibaba: {
          dimensions: 512,
          text_type: 'query',
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      dimensions: 512,
      text_type: 'query',
    });
  });

  it('should throw when too many values are provided', async () => {
    const manyValues = Array.from({ length: 51 }, (_, i) => `text ${i}`);

    await expect(model.doEmbed({ values: manyValues })).rejects.toThrowError(
      /Too many values/,
    );
  });

  it('should respect per-model maxEmbeddingsPerCall', () => {
    const v4Model = provider.embeddingModel('text-embedding-v4');
    expect(v4Model.maxEmbeddingsPerCall).toBe(10);

    const v3Model = provider.embeddingModel('text-embedding-v3');
    expect(v3Model.maxEmbeddingsPerCall).toBe(50);
  });
});
