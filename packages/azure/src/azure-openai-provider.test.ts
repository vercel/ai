import {
  EmbeddingModelV3Embedding,
  LanguageModelV3,
  LanguageModelV3GenerateResult,
  LanguageModelV3Prompt,
} from '@ai-sdk/provider';
import {
  convertReadableStreamToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { OpenAIResponsesLanguageModel } from '@ai-sdk/openai/internal';
import { createAzure } from './azure-openai-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const TEST_PROMPT: LanguageModelV3Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

function prepareJsonFixtureResponse(
  filename: string,
  headers?: Record<string, string>,
) {
  server.urls[
    'https://test-resource.openai.azure.com/openai/v1/responses'
  ].response = {
    type: 'json-value',
    headers,
    body: JSON.parse(
      fs.readFileSync(`src/__fixtures__/${filename}.json`, 'utf8'),
    ),
  };
}

function prepareChunksFixtureResponse(
  filename: string,
  headers?: Record<string, string>,
) {
  const chunks = fs
    .readFileSync(`src/__fixtures__/${filename}.chunks.txt`, 'utf8')
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => `data: ${line}\n\n`);
  chunks.push('data: [DONE]\n\n');

  server.urls[
    'https://test-resource.openai.azure.com/openai/v1/responses'
  ].response = {
    type: 'stream-chunks',
    headers,
    chunks,
  };
}

function createModel(modelId: string) {
  return new OpenAIResponsesLanguageModel(modelId, {
    provider: 'azure.responses',
    url: ({ path }) =>
      `https://test-resource.openai.azure.com/openai/v1${path}`,
    headers: () => ({ Authorization: `Bearer APIKEY` }),
    generateId: mockId(),
    fileIdPrefixes: ['assistant-'],
  });
}

const provider = createAzure({
  resourceName: 'test-resource',
  apiKey: 'test-api-key',
});

const providerApiVersionChanged = createAzure({
  resourceName: 'test-resource',
  apiKey: 'test-api-key',
  apiVersion: '2025-04-01-preview',
});

const server = createTestServer({
  'https://test-resource.openai.azure.com/openai/v1/chat/completions': {},
  'https://test-resource.openai.azure.com/openai/v1/completions': {},
  'https://test-resource.openai.azure.com/openai/v1/embeddings': {},
  'https://test-resource.openai.azure.com/openai/v1/images/generations': {},
  'https://test-resource.openai.azure.com/openai/v1/responses': {},
  'https://test-resource.openai.azure.com/openai/v1/audio/transcriptions': {},
  'https://test-resource.openai.azure.com/openai/v1/audio/speech': {},
  'https://test-resource.openai.azure.com/openai/deployments/whisper-1/audio/transcriptions':
    {},
});

describe('responses (default language model)', () => {
  describe('doGenerate', () => {
    function prepareJsonResponse({
      content = '',
      usage = {
        input_tokens: 4,
        output_tokens: 30,
        total_tokens: 34,
      },
    } = {}) {
      server.urls[
        'https://test-resource.openai.azure.com/openai/v1/responses'
      ].response = {
        type: 'json-value',
        body: {
          id: 'resp_67c97c0203188190a025beb4a75242bc',
          object: 'response',
          created_at: 1741257730,
          status: 'completed',
          model: 'test-deployment',
          output: [
            {
              id: 'msg_67c97c02656c81908e080dfdf4a03cd1',
              type: 'message',
              status: 'completed',
              role: 'assistant',
              content: [
                {
                  type: 'output_text',
                  text: content,
                  annotations: [],
                },
              ],
            },
          ],
          usage,
          incomplete_details: null,
        },
      };
    }

    it('should set the correct default api version', async () => {
      prepareJsonResponse();

      await provider('test-deployment').doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(
        server.calls[0].requestUrlSearchParams.get('api-version'),
      ).toMatchInlineSnapshot(`"v1"`);
    });

    it('should set the correct modified api version', async () => {
      prepareJsonResponse();

      await providerApiVersionChanged('test-deployment').doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(
        server.calls[0].requestUrlSearchParams.get('api-version'),
      ).toMatchInlineSnapshot(`"2025-04-01-preview"`);
    });

    it('should pass headers', async () => {
      prepareJsonResponse();

      const provider = createAzure({
        resourceName: 'test-resource',
        apiKey: 'test-api-key',
        headers: {
          'Custom-Provider-Header': 'provider-header-value',
        },
      });

      await provider('test-deployment').doGenerate({
        prompt: TEST_PROMPT,
        headers: {
          'Custom-Request-Header': 'request-header-value',
        },
      });

      expect(server.calls[0].requestHeaders).toMatchInlineSnapshot(`
        {
          "api-key": "test-api-key",
          "content-type": "application/json",
          "custom-provider-header": "provider-header-value",
          "custom-request-header": "request-header-value",
        }
      `);
      expect(server.calls[0].requestUserAgent).toContain(
        `ai-sdk/azure/0.0.0-test`,
      );
    });

    it('should use the baseURL correctly', async () => {
      prepareJsonResponse();

      const provider = createAzure({
        baseURL: 'https://test-resource.openai.azure.com/openai',
        apiKey: 'test-api-key',
      });

      await provider('test-deployment').doGenerate({
        prompt: TEST_PROMPT,
      });
      expect(server.calls[0].requestUrl).toMatchInlineSnapshot(
        `"https://test-resource.openai.azure.com/openai/v1/responses?api-version=v1"`,
      );
    });
  });
});

