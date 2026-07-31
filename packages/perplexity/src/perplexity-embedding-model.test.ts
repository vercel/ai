import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it, vi } from 'vitest';
import { createPerplexity } from './perplexity-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

/**
 * Encodes signed int8 values the way Perplexity's `base64_int8` format does,
 * so tests can assert exact decoded vectors.
 */
function encodeInt8(values: number[]): string {
  const int8 = new Int8Array(values);
  return convertUint8ArrayToBase64(
    new Uint8Array(int8.buffer, int8.byteOffset, int8.byteLength),
  );
}

const dummyEmbeddings = [
  [1, -2, 3, 127, -128],
  [-1, 2, -3, 100, -50],
];
const testValues = ['sunny day at the beach', 'rainy day in the city'];

const provider = createPerplexity({ apiKey: 'test-api-key' });
const model = provider.embedding('pplx-embed-v1-4b');

const server = createTestServer({
  'https://api.perplexity.ai/v1/embeddings': {},
});

describe('doEmbed', () => {
  function prepareJsonResponse({
    embeddings = dummyEmbeddings,
    usage = { prompt_tokens: 8, total_tokens: 8 },
    headers,
  }: {
    embeddings?: number[][];
    usage?: {
      prompt_tokens: number;
      total_tokens: number;
      cost?: { input_cost: number; total_cost: number; currency: string };
    };
    headers?: Record<string, string>;
  } = {}) {
    server.urls['https://api.perplexity.ai/v1/embeddings'].response = {
      type: 'json-value',
      headers,
      body: {
        object: 'list',
        data: embeddings.map((embedding, i) => ({
          object: 'embedding',
          index: i,
          embedding: encodeInt8(embedding),
        })),
        model: 'pplx-embed-v1-4b',
        usage,
      },
    };
  }

  it('should decode base64 int8 embeddings into signed number vectors', async () => {
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

  it('should surface the cost breakdown as provider metadata', async () => {
    prepareJsonResponse({
      usage: {
        prompt_tokens: 8,
        total_tokens: 8,
        cost: { input_cost: 0.0001, total_cost: 0.0001, currency: 'USD' },
      },
    });

    const { providerMetadata } = await model.doEmbed({ values: testValues });

    expect(providerMetadata).toStrictEqual({
      perplexity: {
        cost: { inputCost: 0.0001, totalCost: 0.0001, currency: 'USD' },
      },
    });
  });

  it('should omit provider metadata when no cost is returned', async () => {
    prepareJsonResponse();

    const { providerMetadata } = await model.doEmbed({ values: testValues });

    expect(providerMetadata).toBeUndefined();
  });

  it('should expose the raw response headers', async () => {
    prepareJsonResponse({
      headers: { 'test-header': 'test-value' },
    });

    const { response } = await model.doEmbed({ values: testValues });

    expect(response?.headers).toStrictEqual({
      // default headers:
      'content-length': expect.any(String),
      'content-type': 'application/json',

      // custom header
      'test-header': 'test-value',
    });
  });

  it('should pass the model, values, and default encoding format', async () => {
    prepareJsonResponse();

    await model.doEmbed({ values: testValues });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      model: 'pplx-embed-v1-4b',
      input: testValues,
      encoding_format: 'base64_int8',
    });
  });

  it('should pass dimensions and encoding format provider options', async () => {
    prepareJsonResponse();

    await model.doEmbed({
      values: testValues,
      providerOptions: {
        perplexity: { dimensions: 256, encodingFormat: 'base64_binary' },
      },
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      model: 'pplx-embed-v1-4b',
      input: testValues,
      dimensions: 256,
      encoding_format: 'base64_binary',
    });
  });

  it('should pass headers', async () => {
    prepareJsonResponse();

    const provider = createPerplexity({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.embedding('pplx-embed-v1-4b').doEmbed({
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
      `ai-sdk/perplexity/0.0.0-test`,
    );
  });

  it('should throw when exceeding the max embeddings per call', async () => {
    prepareJsonResponse();

    const tooManyValues = Array.from({ length: 513 }, (_, i) => `value ${i}`);

    await expect(model.doEmbed({ values: tooManyValues })).rejects.toThrow(
      /Too many values/,
    );
  });
});
