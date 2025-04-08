import {
  EmbeddingModelV1Embedding,
  LanguageModelV1Prompt,
} from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/provider-utils/test';
import { createAzure } from './azure-openai-provider';

const TEST_PROMPT: LanguageModelV1Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const provider = createAzure({
  resourceName: 'test-resource',
  apiKey: 'test-api-key',
});

const providerApiVersionChanged = createAzure({
  resourceName: 'test-resource',
  apiKey: 'test-api-key',
  apiVersion: '2024-08-01-preview',
});

const server = createTestServer({
  'https://test-resource.openai.azure.com/openai/deployments/test-deployment/chat/completions':
    {},
  'https://test-resource.openai.azure.com/openai/deployments/gpt-35-turbo-instruct/completions':
    {},
  'https://test-resource.openai.azure.com/openai/deployments/my-embedding/embeddings':
    {},
  'https://test-resource.openai.azure.com/openai/deployments/dalle-deployment/images/generations':
    {},
  'https://test-resource.openai.azure.com/openai/responses': {},
});

describe('chat', () => {
  describe('doGenerate', () => {
    function prepareJsonResponse({ content = '' }: { content?: string } = {}) {
      server.urls[
        'https://test-resource.openai.azure.com/openai/deployments/test-deployment/chat/completions'
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

      await provider('test-deployment').doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

      expect(
        server.calls[0].requestUrlSearchParams.get('api-version'),
      ).toStrictEqual('2025-03-01-preview');
    });

    it('should set the correct modified api version', async () => {
      prepareJsonResponse();

      await providerApiVersionChanged('test-deployment').doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

      expect(
        server.calls[0].requestUrlSearchParams.get('api-version'),
      ).toStrictEqual('2024-08-01-preview');
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
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
        headers: {
          'Custom-Request-Header': 'request-header-value',
        },
      });

      expect(server.calls[0].requestHeaders).toStrictEqual({
        'api-key': 'test-api-key',
        'content-type': 'application/json',
        'custom-provider-header': 'provider-header-value',
        'custom-request-header': 'request-header-value',
      });
    });

    it('should use the baseURL correctly', async () => {
      prepareJsonResponse();

      const provider = createAzure({
        baseURL: 'https://test-resource.openai.azure.com/openai/deployments',
        apiKey: 'test-api-key',
      });

      await provider('test-deployment').doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });
      expect(server.calls[0].requestUrl).toStrictEqual(
        'https://test-resource.openai.azure.com/openai/deployments/test-deployment/chat/completions?api-version=2025-03-01-preview',
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
      logprobs = null,
      finish_reason = 'stop',
    }: {
      content?: string;
      usage?: {
        prompt_tokens: number;
        total_tokens: number;
        completion_tokens: number;
      };
      logprobs?: {
        tokens: string[];
        token_logprobs: number[];
        top_logprobs: Record<string, number>[];
      } | null;
      finish_reason?: string;
    }) {
      server.urls[
        'https://test-resource.openai.azure.com/openai/deployments/gpt-35-turbo-instruct/completions'
      ].response = {
        type: 'json-value',
        body: {
          id: 'cmpl-96cAM1v77r4jXa4qb2NSmRREV5oWB',
          object: 'text_completion',
          created: 1711363706,
          model: 'gpt-35-turbo-instruct',
          choices: [
            {
              text: content,
              index: 0,
              logprobs,
              finish_reason,
            },
          ],
          usage,
        },
      };
    }

    it('should set the correct api version', async () => {
      prepareJsonCompletionResponse({ content: 'Hello World!' });

      await provider.completion('gpt-35-turbo-instruct').doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });
      expect(
        server.calls[0].requestUrlSearchParams.get('api-version'),
      ).toStrictEqual('2025-03-01-preview');
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

      await provider.completion('gpt-35-turbo-instruct').doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
        headers: {
          'Custom-Request-Header': 'request-header-value',
        },
      });

      expect(server.calls[0].requestHeaders).toStrictEqual({
        'api-key': 'test-api-key',
        'content-type': 'application/json',
        'custom-provider-header': 'provider-header-value',
        'custom-request-header': 'request-header-value',
      });
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
      embeddings?: EmbeddingModelV1Embedding[];
    } = {}) {
      server.urls[
        'https://test-resource.openai.azure.com/openai/deployments/my-embedding/embeddings'
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
      ).toStrictEqual('2025-03-01-preview');
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

      expect(server.calls[0].requestHeaders).toStrictEqual({
        'api-key': 'test-api-key',
        'content-type': 'application/json',
        'custom-provider-header': 'provider-header-value',
        'custom-request-header': 'request-header-value',
      });
    });
  });
});