describe('chat', () => {
  describe('doGenerate', () => {
    function prepareJsonResponse({ content = '' }: { content?: string } = {}) {
      server.urls[
        'https://test-resource.openai.azure.com/openai/v1/chat/completions'
      ].response = {
        type: 'json-value',
        body: {
          id: 'chatcmpl-95ZTZkhr0mHNKqerQfiwkuox3PHAd',
          object: 'chat.completion',
          created: 1711115037,
          model: 'gpt-3.5-turbo-0125',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content,
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 4,
            total_tokens: 34,
            completion_tokens: 30,
          },
          system_fingerprint: 'fp_3bc1b5746c',
        },
      };
    }

    it('should set the correct default api version', async () => {
      prepareJsonResponse();

      await provider.chat('test-deployment').doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(
        server.calls[0].requestUrlSearchParams.get('api-version'),
      ).toMatchInlineSnapshot(`"v1"`);
    });

    it('should set the correct modified api version', async () => {
      prepareJsonResponse();

      await providerApiVersionChanged.chat('test-deployment').doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(
        server.calls[0].requestUrlSearchParams.get('api-version'),
      ).toMatchInlineSnapshot(`"2025-04-01-preview"`);
    });

    it('should pass headers', async () => {
      prepareJsonResponse();

      const provider = createAzure({
        resourceName: 'test-resource',
        apiKey: 'test-api-key',
        headers: {
          'Custom-Provider-Header': 'provider-header-value',
        },
      });

      await provider.chat('test-deployment').doGenerate({
        prompt: TEST_PROMPT,
        headers: {
          'Custom-Request-Header': 'request-header-value',
        },
      });

      expect(server.calls[0].requestHeaders).toMatchInlineSnapshot(`
        {
          "api-key": "test-api-key",
          "content-type": "application/json",
          "custom-provider-header": "provider-header-value",
          "custom-request-header": "request-header-value",
        }
      `);
      expect(server.calls[0].requestUserAgent).toContain(
        `ai-sdk/azure/0.0.0-test`,
      );
    });

    it('should use the baseURL correctly', async () => {
      prepareJsonResponse();

      const provider = createAzure({
        baseURL: 'https://test-resource.openai.azure.com/openai',
        apiKey: 'test-api-key',
      });

      await provider.chat('test-deployment').doGenerate({
        prompt: TEST_PROMPT,
      });
      expect(server.calls[0].requestUrl).toMatchInlineSnapshot(
        `"https://test-resource.openai.azure.com/openai/v1/chat/completions?api-version=v1"`,
      );
    });
  });
});

describe('completion', () => {
  describe('doGenerate', () => {
    function prepareJsonCompletionResponse({
      content = '',
      usage = {
        prompt_tokens: 4,
        total_tokens: 34,
        completion_tokens: 30,
      },
      finish_reason = 'stop',
    }: {
      content?: string;
      usage?: {
        prompt_tokens: number;
        total_tokens: number;
        completion_tokens: number;
      };
      finish_reason?: string;
    }) {
      server.urls[
        'https://test-resource.openai.azure.com/openai/v1/completions'
      ].response = {
        type: 'json-value',
        body: {
          id: 'cmpl-96cAM1v77r4jXa4qb2NSmRREV5oWB',
          object: 'text_completion',
          created: 1711363706,
          model: 'test-deployment',
          choices: [
            {
              text: content,
              index: 0,
              finish_reason,
            },
          ],
          usage,
        },
      };
    }

    it('should set the correct api version', async () => {
      prepareJsonCompletionResponse({ content: 'Hello World!' });

      await provider.completion('test-deployment').doGenerate({
        prompt: TEST_PROMPT,
      });
      expect(
        server.calls[0].requestUrlSearchParams.get('api-version'),
      ).toMatchInlineSnapshot(`"v1"`);
    });

    it('should pass headers', async () => {
      prepareJsonCompletionResponse({ content: 'Hello World!' });

      const provider = createAzure({
        resourceName: 'test-resource',
        apiKey: 'test-api-key',
        headers: {
          'Custom-Provider-Header': 'provider-header-value',
        },
      });

      await provider.completion('test-deployment').doGenerate({
        prompt: TEST_PROMPT,
        headers: {
          'Custom-Request-Header': 'request-header-value',
        },
      });

      expect(server.calls[0].requestHeaders).toMatchInlineSnapshot(`
        {
          "api-key": "test-api-key",
          "content-type": "application/json",
          "custom-provider-header": "provider-header-value",
          "custom-request-header": "request-header-value",
        }
      `);
      expect(server.calls[0].requestUserAgent).toContain(
        `ai-sdk/azure/0.0.0-test`,
      );
    });
  });
});

