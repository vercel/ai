import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createCloudflareAIGateway,
  cloudflareAIGateway,
} from './cloudflare-ai-gateway-provider';
import { OpenAIChatLanguageModel } from '@ai-sdk/openai/internal';

// Mock version
vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

// Mock OpenAIChatLanguageModel
vi.mock('@ai-sdk/openai/internal', () => ({
  OpenAIChatLanguageModel: vi.fn(),
}));

const OpenAIChatLanguageModelMock = vi.mocked(OpenAIChatLanguageModel);

describe('CloudflareAIGatewayProvider', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    originalEnv = process.env;
    // Clear environment variables
    process.env = { ...originalEnv };
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_GATEWAY_ID;
    delete process.env.CLOUDFLARE_API_TOKEN;
    delete process.env.CLOUDFLARE_AI_GATEWAY_API_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('createCloudflareAIGateway', () => {
    describe('configuration validation', () => {
      it('should throw error when accountId is not provided', () => {
        expect(() =>
          createCloudflareAIGateway({
            gatewayId: 'test-gateway',
          }),
        ).toThrow('Cloudflare Account ID is required');
      });

      it('should throw error when gatewayId is not provided', () => {
        expect(() =>
          createCloudflareAIGateway({
            accountId: 'test-account',
          }),
        ).toThrow('Cloudflare Gateway ID is required');
      });

      it('should throw error when neither accountId nor gatewayId are provided', () => {
        expect(() => createCloudflareAIGateway()).toThrow(
          'Cloudflare Account ID is required',
        );
      });

      it('should load accountId from environment variable', () => {
        process.env.CLOUDFLARE_ACCOUNT_ID = 'env-account-id';
        process.env.CLOUDFLARE_GATEWAY_ID = 'env-gateway-id';

        const provider = createCloudflareAIGateway();
        provider('openai/gpt-4');

        const constructorCall = OpenAIChatLanguageModelMock.mock.calls[0];
        const config = constructorCall[1];

        expect(
          config.url({ path: '/v1/chat/completions', modelId: 'openai/gpt-4' }),
        ).toBe(
          'https://gateway.ai.cloudflare.com/v1/env-account-id/env-gateway-id/compat/v1/chat/completions',
        );
      });

      it('should prioritize options over environment variables', () => {
        process.env.CLOUDFLARE_ACCOUNT_ID = 'env-account-id';
        process.env.CLOUDFLARE_GATEWAY_ID = 'env-gateway-id';

        const provider = createCloudflareAIGateway({
          accountId: 'option-account-id',
          gatewayId: 'option-gateway-id',
        });
        provider('openai/gpt-4');

        const constructorCall = OpenAIChatLanguageModelMock.mock.calls[0];
        const config = constructorCall[1];

        expect(
          config.url({ path: '/v1/chat/completions', modelId: 'openai/gpt-4' }),
        ).toBe(
          'https://gateway.ai.cloudflare.com/v1/option-account-id/option-gateway-id/compat/v1/chat/completions',
        );
      });
    });

    describe('baseURL configuration', () => {
      it('should use default baseURL when not provided', () => {
        const provider = createCloudflareAIGateway({
          accountId: 'test-account',
          gatewayId: 'test-gateway',
        });
        provider('openai/gpt-4');

        const constructorCall = OpenAIChatLanguageModelMock.mock.calls[0];
        const config = constructorCall[1];

        expect(
          config.url({ path: '/v1/chat/completions', modelId: 'openai/gpt-4' }),
        ).toBe(
          'https://gateway.ai.cloudflare.com/v1/test-account/test-gateway/compat/v1/chat/completions',
        );
      });

      it('should use custom baseURL when provided', () => {
        const provider = createCloudflareAIGateway({
          accountId: 'test-account',
          gatewayId: 'test-gateway',
          baseURL: 'https://custom-gateway.example.com',
        });
        provider('openai/gpt-4');

        const constructorCall = OpenAIChatLanguageModelMock.mock.calls[0];
        const config = constructorCall[1];

        expect(
          config.url({ path: '/v1/chat/completions', modelId: 'openai/gpt-4' }),
        ).toBe('https://custom-gateway.example.com/v1/chat/completions');
      });

      it('should strip trailing slash from custom baseURL', () => {
        const provider = createCloudflareAIGateway({
          accountId: 'test-account',
          gatewayId: 'test-gateway',
          baseURL: 'https://custom-gateway.example.com/',
        });
        provider('openai/gpt-4');

        const constructorCall = OpenAIChatLanguageModelMock.mock.calls[0];
        const config = constructorCall[1];

        expect(
          config.url({ path: '/v1/chat/completions', modelId: 'openai/gpt-4' }),
        ).toBe('https://custom-gateway.example.com/v1/chat/completions');
      });
    });

    describe('authentication', () => {
      it('should include Authorization header when apiKey is provided', () => {
        const provider = createCloudflareAIGateway({
          accountId: 'test-account',
          gatewayId: 'test-gateway',
          apiKey: 'test-api-key',
        });
        provider('openai/gpt-4');

        const constructorCall = OpenAIChatLanguageModelMock.mock.calls[0];
        const config = constructorCall[1];
        const headers = config.headers();

        expect(headers.authorization).toBe('Bearer test-api-key');
        expect(headers['cf-aig-authorization']).toBeUndefined();
      });

      it('should include cf-aig-authorization header when cfApiToken is provided', () => {
        const provider = createCloudflareAIGateway({
          accountId: 'test-account',
          gatewayId: 'test-gateway',
          cfApiToken: 'cf-token-123',
        });
        provider('openai/gpt-4');

        const constructorCall = OpenAIChatLanguageModelMock.mock.calls[0];
        const config = constructorCall[1];
        const headers = config.headers();

        expect(headers['cf-aig-authorization']).toBe('Bearer cf-token-123');
        expect(headers.authorization).toBeUndefined();
      });

      it('should include both headers when apiKey and cfApiToken are provided', () => {
        const provider = createCloudflareAIGateway({
          accountId: 'test-account',
          gatewayId: 'test-gateway',
          apiKey: 'test-api-key',
          cfApiToken: 'cf-token-123',
        });
        provider('openai/gpt-4');

        const constructorCall = OpenAIChatLanguageModelMock.mock.calls[0];
        const config = constructorCall[1];
        const headers = config.headers();

        expect(headers.authorization).toBe('Bearer test-api-key');
        expect(headers['cf-aig-authorization']).toBe('Bearer cf-token-123');
      });

      it('should load cfApiToken from environment variable', () => {
        process.env.CLOUDFLARE_API_TOKEN = 'env-cf-token';

        const provider = createCloudflareAIGateway({
          accountId: 'test-account',
          gatewayId: 'test-gateway',
        });
        provider('openai/gpt-4');

        const constructorCall = OpenAIChatLanguageModelMock.mock.calls[0];
        const config = constructorCall[1];
        const headers = config.headers();

        expect(headers['cf-aig-authorization']).toBe('Bearer env-cf-token');
      });

      it('should load fallback API key from environment variable when no auth is provided', () => {
        process.env.CLOUDFLARE_AI_GATEWAY_API_KEY = 'fallback-api-key';

        const provider = createCloudflareAIGateway({
          accountId: 'test-account',
          gatewayId: 'test-gateway',
        });
        provider('openai/gpt-4');

        const constructorCall = OpenAIChatLanguageModelMock.mock.calls[0];
        const config = constructorCall[1];
        const headers = config.headers();

        expect(headers.authorization).toBe('Bearer fallback-api-key');
      });

      it('should not throw error when no authentication is provided', () => {
        expect(() => {
          const provider = createCloudflareAIGateway({
            accountId: 'test-account',
            gatewayId: 'test-gateway',
          });
          provider('openai/gpt-4');
        }).not.toThrow();
      });
    });

    describe('custom headers', () => {
      it('should include custom headers in requests', () => {
        const provider = createCloudflareAIGateway({
          accountId: 'test-account',
          gatewayId: 'test-gateway',
          headers: {
            'Custom-Header': 'custom-value',
            'Another-Header': 'another-value',
          },
        });
        provider('openai/gpt-4');

        const constructorCall = OpenAIChatLanguageModelMock.mock.calls[0];
        const config = constructorCall[1];
        const headers = config.headers();

        expect(headers['custom-header']).toBe('custom-value');
        expect(headers['another-header']).toBe('another-value');
      });

      it('should include user-agent header', () => {
        const provider = createCloudflareAIGateway({
          accountId: 'test-account',
          gatewayId: 'test-gateway',
        });
        provider('openai/gpt-4');

        const constructorCall = OpenAIChatLanguageModelMock.mock.calls[0];
        const config = constructorCall[1];
        const headers = config.headers();

        expect(headers['user-agent']).toBe(
          'ai-sdk/cloudflare-ai-gateway/0.0.0-test',
        );
      });

      it('should merge custom headers with user-agent', () => {
        const provider = createCloudflareAIGateway({
          accountId: 'test-account',
          gatewayId: 'test-gateway',
          headers: { 'Custom-Header': 'value' },
        });
        provider('openai/gpt-4');

        const constructorCall = OpenAIChatLanguageModelMock.mock.calls[0];
        const config = constructorCall[1];
        const headers = config.headers();

        expect(headers['custom-header']).toBe('value');
        expect(headers['user-agent']).toBe(
          'ai-sdk/cloudflare-ai-gateway/0.0.0-test',
        );
      });
    });

    describe('model creation', () => {
      it('should create language model with correct configuration', () => {
        const provider = createCloudflareAIGateway({
          accountId: 'test-account',
          gatewayId: 'test-gateway',
          apiKey: 'test-api-key',
        });

        provider('openai/gpt-4');

        expect(OpenAIChatLanguageModel).toHaveBeenCalledWith(
          'openai/gpt-4',
          expect.objectContaining({
            provider: 'cloudflare-ai-gateway',
            url: expect.any(Function),
            headers: expect.any(Function),
          }),
        );
      });

      it('should create chat model using chat method', () => {
        const provider = createCloudflareAIGateway({
          accountId: 'test-account',
          gatewayId: 'test-gateway',
        });

        provider.chat('anthropic/claude-3-5-sonnet-20241022');

        expect(OpenAIChatLanguageModel).toHaveBeenCalledWith(
          'anthropic/claude-3-5-sonnet-20241022',
          expect.objectContaining({
            provider: 'cloudflare-ai-gateway',
          }),
        );
      });

      it('should create language model using languageModel method', () => {
        const provider = createCloudflareAIGateway({
          accountId: 'test-account',
          gatewayId: 'test-gateway',
        });

        provider.languageModel('openai/gpt-4-turbo');

        expect(OpenAIChatLanguageModel).toHaveBeenCalledWith(
          'openai/gpt-4-turbo',
          expect.objectContaining({
            provider: 'cloudflare-ai-gateway',
          }),
        );
      });

      it('should throw error when languageModel is instantiated with new keyword', () => {
        const provider = createCloudflareAIGateway({
          accountId: 'test-account',
          gatewayId: 'test-gateway',
        });

        expect(() => {
          new (provider.languageModel as unknown as {
            (modelId: string): unknown;
            new (modelId: string): never;
          })('openai/gpt-4');
        }).toThrow();
      });
    });

    describe('custom fetch', () => {
      it('should pass custom fetch implementation to models', () => {
        const customFetch = vi.fn();
        const provider = createCloudflareAIGateway({
          accountId: 'test-account',
          gatewayId: 'test-gateway',
          fetch: customFetch,
        });

        provider('openai/gpt-4');

        const constructorCall = OpenAIChatLanguageModelMock.mock.calls[0];
        const config = constructorCall[1];

        expect(config.fetch).toBe(customFetch);
      });
    });

    describe('unsupported model types', () => {
      it('should throw error for embeddingModel', () => {
        const provider = createCloudflareAIGateway({
          accountId: 'test-account',
          gatewayId: 'test-gateway',
        });

        expect(() =>
          provider.embeddingModel('openai/text-embedding-3-small'),
        ).toThrow(
          "Embedding models are not supported through Cloudflare AI Gateway's OpenAI-compatible endpoint",
        );
      });

      it('should throw error for imageModel', () => {
        const provider = createCloudflareAIGateway({
          accountId: 'test-account',
          gatewayId: 'test-gateway',
        });

        expect(() => provider.imageModel('openai/dall-e-3')).toThrow(
          "Image models are not supported through Cloudflare AI Gateway's OpenAI-compatible endpoint",
        );
      });
    });

    describe('provider metadata', () => {
      it('should have correct specification version', () => {
        const provider = createCloudflareAIGateway({
          accountId: 'test-account',
          gatewayId: 'test-gateway',
        });

        expect(provider.specificationVersion).toBe('v3');
      });

      it('should expose languageModel method', () => {
        const provider = createCloudflareAIGateway({
          accountId: 'test-account',
          gatewayId: 'test-gateway',
        });

        expect(typeof provider.languageModel).toBe('function');
      });

      it('should expose chat method', () => {
        const provider = createCloudflareAIGateway({
          accountId: 'test-account',
          gatewayId: 'test-gateway',
        });

        expect(typeof provider.chat).toBe('function');
      });
    });
  });

  describe('default exported provider', () => {
    it('should return undefined when environment variables are not set', () => {
      // cloudflareAIGateway is initialized at module load time
      // Since we're in a test environment, it should be undefined
      expect(cloudflareAIGateway).toBeUndefined();
    });

    it('should allow using provider when environment variables are set', () => {
      process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account';
      process.env.CLOUDFLARE_GATEWAY_ID = 'test-gateway';

      // Create a new instance since the default one is already initialized
      const provider = createCloudflareAIGateway();

      expect(provider).toBeDefined();
      expect(typeof provider).toBe('function');
      expect(typeof provider.languageModel).toBe('function');
      expect(typeof provider.chat).toBe('function');
    });
  });

  describe('real-world usage scenarios', () => {
    it('should work with OpenAI provider through Cloudflare gateway', () => {
      const provider = createCloudflareAIGateway({
        accountId: 'my-account',
        gatewayId: 'my-gateway',
        apiKey: 'sk-openai-key-123',
      });

      provider('openai/gpt-4');

      const constructorCall = OpenAIChatLanguageModelMock.mock.calls[0];
      expect(constructorCall[0]).toBe('openai/gpt-4');

      const config = constructorCall[1];
      const headers = config.headers();
      expect(headers.authorization).toBe('Bearer sk-openai-key-123');
    });

    it('should work with Anthropic provider through Cloudflare gateway', () => {
      const provider = createCloudflareAIGateway({
        accountId: 'my-account',
        gatewayId: 'my-gateway',
        apiKey: 'sk-ant-key-123',
      });

      provider('anthropic/claude-3-5-sonnet-20241022');

      const constructorCall = OpenAIChatLanguageModelMock.mock.calls[0];
      expect(constructorCall[0]).toBe('anthropic/claude-3-5-sonnet-20241022');

      const config = constructorCall[1];
      const headers = config.headers();
      expect(headers.authorization).toBe('Bearer sk-ant-key-123');
    });

    it('should work with BYOK configuration using Cloudflare token', () => {
      const provider = createCloudflareAIGateway({
        accountId: 'my-account',
        gatewayId: 'my-gateway',
        cfApiToken: 'cf-byok-token-123',
      });

      provider('openai/gpt-4');

      const constructorCall = OpenAIChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      const headers = config.headers();

      expect(headers['cf-aig-authorization']).toBe('Bearer cf-byok-token-123');
      expect(headers.authorization).toBeUndefined();
    });

    it('should work with Unified Billing configuration', () => {
      const provider = createCloudflareAIGateway({
        accountId: 'my-account',
        gatewayId: 'my-gateway',
        cfApiToken: 'cf-unified-billing-token',
      });

      provider('openai/gpt-4');

      const constructorCall = OpenAIChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      const headers = config.headers();

      expect(headers['cf-aig-authorization']).toBe(
        'Bearer cf-unified-billing-token',
      );
    });

    it('should work with custom monitoring headers', () => {
      const provider = createCloudflareAIGateway({
        accountId: 'my-account',
        gatewayId: 'my-gateway',
        apiKey: 'test-key',
        headers: {
          'X-Request-ID': 'req-123',
          'X-User-ID': 'user-456',
        },
      });

      provider('openai/gpt-4');

      const constructorCall = OpenAIChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      const headers = config.headers();

      expect(headers['x-request-id']).toBe('req-123');
      expect(headers['x-user-id']).toBe('user-456');
    });
  });

  describe('edge cases', () => {
    it('should handle empty string environment variables', () => {
      process.env.CLOUDFLARE_ACCOUNT_ID = '';
      process.env.CLOUDFLARE_GATEWAY_ID = '';

      expect(() => createCloudflareAIGateway()).toThrow(
        'Cloudflare Account ID is required',
      );
    });

    it('should handle undefined options object', () => {
      expect(() => createCloudflareAIGateway()).toThrow(
        'Cloudflare Account ID is required',
      );
    });

    it('should handle model IDs with multiple slashes', () => {
      const provider = createCloudflareAIGateway({
        accountId: 'test-account',
        gatewayId: 'test-gateway',
      });

      provider('provider/model/version');

      expect(OpenAIChatLanguageModel).toHaveBeenCalledWith(
        'provider/model/version',
        expect.any(Object),
      );
    });

    it('should handle model IDs without provider prefix', () => {
      const provider = createCloudflareAIGateway({
        accountId: 'test-account',
        gatewayId: 'test-gateway',
      });

      provider('gpt-4');

      expect(OpenAIChatLanguageModel).toHaveBeenCalledWith(
        'gpt-4',
        expect.any(Object),
      );
    });
  });
});