describe('image', () => {
  const prompt = 'A cute baby sea otter';

  describe('doGenerate', () => {
    function prepareJsonResponse() {
      server.urls[
        'https://test-resource.openai.azure.com/openai/deployments/dalle-deployment/images/generations'
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
        n: 1,
        size: '1024x1024',
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      expect(
        server.calls[0].requestUrlSearchParams.get('api-version'),
      ).toStrictEqual('2025-03-01-preview');
    });

    it('should set the correct modified api version', async () => {
      prepareJsonResponse();

      await providerApiVersionChanged
        .imageModel('dalle-deployment')
        .doGenerate({
          prompt,
          n: 1,
          size: '1024x1024',
          aspectRatio: undefined,
          seed: undefined,
          providerOptions: {},
        });

      expect(
        server.calls[0].requestUrlSearchParams.get('api-version'),
      ).toStrictEqual('2024-08-01-preview');
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
        n: 1,
        size: '1024x1024',
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
        headers: {
          'Custom-Request-Header': 'request-header-value',
        },
      });

      expect(server.calls[0].requestHeaders).toStrictEqual({
        'api-key': 'test-api-key',
        'content-type': 'application/json',
        'custom-provider-header': 'provider-header-value',
        'custom-request-header': 'request-header-value',
      });
    });

    it('should use the baseURL correctly', async () => {
      prepareJsonResponse();

      const provider = createAzure({
        baseURL: 'https://test-resource.openai.azure.com/openai/deployments',
        apiKey: 'test-api-key',
      });

      await provider.imageModel('dalle-deployment').doGenerate({
        prompt,
        n: 1,
        size: '1024x1024',
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      expect(server.calls[0].requestUrl).toStrictEqual(
        'https://test-resource.openai.azure.com/openai/deployments/dalle-deployment/images/generations?api-version=2025-03-01-preview',
      );
    });

    it('should extract the generated images', async () => {
      prepareJsonResponse();

      const result = await provider.imageModel('dalle-deployment').doGenerate({
        prompt,
        n: 1,
        size: '1024x1024',
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      expect(result.images).toStrictEqual(['base64-image-1', 'base64-image-2']);
    });

    it('should send the correct request body', async () => {
      prepareJsonResponse();

      await provider.imageModel('dalle-deployment').doGenerate({
        prompt,
        n: 2,
        size: '1024x1024',
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: { openai: { style: 'natural' } },
      });

      expect(await server.calls[0].requestBody).toStrictEqual({
        model: 'dalle-deployment',
        prompt,
        n: 2,
        size: '1024x1024',
        style: 'natural',
        response_format: 'b64_json',
      });
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
    function prepareJsonResponse({
      content = '',
      usage = {
        input_tokens: 4,
        output_tokens: 30,
        total_tokens: 34,
      },
    } = {}) {
      server.urls[
        'https://test-resource.openai.azure.com/openai/responses'
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

    it('should set the correct api version', async () => {
      prepareJsonResponse();

      await provider.responses('test-deployment').doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

      expect(
        server.calls[0].requestUrlSearchParams.get('api-version'),
      ).toStrictEqual('2025-03-01-preview');
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

      await provider.responses('test-deployment').doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
        headers: {
          'Custom-Request-Header': 'request-header-value',
        },
      });

      expect(server.calls[0].requestHeaders).toStrictEqual({
        'api-key': 'test-api-key',
        'content-type': 'application/json',
        'custom-provider-header': 'provider-header-value',
        'custom-request-header': 'request-header-value',
      });
    });

    it('should use the baseURL correctly', async () => {
      prepareJsonResponse();

      const provider = createAzure({
        baseURL: 'https://test-resource.openai.azure.com/openai',
        apiKey: 'test-api-key',
      });

      await provider.responses('test-deployment').doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

      expect(server.calls[0].requestUrl).toStrictEqual(
        'https://test-resource.openai.azure.com/openai/responses?api-version=2025-03-01-preview',
      );
    });
  });
});