describe('transcription', () => {
  describe('doGenerate', () => {
    it('should use correct URL format', async () => {
      server.urls[
        'https://test-resource.openai.azure.com/openai/v1/audio/transcriptions'
      ].response = {
        type: 'json-value',
        body: {
          text: 'Hello, world!',
          segments: [],
          language: 'en',
          duration: 5.0,
        },
      };

      await provider.transcription('whisper-1').doGenerate({
        audio: new Uint8Array(),
        mediaType: 'audio/wav',
      });

      expect(server.calls[0].requestUrl).toMatchInlineSnapshot(
        `"https://test-resource.openai.azure.com/openai/v1/audio/transcriptions?api-version=v1"`,
      );
    });

    it('should use deployment-based URL format when useDeploymentBasedUrls is true', async () => {
      const providerWithDeploymentUrls = createAzure({
        resourceName: 'test-resource',
        apiKey: 'test-api-key',
        useDeploymentBasedUrls: true,
      });

      server.urls[
        'https://test-resource.openai.azure.com/openai/deployments/whisper-1/audio/transcriptions'
      ].response = {
        type: 'json-value',
        body: {
          text: 'Hello, world!',
          segments: [],
          language: 'en',
          duration: 5.0,
        },
      };

      await providerWithDeploymentUrls.transcription('whisper-1').doGenerate({
        audio: new Uint8Array(),
        mediaType: 'audio/wav',
      });

      expect(server.calls[0].requestUrl).toMatchInlineSnapshot(
        `"https://test-resource.openai.azure.com/openai/deployments/whisper-1/audio/transcriptions?api-version=v1"`,
      );
    });
  });
});

describe('speech', () => {
  describe('doGenerate', () => {
    it('should use correct URL format', async () => {
      server.urls[
        'https://test-resource.openai.azure.com/openai/v1/audio/speech'
      ].response = {
        type: 'json-value',
        body: new Uint8Array([1, 2, 3]),
      };

      await provider.speech('tts-1').doGenerate({
        text: 'Hello, world!',
      });

      expect(server.calls[0].requestUrl).toMatchInlineSnapshot(
        `"https://test-resource.openai.azure.com/openai/v1/audio/speech?api-version=v1"`,
      );
    });
  });
});

describe('embedding', () => {
  const dummyEmbeddings = [
    [0.1, 0.2, 0.3, 0.4, 0.5],
    [0.6, 0.7, 0.8, 0.9, 1.0],
  ];
  const testValues = ['sunny day at the beach', 'rainy day in the city'];

  describe('doEmbed', () => {
    const model = provider.embedding('my-embedding');

    function prepareJsonResponse({
      embeddings = dummyEmbeddings,
    }: {
      embeddings?: EmbeddingModelV3Embedding[];
    } = {}) {
      server.urls[
        'https://test-resource.openai.azure.com/openai/v1/embeddings'
      ].response = {
        type: 'json-value',
        body: {
          object: 'list',
          data: embeddings.map((embedding, i) => ({
            object: 'embedding',
            index: i,
            embedding,
          })),
          model: 'my-embedding',
          usage: { prompt_tokens: 8, total_tokens: 8 },
        },
      };
    }

    it('should set the correct api version', async () => {
      prepareJsonResponse();

      await model.doEmbed({
        values: testValues,
      });
      expect(
        server.calls[0].requestUrlSearchParams.get('api-version'),
      ).toMatchInlineSnapshot(`"v1"`);
    });

    it('should pass headers', async () => {
      prepareJsonResponse();

      const provider = createAzure({
        resourceName: 'test-resource',
        apiKey: 'test-api-key',
        headers: {
          'Custom-Provider-Header': 'provider-header-value',
        },
      });

      await provider.embedding('my-embedding').doEmbed({
        values: testValues,
        headers: {
          'Custom-Request-Header': 'request-header-value',
        },
      });

      expect(server.calls[0].requestHeaders).toMatchInlineSnapshot(`
        {
          "api-key": "test-api-key",
          "content-type": "application/json",
          "custom-provider-header": "provider-header-value",
          "custom-request-header": "request-header-value",
        }
      `);
      expect(server.calls[0].requestUserAgent).toContain(
        `ai-sdk/azure/0.0.0-test`,
      );
    });
  });
});

