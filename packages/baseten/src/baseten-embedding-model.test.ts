import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { TooManyEmbeddingValuesForCallError } from '@ai-sdk/provider';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBaseten } from './baseten-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

/**
 * Exercises the real HTTP embedding path — no mocking of the
 * OpenAI-compatible model — which is what BEI deployments serve by default:
 * "Deployed embedding models are OpenAI compatible without any additional
 * settings" (https://docs.baseten.co/examples/bei).
 *
 * The native performance client is not involved here; see
 * baseten-provider.unit.test.ts for the opt-in path.
 */

const SYNC_URL =
  'https://model-123.api.baseten.co/environments/production/sync';
const EMBEDDINGS_URL = `${SYNC_URL}/v1/embeddings`;

const testValues = ['sunny day at the beach', 'rainy day in the city'];

const server = createTestServer({
  [EMBEDDINGS_URL]: {},
});

function prepareJsonResponse({
  embeddings = [
    [0.1, 0.2, 0.3],
    [0.4, 0.5, 0.6],
  ],
  promptTokens = 8,
  headers,
}: {
  embeddings?: number[][];
  promptTokens?: number;
  headers?: Record<string, string>;
} = {}) {
  server.urls[EMBEDDINGS_URL].response = {
    type: 'json-value',
    headers,
    body: {
      object: 'list',
      data: embeddings.map((embedding, index) => ({
        object: 'embedding',
        index,
        embedding,
      })),
      model: 'not-required',
      usage: { prompt_tokens: promptTokens, total_tokens: promptTokens },
    },
  };
}

describe('doEmbed', () => {
  beforeEach(() => {
    prepareJsonResponse();
  });

  it('should extract embeddings', async () => {
    const model = createBaseten({
      apiKey: 'test-api-key',
      modelURL: SYNC_URL,
    }).embeddingModel();

    const { embeddings } = await model.doEmbed({ values: testValues });

    expect(embeddings).toEqual([
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ]);
  });

  it('should extract usage from prompt_tokens', async () => {
    const model = createBaseten({
      apiKey: 'test-api-key',
      modelURL: SYNC_URL,
    }).embeddingModel();

    const { usage } = await model.doEmbed({ values: testValues });

    expect(usage).toEqual({ tokens: 8 });
  });

  it('should send the values and a model field', async () => {
    const model = createBaseten({
      apiKey: 'test-api-key',
      modelURL: SYNC_URL,
    }).embeddingModel();

    await model.doEmbed({ values: testValues });

    // BEI ignores the model value on a dedicated deployment — their own docs
    // pass "not-required" — but the field is part of the OpenAI shape.
    expect(await server.calls[0].requestBodyJson).toEqual({
      input: testValues,
      model: 'embeddings',
      encoding_format: 'float',
    });
  });

  it('should pass the api key as a bearer token', async () => {
    const model = createBaseten({
      apiKey: 'test-api-key',
      modelURL: SYNC_URL,
    }).embeddingModel();

    await model.doEmbed({ values: testValues });

    expect(server.calls[0].requestHeaders.authorization).toBe(
      'Bearer test-api-key',
    );
  });

  it('should expose real response headers rather than an empty object', async () => {
    prepareJsonResponse({ headers: { 'x-request-id': 'abc123' } });
    const model = createBaseten({
      apiKey: 'test-api-key',
      modelURL: SYNC_URL,
    }).embeddingModel();

    const { response } = await model.doEmbed({ values: testValues });

    expect(response?.headers?.['x-request-id']).toBe('abc123');
  });

  describe('modelURL forms', () => {
    it('should append /v1 to a bare /sync URL', async () => {
      const model = createBaseten({
        apiKey: 'test-api-key',
        modelURL: SYNC_URL,
      }).embeddingModel();

      await model.doEmbed({ values: testValues });

      expect(server.calls[0].requestUrl).toBe(EMBEDDINGS_URL);
    });

    it('should not double up /v1 for a /sync/v1 URL', async () => {
      const model = createBaseten({
        apiKey: 'test-api-key',
        modelURL: `${SYNC_URL}/v1`,
      }).embeddingModel();

      await model.doEmbed({ values: testValues });

      expect(server.calls[0].requestUrl).toBe(EMBEDDINGS_URL);
    });
  });

  describe('batch limit', () => {
    it('should accept 128 values', async () => {
      prepareJsonResponse({
        embeddings: Array.from({ length: 128 }, () => [0.1]),
      });
      const model = createBaseten({
        apiKey: 'test-api-key',
        modelURL: SYNC_URL,
      }).embeddingModel();

      const { embeddings } = await model.doEmbed({
        values: Array.from({ length: 128 }, (_, i) => `value ${i}`),
      });

      expect(embeddings).toHaveLength(128);
    });

    // `embedMany` reads maxEmbeddingsPerCall and splits larger inputs, so this
    // only surfaces for a direct doEmbed call.
    it('should reject more than 128 values', async () => {
      const model = createBaseten({
        apiKey: 'test-api-key',
        modelURL: SYNC_URL,
      }).embeddingModel();

      await expect(
        model.doEmbed({
          values: Array.from({ length: 129 }, (_, i) => `value ${i}`),
        }),
      ).rejects.toThrow(TooManyEmbeddingValuesForCallError);
    });
  });

  // Baseten sends `error` as a bare string from the Model APIs but lets
  // dedicated deployments pass through their server's OpenAI-shaped object.
  // Embeddings require a `modelURL`, so they always talk to a dedicated
  // deployment and the object form is the likelier one here. If the schema
  // stops matching either, the message silently degrades to the HTTP reason
  // phrase — empty over HTTP/2, which has none.
  it('should surface Baseten string-shaped error messages', async () => {
    server.urls[EMBEDDINGS_URL].response = {
      type: 'error',
      status: 403,
      body: JSON.stringify({ error: 'please check the api-key you provided' }),
    };
    const model = createBaseten({
      apiKey: 'test-api-key',
      modelURL: SYNC_URL,
    }).embeddingModel();

    await expect(model.doEmbed({ values: testValues })).rejects.toThrow(
      'please check the api-key you provided',
    );
  });

  it('should surface object-shaped error messages from a dedicated deployment', async () => {
    server.urls[EMBEDDINGS_URL].response = {
      type: 'error',
      status: 404,
      body: JSON.stringify({
        error: {
          code: 404,
          message: 'The model `not-a-real-model` does not exist.',
          param: 'model',
          type: 'NotFoundError',
        },
      }),
    };
    const model = createBaseten({
      apiKey: 'test-api-key',
      modelURL: SYNC_URL,
    }).embeddingModel();

    await expect(model.doEmbed({ values: testValues })).rejects.toThrow(
      'The model `not-a-real-model` does not exist.',
    );
  });
});
