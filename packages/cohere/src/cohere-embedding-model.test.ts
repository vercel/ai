import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { createCohere } from './cohere-provider';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { CohereEmbeddingModelOptions } from './cohere-embedding-model-options';
import type { CohereChatLanguageModelV4ProviderOptions } from './cohere-chat-language-model';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const testValues = ['sunny day at the beach', 'rainy day in the city'];

const provider = createCohere({ apiKey: 'test-api-key' });
const model = provider.embeddingModel('embed-english-v3.0');

const server = createTestServer({
  'https://api.cohere.com/v2/embed': {},
});

function prepareJsonFixtureResponse(
  filename: string,
  headers?: Record<string, string>,
) {
  server.urls['https://api.cohere.com/v2/embed'].response = {
    type: 'json-value',
    headers,
    body: JSON.parse(
      fs.readFileSync(`src/__fixtures__/${filename}.json`, 'utf8'),
    ),
  };
}

describe('doEmbed', () => {
  beforeEach(() => {
    prepareJsonFixtureResponse('cohere-embedding');
  });

  it('should extract embedding', async () => {
    const { embeddings } = await model.doEmbed({ values: testValues });

    expect(embeddings).toMatchInlineSnapshot(`
      [
        [
          0.03302002,
          0.020904541,
          -0.019744873,
          -0.0625,
          0.04437256,
        ],
        [
          -0.04660034,
          0.00037765503,
          -0.061157227,
          -0.08239746,
          -0.010360718,
        ],
      ]
    `);
  });

  it('should expose the raw response', async () => {
    prepareJsonFixtureResponse('cohere-embedding', {
      'test-header': 'test-value',
    });

    const { response } = await model.doEmbed({ values: testValues });

    expect(response?.headers).toMatchInlineSnapshot(`
      {
        "content-length": "363",
        "content-type": "application/json",
        "test-header": "test-value",
      }
    `);
    expect(response).toMatchSnapshot();
  });

  it('should extract usage', async () => {
    const { usage } = await model.doEmbed({ values: testValues });

    expect(usage).toMatchInlineSnapshot(`
      {
        "tokens": 10,
      }
    `);
  });

  it('should pass the model and the values', async () => {
    await model.doEmbed({ values: testValues });

    expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
      {
        "embedding_types": [
          "float",
        ],
        "input_type": "search_query",
        "model": "embed-english-v3.0",
        "texts": [
          "sunny day at the beach",
          "rainy day in the city",
        ],
      }
    `);
  });

  it('should pass the input_type setting', async () => {
    await provider.embeddingModel('embed-english-v3.0').doEmbed({
      values: testValues,
      providerOptions: {
        cohere: {
          inputType: 'search_document',
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
      {
        "embedding_types": [
          "float",
        ],
        "input_type": "search_document",
        "model": "embed-english-v3.0",
        "texts": [
          "sunny day at the beach",
          "rainy day in the city",
        ],
      }
    `);
  });

  describe('embeddingType', () => {
    it.each([
      {
        embeddingType: 'float',
        embeddings: [
          [0.25, -0.5],
          [0.75, 0],
        ],
      },
      {
        embeddingType: 'int8',
        embeddings: [
          [-128, 127],
          [0, -1],
        ],
      },
      {
        embeddingType: 'uint8',
        embeddings: [
          [0, 255],
          [128, 1],
        ],
      },
      {
        embeddingType: 'binary',
        embeddings: [
          [-128, 127],
          [0, -1],
        ],
      },
      {
        embeddingType: 'ubinary',
        embeddings: [
          [0, 255],
          [128, 1],
        ],
      },
    ] as const)(
      'should request and return $embeddingType embeddings without conversion',
      async ({ embeddingType, embeddings }) => {
        const responseBody = {
          embeddings: {
            [embeddingType]: embeddings,
            // Ignore unrelated formats, including ones we do not support.
            base64: ['extra-format'],
          },
          meta: { billed_units: { input_tokens: 10 } },
        };
        server.urls['https://api.cohere.com/v2/embed'].response = {
          type: 'json-value',
          body: responseBody,
        };

        const result = await model.doEmbed({
          values: testValues,
          providerOptions: {
            cohere: { embeddingType, inputType: 'search_document' },
          },
        });

        expect(await server.calls[0].requestBodyJson).toEqual({
          model: 'embed-english-v3.0',
          texts: testValues,
          embedding_types: [embeddingType],
          input_type: 'search_document',
        });
        expect(result.embeddings).toEqual(embeddings);
        expect(result.usage).toEqual({ tokens: 10 });
        expect(result.warnings).toEqual([]);
        expect(result.response?.body).toEqual(responseBody);
      },
    );

    it('should return the selected format when float embeddings are also present', async () => {
      server.urls['https://api.cohere.com/v2/embed'].response = {
        type: 'json-value',
        body: {
          embeddings: {
            float: [[0.1], [0.2]],
            int8: [[10], [20]],
          },
          meta: { billed_units: { input_tokens: 10 } },
        },
      };

      const { embeddings } = await model.doEmbed({
        values: testValues,
        providerOptions: { cohere: { embeddingType: 'int8' } },
      });

      expect(embeddings).toEqual([[10], [20]]);
    });

    it.each(['float', 'int8', 'uint8', 'binary', 'ubinary'])(
      'should reject a response missing the requested %s embeddings',
      async embeddingType => {
        server.urls['https://api.cohere.com/v2/embed'].response = {
          type: 'json-value',
          body: {
            embeddings: embeddingType === 'float' ? {} : { float: [[0.1]] },
            meta: { billed_units: { input_tokens: 10 } },
          },
        };

        await expect(
          model.doEmbed({
            values: testValues,
            providerOptions: {
              cohere: { embeddingType },
            } as CohereChatLanguageModelV4ProviderOptions,
          }),
        ).rejects.toThrow('Invalid JSON response');
      },
    );

    it('should reject non-numeric embeddings in the selected format', async () => {
      server.urls['https://api.cohere.com/v2/embed'].response = {
        type: 'json-value',
        body: {
          embeddings: { int8: [['invalid']] },
          meta: { billed_units: { input_tokens: 10 } },
        },
      };

      await expect(
        model.doEmbed({
          values: testValues,
          providerOptions: { cohere: { embeddingType: 'int8' } },
        }),
      ).rejects.toThrow('Invalid JSON response');
    });

    it.each(['base64', 'invalid', ['float', 'int8'], null])(
      'should reject an unsupported embeddingType %j before sending a request',
      async embeddingType => {
        await expect(
          model.doEmbed({
            values: testValues,
            providerOptions: {
              cohere: {
                embeddingType,
              },
            } as CohereChatLanguageModelV4ProviderOptions,
          }),
        ).rejects.toThrow('invalid cohere provider options');
        expect(server.calls).toHaveLength(0);
      },
    );
  });

  it('should pass the output_dimension setting', async () => {
    await provider.embeddingModel('embed-v4.0').doEmbed({
      values: testValues,
      providerOptions: {
        cohere: {
          outputDimension: 256,
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
      {
        "embedding_types": [
          "float",
        ],
        "input_type": "search_query",
        "model": "embed-v4.0",
        "output_dimension": 256,
        "texts": [
          "sunny day at the beach",
          "rainy day in the city",
        ],
      }
    `);
  });

  describe.each(['embed-v5.0-pro', 'embed-v5.0-fast'])(
    '%s output dimensions',
    modelId => {
      it.each([256, 512, 768, 1024, 1536, 2048])(
        'should pass output_dimension %i',
        async outputDimension => {
          await provider.embeddingModel(modelId).doEmbed({
            values: testValues,
            providerOptions: { cohere: { outputDimension } },
          });

          expect(await server.calls[0].requestBodyJson).toEqual({
            embedding_types: ['float'],
            input_type: 'search_query',
            model: modelId,
            output_dimension: outputDimension,
            texts: testValues,
          });
        },
      );

      it('should leave the default output dimension to the API', async () => {
        await provider.embeddingModel(modelId).doEmbed({ values: testValues });

        expect(await server.calls[0].requestBodyJson).not.toHaveProperty(
          'output_dimension',
        );
      });

      it('should reject an unsupported output dimension before sending a request', async () => {
        await expect(
          provider.embeddingModel(modelId).doEmbed({
            values: testValues,
            providerOptions: { cohere: { outputDimension: 1000 } },
          }),
        ).rejects.toThrow('invalid cohere provider options');
        expect(server.calls).toHaveLength(0);
      });
    },
  );

  it('should pass headers', async () => {
    const provider = createCohere({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.embeddingModel('embed-english-v3.0').doEmbed({
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
      `ai-sdk-cohere/0.0.0-test`,
    );
  });
});