describe('image', () => {
  const prompt = 'A cute baby sea otter';

  describe('doGenerate', () => {
    function prepareJsonResponse() {
      server.urls[
        'https://test-resource.openai.azure.com/openai/v1/images/generations'
      ].response = {
        type: 'json-value',
        body: {
          created: 1733837122,
          data: [
            {
              revised_prompt:
                'A charming visual illustration of a baby sea otter swimming joyously.',
              b64_json: 'base64-image-1',
            },
            {
              b64_json: 'base64-image-2',
            },
          ],
        },
      };
    }

    it('should set the correct default api version', async () => {
      prepareJsonResponse();

      await provider.imageModel('dalle-deployment').doGenerate({
        prompt,
        files: undefined,
        mask: undefined,
        n: 1,
        size: '1024x1024',
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      expect(
        server.calls[0].requestUrlSearchParams.get('api-version'),
      ).toMatchInlineSnapshot(`"v1"`);
    });

    it('should set the correct modified api version', async () => {
      prepareJsonResponse();

      await providerApiVersionChanged
        .imageModel('dalle-deployment')
        .doGenerate({
          prompt,
          files: undefined,
          mask: undefined,
          n: 1,
          size: '1024x1024',
          aspectRatio: undefined,
          seed: undefined,
          providerOptions: {},
        });

      expect(
        server.calls[0].requestUrlSearchParams.get('api-version'),
      ).toMatchInlineSnapshot(`"2025-04-01-preview"`);
    });

    it('should pass headers', async () => {
      prepareJsonResponse();

      const provider = createAzure({
        resourceName: 'test-resource',
        apiKey: 'test-api-key',
        headers: {
          'Custom-Provider-Header': 'provider-header-value',
        },
      });

      await provider.imageModel('dalle-deployment').doGenerate({
        prompt,
        files: undefined,
        mask: undefined,
        n: 1,
        size: '1024x1024',
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
        headers: {
          'Custom-Request-Header': 'request-header-value',
        },
      });

      expect(server.calls[0].requestHeaders).toMatchInlineSnapshot(`
        {
          "api-key": "test-api-key",
          "content-type": "application/json",
          "custom-provider-header": "provider-header-value",
          "custom-request-header": "request-header-value",
        }
      `);
      expect(server.calls[0].requestUserAgent).toContain(
        `ai-sdk/azure/0.0.0-test`,
      );
    });

    it('should use the baseURL correctly', async () => {
      prepareJsonResponse();

      const provider = createAzure({
        baseURL: 'https://test-resource.openai.azure.com/openai',
        apiKey: 'test-api-key',
      });

      await provider.imageModel('dalle-deployment').doGenerate({
        prompt,
        files: undefined,
        mask: undefined,
        n: 1,
        size: '1024x1024',
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      expect(server.calls[0].requestUrl).toMatchInlineSnapshot(
        `"https://test-resource.openai.azure.com/openai/v1/images/generations?api-version=v1"`,
      );
    });

    it('should extract the generated images', async () => {
      prepareJsonResponse();

      const result = await provider.imageModel('dalle-deployment').doGenerate({
        prompt,
        files: undefined,
        mask: undefined,
        n: 1,
        size: '1024x1024',
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      expect(result.images).toMatchInlineSnapshot(`
        [
          "base64-image-1",
          "base64-image-2",
        ]
      `);
    });

    it('should send the correct request body', async () => {
      prepareJsonResponse();

      await provider.imageModel('dalle-deployment').doGenerate({
        prompt,
        files: undefined,
        mask: undefined,
        n: 2,
        size: '1024x1024',
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: { openai: { style: 'natural' } },
      });

      expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
        {
          "model": "dalle-deployment",
          "n": 2,
          "prompt": "A cute baby sea otter",
          "response_format": "b64_json",
          "size": "1024x1024",
          "style": "natural",
        }
      `);
    });
  });

  describe('imageModel method', () => {
    it('should create the same model as image method', () => {
      const imageModel = provider.imageModel('dalle-deployment');
      const imageModelAlias = provider.imageModel('dalle-deployment');

      expect(imageModel.provider).toBe(imageModelAlias.provider);
      expect(imageModel.modelId).toBe(imageModelAlias.modelId);
    });
  });
});

describe('responses', () => {
  describe('doGenerate', () => {
    describe('text', () => {
      beforeEach(() => prepareJsonFixtureResponse('azure-text.1'));

      it('should extract text content', async () => {
        const result = await createModel('test-deployment').doGenerate({
          prompt: TEST_PROMPT,
        });
        expect(result).toMatchSnapshot();
      });
    });

    describe('tool call', () => {
      beforeEach(() => prepareJsonFixtureResponse('azure-tool-call.1'));

      it('should extract tool call content', async () => {
        const result = await createModel('test-deployment').doGenerate({
          prompt: TEST_PROMPT,
        });
        expect(result).toMatchSnapshot();
      });
    });

    it('should extract usage', async () => {
      prepareJsonFixtureResponse('azure-text.1');

      const { usage } = await createModel('test-deployment').doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(usage).toMatchInlineSnapshot(`
        {
          "inputTokens": {
            "cacheRead": 0,
            "cacheWrite": undefined,
            "noCache": 11,
            "total": 11,
          },
          "outputTokens": {
            "reasoning": 0,
            "text": 11,
            "total": 11,
          },
          "raw": {
            "input_tokens": 11,
            "input_tokens_details": {
              "cached_tokens": 0,
            },
            "output_tokens": 11,
            "output_tokens_details": {
              "reasoning_tokens": 0,
            },
          },
        }
      `);
    });

    it('should extract response metadata', async () => {
      prepareJsonFixtureResponse('azure-text.1');

      const { response } = await createModel('test-deployment').doGenerate({
        prompt: TEST_PROMPT,
      });

      expect({
        id: response?.id,
        timestamp: response?.timestamp,
        modelId: response?.modelId,
      }).toMatchInlineSnapshot(`
        {
          "id": "resp_0d6bb044bb6ff37200698c51948054819385e24e2ad931ae6e",
          "modelId": "gpt-5.1",
          "timestamp": 2026-02-11T09:53:24.000Z,
        }
      `);
    });

    it('should extract response headers', async () => {
      prepareJsonFixtureResponse('azure-text.1', {
        'test-header': 'test-value',
      });

      const { response } = await createModel('test-deployment').doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(response?.headers).toMatchInlineSnapshot(`
        {
          "content-length": "1978",
          "content-type": "application/json",
          "test-header": "test-value",
        }
      `);
    });

    it('should set the correct api version', async () => {
      prepareJsonFixtureResponse('azure-text.1');

      await provider.responses('test-deployment').doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(
        server.calls[0].requestUrlSearchParams.get('api-version'),
      ).toMatchInlineSnapshot(`"v1"`);
    });

    it('should pass headers', async () => {
      prepareJsonFixtureResponse('azure-text.1');

      const provider = createAzure({
        resourceName: 'test-resource',
        apiKey: 'test-api-key',
        headers: {
          'Custom-Provider-Header': 'provider-header-value',
        },
      });

      await provider.responses('test-deployment').doGenerate({
        prompt: TEST_PROMPT,
        headers: {
          'Custom-Request-Header': 'request-header-value',
        },
      });

      expect(server.calls[0].requestHeaders).toMatchInlineSnapshot(`
        {
          "api-key": "test-api-key",
          "content-type": "application/json",
          "custom-provider-header": "provider-header-value",
          "custom-request-header": "request-header-value",
        }
      `);
      expect(server.calls[0].requestUserAgent).toContain(
        `ai-sdk/azure/0.0.0-test`,
      );
    });

    it('should use the baseURL correctly', async () => {
      prepareJsonFixtureResponse('azure-text.1');

      const provider = createAzure({
        baseURL: 'https://test-resource.openai.azure.com/openai',
        apiKey: 'test-api-key',
      });

      await provider.responses('test-deployment').doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(server.calls[0].requestUrl).toMatchInlineSnapshot(
        `"https://test-resource.openai.azure.com/openai/v1/responses?api-version=v1"`,
      );
    });

    it('should handle Azure file IDs with assistant- prefix', async () => {
      prepareJsonFixtureResponse('azure-text.1');

      const TEST_PROMPT_WITH_AZURE_FILE: LanguageModelV3Prompt = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analyze this image' },
            {
              type: 'file',
              mediaType: 'image/jpeg',
              data: 'assistant-abc123',
            },
          ],
        },
      ];

      await provider.responses('test-deployment').doGenerate({
        prompt: TEST_PROMPT_WITH_AZURE_FILE,
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.input).toEqual([
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'Analyze this image' },
            { type: 'input_image', file_id: 'assistant-abc123' },
          ],
        },
      ]);
    });

    it('should handle PDF files with assistant- prefix', async () => {
      prepareJsonFixtureResponse('azure-text.1');

      const TEST_PROMPT_WITH_AZURE_PDF: LanguageModelV3Prompt = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analyze this PDF' },
            {
              type: 'file',
              mediaType: 'application/pdf',
              data: 'assistant-pdf123',
            },
          ],
        },
      ];

      await provider.responses('test-deployment').doGenerate({
        prompt: TEST_PROMPT_WITH_AZURE_PDF,
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.input).toEqual([
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'Analyze this PDF' },
            { type: 'input_file', file_id: 'assistant-pdf123' },
          ],
        },
      ]);
    });

    it('should fall back to base64 for non-assistant file IDs', async () => {
      prepareJsonFixtureResponse('azure-text.1');

      const TEST_PROMPT_WITH_OPENAI_FILE: LanguageModelV3Prompt = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analyze this image' },
            {
              type: 'file',
              mediaType: 'image/jpeg',
              data: 'file-abc123',
            },
          ],
        },
      ];

      await provider.responses('test-deployment').doGenerate({
        prompt: TEST_PROMPT_WITH_OPENAI_FILE,
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.input).toEqual([
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'Analyze this image' },
            {
              type: 'input_image',
              image_url: 'data:image/jpeg;base64,file-abc123',
            },
          ],
        },
      ]);
    });

    it('should send include provider option for file search results', async () => {
      prepareJsonFixtureResponse('azure-text.1');

      const { warnings } = await provider
        .responses('test-deployment')
        .doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider',
              id: 'openai.file_search',
              name: 'file_search',
              args: {
                vectorStoreIds: ['vs_123', 'vs_456'],
                maxNumResults: 10,
                ranking: {
                  ranker: 'auto',
                },
              },
            },
          ],
        });

      expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
        {
          "input": [
            {
              "content": [
                {
                  "text": "Hello",
                  "type": "input_text",
                },
              ],
              "role": "user",
            },
          ],
          "model": "test-deployment",
          "tools": [
            {
              "max_num_results": 10,
              "ranking_options": {
                "ranker": "auto",
              },
              "type": "file_search",
              "vector_store_ids": [
                "vs_123",
                "vs_456",
              ],
            },
          ],
        }
      `);

      expect(warnings).toMatchInlineSnapshot(`[]`);
    });

    it('should forward include provider options to request body', async () => {
      prepareJsonFixtureResponse('azure-text.1');

      const { warnings } = await provider
        .responses('test-deployment')
        .doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            azure: {
              include: ['file_search_call.results'],
            },
          },
        });

      expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
        {
          "include": [
            "file_search_call.results",
          ],
          "input": [
            {
              "content": [
                {
                  "text": "Hello",
                  "type": "input_text",
                },
              ],
              "role": "user",
            },
          ],
          "model": "test-deployment",
        }
      `);

      expect(warnings).toMatchInlineSnapshot(`[]`);
    });

    describe('code interpreter tool', () => {
      let result: LanguageModelV3GenerateResult;

      beforeEach(async () => {
        prepareJsonFixtureResponse('azure-code-interpreter-tool.1');

        result = await createModel('test-deployment').doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider',
              id: 'openai.code_interpreter',
              name: 'code_interpreter',
              args: {},
            },
          ],
        });
      });

      it('should send request body with include and tool', async () => {
        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "include": [
              "code_interpreter_call.outputs",
            ],
            "input": [
              {
                "content": [
                  {
                    "text": "Hello",
                    "type": "input_text",
                  },
                ],
                "role": "user",
              },
            ],
            "model": "test-deployment",
            "tools": [
              {
                "container": {
                  "type": "auto",
                },
                "type": "code_interpreter",
              },
            ],
          }
        `);
      });

      it('should include code interpreter tool call and result in content', async () => {
        expect(result.content).toMatchSnapshot();
      });
    });

    describe('file search tool', () => {
      let result: LanguageModelV3GenerateResult;

      describe('without results include', () => {
        beforeEach(async () => {
          prepareJsonFixtureResponse('openai-file-search-tool.1');

          result = await createModel('test-deployment').doGenerate({
            prompt: TEST_PROMPT,
            tools: [
              {
                type: 'provider',
                id: 'openai.file_search',
                name: 'file_search',
                args: {
                  vectorStoreIds: ['vs_68caad8bd5d88191ab766cf043d89a18'],
                  maxNumResults: 5,
                  filters: {
                    key: 'author',
                    type: 'eq',
                    value: 'Jane Smith',
                  },
                  ranking: {
                    ranker: 'auto',
                    scoreThreshold: 0.5,
                  },
                },
              },
            ],
          });
        });

        it('should send request body with tool', async () => {
          expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "input": [
              {
                "content": [
                  {
                    "text": "Hello",
                    "type": "input_text",
                  },
                ],
                "role": "user",
              },
            ],
            "model": "test-deployment",
            "tools": [
              {
                "filters": {
                  "key": "author",
                  "type": "eq",
                  "value": "Jane Smith",
                },
                "max_num_results": 5,
                "ranking_options": {
                  "ranker": "auto",
                  "score_threshold": 0.5,
                },
                "type": "file_search",
                "vector_store_ids": [
                  "vs_68caad8bd5d88191ab766cf043d89a18",
                ],
              },
            ],
          }
        `);
        });

        it('should include file search tool call and result in content', async () => {
          expect(result.content).toMatchSnapshot();
        });
      });

      describe('with results include', () => {
        beforeEach(async () => {
          prepareJsonFixtureResponse('openai-file-search-tool.2');

          result = await createModel('test-deployment').doGenerate({
            prompt: TEST_PROMPT,
            tools: [
              {
                type: 'provider',
                id: 'openai.file_search',
                name: 'file_search',
                args: {
                  vectorStoreIds: ['vs_68caad8bd5d88191ab766cf043d89a18'],
                  maxNumResults: 5,
                  filters: {
                    key: 'author',
                    type: 'eq',
                    value: 'Jane Smith',
                  },
                  ranking: {
                    ranker: 'auto',
                    scoreThreshold: 0.5,
                  },
                },
              },
            ],
            providerOptions: {
              azure: {
                include: ['file_search_call.results'],
              },
            },
          });
        });

        it('should send request body with tool', async () => {
          expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
            {
              "include": [
                "file_search_call.results",
              ],
              "input": [
                {
                  "content": [
                    {
                      "text": "Hello",
                      "type": "input_text",
                    },
                  ],
                  "role": "user",
                },
              ],
              "model": "test-deployment",
              "tools": [
                {
                  "filters": {
                    "key": "author",
                    "type": "eq",
                    "value": "Jane Smith",
                  },
                  "max_num_results": 5,
                  "ranking_options": {
                    "ranker": "auto",
                    "score_threshold": 0.5,
                  },
                  "type": "file_search",
                  "vector_store_ids": [
                    "vs_68caad8bd5d88191ab766cf043d89a18",
                  ],
                },
              ],
            }
          `);
        });

        it('should include file search tool call and result in content', async () => {
          expect(result.content).toMatchSnapshot();
        });
      });
    });

    describe('web search preview tool', () => {
      let result: LanguageModelV3GenerateResult;

      beforeEach(async () => {
        prepareJsonFixtureResponse('azure-web-search-preview-tool.1');

        result = await createModel('test-deployment').doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider',
              id: 'openai.web_search_preview',
              name: 'web_search_preview',
              args: {},
            },
          ],
        });
      });
      it('should stream web search preview results include', async () => {
        expect(result.content).toMatchSnapshot();
      });
    });

    describe('reasoning', async () => {
      let result: Awaited<ReturnType<LanguageModelV3['doGenerate']>>;
      beforeEach(async () => {
        prepareJsonFixtureResponse('azure-reasoning-encrypted-content.1');

        result = await createModel('test-deployment').doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'function',
              name: 'calculator',
              inputSchema: {
                type: 'object',
                properties: {
                  a: { type: 'number' },
                  b: { type: 'number' },
                  op: { type: 'string' },
                },
                required: ['a', 'b'],
                additionalProperties: false,
              },
            },
          ],
          providerOptions: {
            azure: {
              reasoningEffort: 'high',
              maxCompletionTokens: 32_000,
              store: false,
              include: ['reasoning.encrypted_content'],
              reasoningSummary: 'auto',
              forceReasoning: true,
            },
          },
        });
      });
      it('should generate with reasoning encrypted content', async () => {
        expect(result).toMatchSnapshot();
      });
    });

    describe('image generation tool', () => {
      let result: LanguageModelV3GenerateResult;

      beforeEach(async () => {
        prepareJsonFixtureResponse('azure-image-generation-tool.1');

        result = await createModel('test-deployment').doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider',
              id: 'openai.image_generation',
              name: 'image_generation',
              args: {
                outputFormat: 'webp',
                quality: 'low',
                size: '1024x1024',
                partialImages: 2,
              },
            },
          ],
        });
      });

      it('should send request body with include and tool', async () => {
        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "input": [
              {
                "content": [
                  {
                    "text": "Hello",
                    "type": "input_text",
                  },
                ],
                "role": "user",
              },
            ],
            "model": "test-deployment",
            "tools": [
              {
                "output_format": "webp",
                "partial_images": 2,
                "quality": "low",
                "size": "1024x1024",
                "type": "image_generation",
              },
            ],
          }
        `);
      });

      it('should include generate image tool call and result in content', async () => {
        expect(result.content).toMatchSnapshot();
      });
    });
  });

  describe('doStream', () => {
    describe('text', () => {
      beforeEach(() => prepareChunksFixtureResponse('azure-text.1'));

      it('should stream text content', async () => {
        const { stream } = await createModel('test-deployment').doStream({
          prompt: TEST_PROMPT,
          includeRawChunks: false,
        });

        expect(await convertReadableStreamToArray(stream)).toMatchSnapshot();
      });
    });

    describe('tool call', () => {
      beforeEach(() => prepareChunksFixtureResponse('azure-tool-call.1'));

      it('should stream tool call content', async () => {
        const { stream } = await createModel('test-deployment').doStream({
          prompt: TEST_PROMPT,
          includeRawChunks: false,
        });

        expect(await convertReadableStreamToArray(stream)).toMatchSnapshot();
      });
    });

    it('should extract response headers', async () => {
      prepareChunksFixtureResponse('azure-text.1', {
        'test-header': 'test-value',
      });

      const { response } = await createModel('test-deployment').doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: false,
      });

      expect(response?.headers).toMatchInlineSnapshot(`
        {
          "cache-control": "no-cache",
          "connection": "keep-alive",
          "content-type": "text/event-stream",
          "test-header": "test-value",
        }
      `);
    });

    it('should handle file_citation annotations without optional fields in streaming', async () => {
      server.urls[
        'https://test-resource.openai.azure.com/openai/v1/responses'
      ].response = {
        type: 'stream-chunks',
        chunks: [
          `data:{"type":"response.content_part.added","item_id":"msg_456","output_index":0,"content_index":0,"part":{"type":"output_text","text":"","annotations":[]}}\n\n`,
          `data:{"type":"response.output_text.annotation.added","item_id":"msg_456","output_index":0,"content_index":0,"annotation_index":0,"annotation":{"type":"file_citation","file_id":"assistant-YRcoCqn3Fo2K4JgraG","filename":"resource1.json","index":145}}\n\n`,
          `data:{"type":"response.output_text.annotation.added","item_id":"msg_456","output_index":0,"content_index":0,"annotation_index":1,"annotation":{"type":"file_citation","file_id":"assistant-YRcoCqn3Fo2K4JgraG","filename":"resource1.json","index":192}}\n\n`,
          `data:{"type":"response.content_part.done","item_id":"msg_456","output_index":0,"content_index":0,"part":{"type":"output_text","text":"Answer for the specified years....","annotations":[{"type":"file_citation","file_id":"assistant-YRcoCqn3Fo2K4JgraG","filename":"resource1.json","index":145},{"type":"file_citation","file_id":"assistant-YRcoCqn3Fo2K4JgraG","filename":"resource1.json","index":192}]}}\n\n`,
          `data:{"type":"response.output_item.done","output_index":0,"item":{"id":"msg_456","type":"message","status":"completed","role":"assistant","content":[{"type":"output_text","text":"Answer for the specified years....","annotations":[{"type":"file_citation","file_id":"assistant-YRcoCqn3Fo2K4JgraG","filename":"resource1.json","index":145},{"type":"file_citation","file_id":"assistant-YRcoCqn3Fo2K4JgraG","filename":"resource1.json","index":192}]}]}}\n\n`,
          `data:{"type":"response.completed","response":{"id":"resp_456","object":"response","created_at":1234567890,"status":"completed","error":null,"incomplete_details":null,"instructions":null,"max_output_tokens":null,"model":"test-deployment","output":[{"id":"msg_456","type":"message","status":"completed","role":"assistant","content":[{"type":"output_text","text":"Answer for the specified years....","annotations":[{"type":"file_citation","file_id":"assistant-YRcoCqn3Fo2K4JgraG","filename":"resource1.json","index":145},{"type":"file_citation","file_id":"assistant-YRcoCqn3Fo2K4JgraG","filename":"resource1.json","index":192}]}]}],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":null,"summary":null},"store":true,"temperature":0,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[],"top_p":1,"truncation":"disabled","usage":{"input_tokens":50,"input_tokens_details":{"cached_tokens":0},"output_tokens":25,"output_tokens_details":{"reasoning_tokens":0},"total_tokens":75},"user":null,"metadata":{}}}\n\n`,
          'data: [DONE]\n\n',
        ],
      };

      const { stream } = await createModel('test-deployment').doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: false,
      });

      expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
        [
          {
            "type": "stream-start",
            "warnings": [],
          },
          {
            "filename": "resource1.json",
            "id": "id-0",
            "mediaType": "text/plain",
            "providerMetadata": {
              "azure": {
                "fileId": "assistant-YRcoCqn3Fo2K4JgraG",
                "index": 145,
                "type": "file_citation",
              },
            },
            "sourceType": "document",
            "title": "resource1.json",
            "type": "source",
          },
          {
            "filename": "resource1.json",
            "id": "id-1",
            "mediaType": "text/plain",
            "providerMetadata": {
              "azure": {
                "fileId": "assistant-YRcoCqn3Fo2K4JgraG",
                "index": 192,
                "type": "file_citation",
              },
            },
            "sourceType": "document",
            "title": "resource1.json",
            "type": "source",
          },
          {
            "id": "msg_456",
            "providerMetadata": {
              "azure": {
                "annotations": [
                  {
                    "file_id": "assistant-YRcoCqn3Fo2K4JgraG",
                    "filename": "resource1.json",
                    "index": 145,
                    "type": "file_citation",
                  },
                  {
                    "file_id": "assistant-YRcoCqn3Fo2K4JgraG",
                    "filename": "resource1.json",
                    "index": 192,
                    "type": "file_citation",
                  },
                ],
                "itemId": "msg_456",
              },
            },
            "type": "text-end",
          },
          {
            "finishReason": {
              "raw": undefined,
              "unified": "stop",
            },
            "providerMetadata": {
              "azure": {
                "responseId": null,
              },
            },
            "type": "finish",
            "usage": {
              "inputTokens": {
                "cacheRead": 0,
                "cacheWrite": undefined,
                "noCache": 50,
                "total": 50,
              },
              "outputTokens": {
                "reasoning": 0,
                "text": 25,
                "total": 25,
              },
              "raw": {
                "input_tokens": 50,
                "input_tokens_details": {
                  "cached_tokens": 0,
                },
                "output_tokens": 25,
                "output_tokens_details": {
                  "reasoning_tokens": 0,
                },
              },
            },
          },
        ]
      `);
    });

    it('should send code interpreter calls', async () => {
      prepareChunksFixtureResponse('azure-code-interpreter-tool.1');

      const result = await createModel('test-deployment').doStream({
        prompt: TEST_PROMPT,
        tools: [
          {
            type: 'provider',
            id: 'openai.code_interpreter',
            name: 'code_interpreter',
            args: {},
          },
        ],
      });

      expect(
        await convertReadableStreamToArray(result.stream),
      ).toMatchSnapshot();
    });

    it('should stream with reasoning encrypted content include reasoning-delta part', async () => {
      prepareChunksFixtureResponse('azure-reasoning-encrypted-content.1');

      const result = await createModel('test-deployment').doStream({
        prompt: TEST_PROMPT,
        tools: [
          {
            type: 'function',
            name: 'calculator',
            inputSchema: {
              type: 'object',
              properties: {
                a: { type: 'number' },
                b: { type: 'number' },
                op: { type: 'string' },
              },
              required: ['a', 'b'],
              additionalProperties: false,
            },
          },
        ],
        providerOptions: {
          openai: {
            reasoningEffort: 'high',
            maxCompletionTokens: 32_000,
            store: false,
            include: ['reasoning.encrypted_content'],
            reasoningSummary: 'auto',
            forceReasoning: true,
          },
        },
      });

      expect(
        await convertReadableStreamToArray(result.stream),
      ).toMatchSnapshot();
    });

    describe('file search tool', () => {
      it('should stream file search results without results include', async () => {
        prepareChunksFixtureResponse('openai-file-search-tool.1');

        const result = await createModel('test-deployment').doStream({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider',
              id: 'openai.file_search',
              name: 'file_search',
              args: {
                vectorStoreIds: ['vs_68caad8bd5d88191ab766cf043d89a18'],
              },
            },
          ],
        });

        expect(
          await convertReadableStreamToArray(result.stream),
        ).toMatchSnapshot();
      });

      it('should stream file search results with results include', async () => {
        prepareChunksFixtureResponse('openai-file-search-tool.2');

        const result = await createModel('test-deployment').doStream({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider',
              id: 'openai.file_search',
              name: 'file_search',
              args: {
                vectorStoreIds: ['vs_68caad8bd5d88191ab766cf043d89a18'],
              },
            },
          ],
          providerOptions: {
            openai: {
              include: ['file_search_call.results'],
            },
          },
        });

        expect(
          await convertReadableStreamToArray(result.stream),
        ).toMatchSnapshot();
      });
    });

    describe('web search preview tool', () => {
      it('should stream web search preview results include', async () => {
        prepareChunksFixtureResponse('azure-web-search-preview-tool.1');
        const result = await createModel('test-deployment').doStream({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider',
              id: 'openai.web_search_preview',
              name: 'web_search_preview',
              args: {},
            },
          ],
        });
        expect(
          await convertReadableStreamToArray(result.stream),
        ).toMatchSnapshot();
      });
    });

    describe('image generation tool', () => {
      it('should stream image generation tool results include', async () => {
        prepareChunksFixtureResponse('azure-image-generation-tool.1');
        const result = await createModel('test-deployment').doStream({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider',
              id: 'openai.image_generation',
              name: 'image_generation',
              args: {},
            },
          ],
        });

        expect(
          await convertReadableStreamToArray(result.stream),
        ).toMatchSnapshot();
      });
    });
  });
});
