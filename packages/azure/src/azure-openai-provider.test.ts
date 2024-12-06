import {
  EmbeddingModelV1Embedding,
  LanguageModelV1Prompt,
} from '@ai-sdk/provider';
import { JsonTestServer } from '@ai-sdk/provider-utils/test';
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

describe('chat', () => {
  describe('doGenerate', () => {
    const server = new JsonTestServer(
      'https://test-resource.openai.azure.com/openai/deployments/test-deployment/chat/completions',
    );

    server.setupTestEnvironment();

    function prepareJsonResponse({ content = '' }: { content?: string } = {}) {
      server.responseBodyJson = {
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
      };
    }

    it('should set the correct default api version', async () => {
      prepareJsonResponse();

      await provider('test-deployment').doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

      const searchParams = await server.getRequestUrlSearchParams();
      expect(searchParams.get('api-version')).toStrictEqual(
        '2024-10-01-preview',
      );
    });

    it('should set the correct modified api version', async () => {
      prepareJsonResponse();

      await providerApiVersionChanged('test-deployment').doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

      const searchParams = await server.getRequestUrlSearchParams();
      expect(searchParams.get('api-version')).toStrictEqual(
        '2024-08-01-preview',
      );
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

      const requestHeaders = await server.getRequestHeaders();

      expect(requestHeaders).toStrictEqual({
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

      const requestUrl = await server.getRequestUrl();
      expect(requestUrl).toStrictEqual(
        'https://test-resource.openai.azure.com/openai/deployments/test-deployment/chat/completions?api-version=2024-10-01-preview',
      );
    });
  });
});

describe('completion', () => {
  describe('doGenerate', () => {
    const server = new JsonTestServer(
      'https://test-resource.openai.azure.com/openai/deployments/gpt-35-turbo-instruct/completions',
    );

    server.setupTestEnvironment();

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
      server.responseBodyJson = {
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
      };
    }

    it('should set the correct api version', async () => {
      prepareJsonCompletionResponse({ content: 'Hello World!' });

      await provider.completion('gpt-35-turbo-instruct').doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

      const searchParams = await server.getRequestUrlSearchParams();
      expect(searchParams.get('api-version')).toStrictEqual(
        '2024-10-01-preview',
      );
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

      const requestHeaders = await server.getRequestHeaders();

      expect(requestHeaders).toStrictEqual({
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
    const server = new JsonTestServer(
      'https://test-resource.openai.azure.com/openai/deployments/my-embedding/embeddings',
    );

    const model = provider.embedding('my-embedding');

    server.setupTestEnvironment();

    function prepareJsonResponse({
      embeddings = dummyEmbeddings,
    }: {
      embeddings?: EmbeddingModelV1Embedding[];
    } = {}) {
      server.responseBodyJson = {
        object: 'list',
        data: embeddings.map((embedding, i) => ({
          object: 'embedding',
          index: i,
          embedding,
        })),
        model: 'my-embedding',
        usage: { prompt_tokens: 8, total_tokens: 8 },
      };
    }

    it('should set the correct api version', async () => {
      prepareJsonResponse();

      await model.doEmbed({
        values: testValues,
      });

      const searchParams = await server.getRequestUrlSearchParams();
      expect(searchParams.get('api-version')).toStrictEqual(
        '2024-10-01-preview',
      );
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

      const requestHeaders = await server.getRequestHeaders();

      expect(requestHeaders).toStrictEqual({
        'api-key': 'test-api-key',
        'content-type': 'application/json',
        'custom-provider-header': 'provider-header-value',
        'custom-request-header': 'request-header-value',
      });
    });
  });
});
