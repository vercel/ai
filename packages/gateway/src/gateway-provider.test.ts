import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  gateway,
  createGatewayProvider,
  getGatewayAuthToken,
} from './gateway-provider';
import { GatewayFetchMetadata } from './gateway-fetch-metadata';
import { NoSuchModelError } from '@ai-sdk/provider';
import { getVercelOidcToken, getVercelRequestId } from './vercel-environment';
import { resolve } from '@ai-sdk/provider-utils';
import { GatewayLanguageModel } from './gateway-language-model';
import {
  GatewayAuthenticationError,
  GatewayInternalServerError,
} from './errors';
import { fail } from 'node:assert';

vi.mock('./gateway-language-model', () => ({
  GatewayLanguageModel: vi.fn(),
}));

vi.mock('./gateway-fetch-metadata', () => ({
  GatewayFetchMetadata: vi.fn(),
}));

vi.mock('./vercel-environment', () => ({
  getVercelOidcToken: vi.fn(),
  getVercelRequestId: vi.fn(),
}));

describe('GatewayProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getVercelOidcToken).mockResolvedValue('mock-oidc-token');
    vi.mocked(getVercelRequestId).mockResolvedValue('mock-request-id');
    if ('AI_GATEWAY_API_KEY' in process.env) {
      Reflect.deleteProperty(process.env, 'AI_GATEWAY_API_KEY');
    }
  });

  describe('createGatewayProvider', () => {
    it('should create provider with correct configuration', async () => {
      const options = {
        baseURL: 'https://api.example.com',
        apiKey: 'test-api-key',
        headers: { 'Custom-Header': 'value' },
      };

      const provider = createGatewayProvider(options);
      provider('test-model');

      expect(GatewayLanguageModel).toHaveBeenCalledWith(
        'test-model',
        expect.objectContaining({
          provider: 'gateway',
          baseURL: 'https://api.example.com',
          headers: expect.any(Function),
          fetch: undefined,
        }),
      );

      // Verify headers function
      const constructorCall = vi.mocked(GatewayLanguageModel).mock.calls[0];
      const config = constructorCall[1];
      const headers = await config.headers();

      expect(headers).toEqual({
        Authorization: 'Bearer test-api-key',
        'Custom-Header': 'value',
        'ai-gateway-protocol-version': expect.any(String),
      });
    });

    it('should use OIDC token when no API key is provided', async () => {
      const options = {
        baseURL: 'https://api.example.com',
        headers: { 'Custom-Header': 'value' },
      };

      const provider = createGatewayProvider(options);
      provider('test-model');

      const constructorCall = vi.mocked(GatewayLanguageModel).mock.calls[0];
      const config = constructorCall[1];
      const headers = await config.headers();

      expect(headers).toEqual({
        Authorization: 'Bearer mock-oidc-token',
        'Custom-Header': 'value',
        'ai-gateway-protocol-version': expect.any(String),
      });
    });

    it('should throw error when instantiated with new keyword', () => {
      const provider = createGatewayProvider({
        baseURL: 'https://api.example.com',
      });

      expect(() => {
        new (provider as unknown as {
          (modelId: string): unknown;
          new (modelId: string): never;
        })('test-model');
      }).toThrow(
        'The Gateway Provider model function cannot be called with the new keyword.',
      );
    });

    it('should throw NoSuchModelError for textEmbeddingModel', () => {
      const provider = createGatewayProvider({
        baseURL: 'https://api.example.com',
      });

      expect(() => {
        provider.textEmbeddingModel('test-model');
      }).toThrow(NoSuchModelError);
    });

    it('should fetch available models', async () => {
      const mockGetAvailableModels = vi.fn().mockResolvedValue({ models: [] });
      vi.mocked(GatewayFetchMetadata).mockImplementation(
        () =>
          ({
            getAvailableModels: mockGetAvailableModels,
          }) as unknown as InstanceType<typeof GatewayFetchMetadata>,
      );

      const options = {
        baseURL: 'https://api.example.com',
        apiKey: 'test-api-key',
      };

      const provider = createGatewayProvider(options);
      await provider.getAvailableModels();

      expect(GatewayFetchMetadata).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://api.example.com',
        }),
      );
      expect(mockGetAvailableModels).toHaveBeenCalled();
    });

    describe('metadata caching', () => {
      it('should cache metadata for the specified refresh interval', async () => {
        const mockGetAvailableModels = vi.fn().mockResolvedValue({
          models: [{ id: 'test-model', specification: {} }],
        });
        vi.mocked(GatewayFetchMetadata).mockImplementation(
          () =>
            ({
              getAvailableModels: mockGetAvailableModels,
            }) as unknown as InstanceType<typeof GatewayFetchMetadata>,
        );

        let currentTime = new Date('2024-01-01T00:00:00Z').getTime();
        const provider = createGatewayProvider({
          baseURL: 'https://api.example.com',
          metadataCacheRefreshMillis: 10000, // 10 seconds
          _internal: {
            currentDate: () => new Date(currentTime),
          },
        });

        // First call should fetch metadata
        await provider.getAvailableModels();
        expect(mockGetAvailableModels).toHaveBeenCalledTimes(1);

        // Second immediate call should use cache
        await provider.getAvailableModels();
        expect(mockGetAvailableModels).toHaveBeenCalledTimes(1);

        // Advance time by 9 seconds (should still use cache)
        currentTime += 9000;
        await provider.getAvailableModels();
        expect(mockGetAvailableModels).toHaveBeenCalledTimes(1);

        // Advance time past 10 seconds (should refresh)
        currentTime += 2000;
        await provider.getAvailableModels();
        expect(mockGetAvailableModels).toHaveBeenCalledTimes(2);
      });

      it('should use default 5 minute refresh interval when not specified', async () => {
        const mockGetAvailableModels = vi.fn().mockResolvedValue({
          models: [{ id: 'test-model', specification: {} }],
        });
        vi.mocked(GatewayFetchMetadata).mockImplementation(
          () =>
            ({
              getAvailableModels: mockGetAvailableModels,
            }) as unknown as InstanceType<typeof GatewayFetchMetadata>,
        );

        let currentTime = new Date('2024-01-01T00:00:00Z').getTime();
        const provider = createGatewayProvider({
          baseURL: 'https://api.example.com',
          _internal: {
            currentDate: () => new Date(currentTime),
          },
        });

        // First call should fetch metadata
        await provider.getAvailableModels();
        expect(mockGetAvailableModels).toHaveBeenCalledTimes(1);

        // Advance time by 4 minutes (should still use cache)
        currentTime += 4 * 60 * 1000;
        await provider.getAvailableModels();
        expect(mockGetAvailableModels).toHaveBeenCalledTimes(1);

        // Advance time past 5 minutes (should refresh)
        currentTime += 2 * 60 * 1000;
        await provider.getAvailableModels();
        expect(mockGetAvailableModels).toHaveBeenCalledTimes(2);
      });
    });

    it('should pass o11y headers to GatewayLanguageModel when environment variables are set', async () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        VERCEL_DEPLOYMENT_ID: 'test-deployment',
        VERCEL_ENV: 'test',
        VERCEL_REGION: 'iad1',
      };
      vi.mocked(getVercelRequestId).mockResolvedValue('test-request-id');

      try {
        const provider = createGatewayProvider({
          baseURL: 'https://api.example.com',
          apiKey: 'test-api-key',
        });
        provider('test-model');

        const constructorCall = vi.mocked(GatewayLanguageModel).mock.calls[0];
        const config = constructorCall[1];

        expect(config).toEqual(
          expect.objectContaining({
            provider: 'gateway',
            baseURL: 'https://api.example.com',
            o11yHeaders: expect.any(Function),
          }),
        );

        // Test that the o11yHeaders function returns the expected result
        const o11yHeaders = await resolve(config.o11yHeaders);
        expect(o11yHeaders).toEqual({
          'ai-o11y-deployment-id': 'test-deployment',
          'ai-o11y-environment': 'test',
          'ai-o11y-region': 'iad1',
          'ai-o11y-request-id': 'test-request-id',
        });
      } finally {
        process.env = originalEnv;
      }
    });

    it('should not include undefined o11y headers', async () => {
      const originalEnv = process.env;
      process.env = { ...originalEnv };
      process.env.DEPLOYMENT_ID = undefined;
      process.env.VERCEL_ENV = undefined;
      process.env.VERCEL_REGION = undefined;

      vi.mocked(getVercelRequestId).mockResolvedValue(undefined);

      try {
        const provider = createGatewayProvider({
          baseURL: 'https://api.example.com',
          apiKey: 'test-api-key',
        });
        provider('test-model');

        // Get the constructor call to check o11yHeaders
        const constructorCall = vi.mocked(GatewayLanguageModel).mock.calls[0];
        const config = constructorCall[1];

        expect(config).toEqual(
          expect.objectContaining({
            provider: 'gateway',
            baseURL: 'https://api.example.com',
            o11yHeaders: expect.any(Function),
          }),
        );

        // Test that the o11yHeaders function returns empty object
        const o11yHeaders = await resolve(config.o11yHeaders);
        expect(o11yHeaders).toEqual({});
      } finally {
        process.env = originalEnv;
      }
    });
  });

  describe('default exported provider', () => {
    it('should export a default provider instance', () => {
      expect(gateway).toBeDefined();
      expect(typeof gateway).toBe('function');
      expect(typeof gateway.languageModel).toBe('function');
      expect(typeof gateway.getAvailableModels).toBe('function');
    });

    it('should use the default baseURL when none is provided', async () => {
      // Reset the existing mock
      vi.mocked(GatewayFetchMetadata).mockReset();

      // Create a mock implementation that returns empty models
      const mockGetAvailableModels = vi.fn().mockResolvedValue({ models: [] });
      vi.mocked(GatewayFetchMetadata).mockImplementation(
        () =>
          ({
            getAvailableModels: mockGetAvailableModels,
          }) as unknown as InstanceType<typeof GatewayFetchMetadata>,
      );

      // Create a provider without specifying baseURL
      const testProvider = createGatewayProvider({
        apiKey: 'test-key', // Provide API key to avoid OIDC token lookup
      });

      // Trigger a request
      await testProvider.getAvailableModels();

      // Check that GatewayFetchMetadata was instantiated with the default baseURL
      expect(GatewayFetchMetadata).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://ai-gateway.vercel.sh/v1/ai',
        }),
      );
    });

    it('should accept empty options', () => {
      // This should not throw an error
      const provider = createGatewayProvider();
      expect(provider).toBeDefined();
      expect(typeof provider).toBe('function');
      expect(typeof provider.languageModel).toBe('function');
    });

    it('should override default baseURL when provided', async () => {
      // Reset mocks
      vi.clearAllMocks();

      // Create a mock implementation that returns empty models
      const mockGetAvailableModels = vi.fn().mockResolvedValue({ models: [] });
      vi.mocked(GatewayFetchMetadata).mockImplementation(
        () =>
          ({
            getAvailableModels: mockGetAvailableModels,
          }) as unknown as InstanceType<typeof GatewayFetchMetadata>,
      );

      const customBaseUrl = 'https://custom-api.example.com';
      const testProvider = createGatewayProvider({
        baseURL: customBaseUrl,
        apiKey: 'test-key',
      });

      // Trigger a request
      await testProvider.getAvailableModels();

      // Check that GatewayFetchMetadata was instantiated with the custom baseURL
      expect(GatewayFetchMetadata).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: customBaseUrl,
        }),
      );
      expect(mockGetAvailableModels).toHaveBeenCalled();
    });

    it('should use apiKey over OIDC token when provided', async () => {
      // Reset the mocks
      vi.clearAllMocks();

      // Mock getVercelOidcToken to ensure it's not called
      vi.mocked(getVercelOidcToken).mockRejectedValue(
        new Error('Should not be called'),
      );

      // Create a mock implementation that returns empty models
      const mockGetAvailableModels = vi.fn().mockResolvedValue({ models: [] });
      vi.mocked(GatewayFetchMetadata).mockImplementation(
        () =>
          ({
            getAvailableModels: mockGetAvailableModels,
          }) as unknown as InstanceType<typeof GatewayFetchMetadata>,
      );

      const testApiKey = 'test-api-key-123';
      const testProvider = createGatewayProvider({
        apiKey: testApiKey,
      });

      // Trigger a request that will use the headers
      await testProvider.getAvailableModels();

      // Get the headers function that was passed to GatewayFetchMetadata
      const config = vi.mocked(GatewayFetchMetadata).mock.calls[0][0];
      const headers = await resolve(config.headers());

      // Verify that the API key was used in the Authorization header
      expect(headers.Authorization).toBe(`Bearer ${testApiKey}`);

      // Verify getVercelOidcToken was never called
      expect(getVercelOidcToken).not.toHaveBeenCalled();
    });
  });

  describe('AI_GATEWAY_API_KEY environment variable', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      if ('AI_GATEWAY_API_KEY' in process.env) {
        Reflect.deleteProperty(process.env, 'AI_GATEWAY_API_KEY');
      }
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should use AI_GATEWAY_API_KEY when no apiKey option is provided', async () => {
      const envApiKey = 'env-api-key-123';
      process.env.AI_GATEWAY_API_KEY = envApiKey;

      const token = await getGatewayAuthToken({});
      expect(token).toBe(envApiKey);
      expect(getVercelOidcToken).not.toHaveBeenCalled();
    });

    it('should prioritize options.apiKey over AI_GATEWAY_API_KEY', async () => {
      const envApiKey = 'env-api-key-123';
      const optionsApiKey = 'options-api-key-456';
      process.env.AI_GATEWAY_API_KEY = envApiKey;

      const token = await getGatewayAuthToken({ apiKey: optionsApiKey });
      expect(token).toBe(optionsApiKey);
      expect(getVercelOidcToken).not.toHaveBeenCalled();
    });

    it('should fall back to OIDC token when neither apiKey nor AI_GATEWAY_API_KEY is provided', async () => {
      const oidcToken = 'oidc-token-789';
      vi.mocked(getVercelOidcToken).mockResolvedValue(oidcToken);

      const token = await getGatewayAuthToken({});
      expect(token).toBe(oidcToken);
      expect(getVercelOidcToken).toHaveBeenCalled();
    });

    it('should use AI_GATEWAY_API_KEY in headers when creating language model', async () => {
      const envApiKey = 'env-api-key-from-env';
      process.env.AI_GATEWAY_API_KEY = envApiKey;

      const provider = createGatewayProvider({
        baseURL: 'https://api.example.com',
      });
      provider('test-model');

      // Verify headers function uses the environment variable
      const constructorCall = vi.mocked(GatewayLanguageModel).mock.calls[0];
      const config = constructorCall[1];
      const headers = await config.headers();

      expect(headers).toEqual({
        Authorization: `Bearer ${envApiKey}`,
        'ai-gateway-protocol-version': expect.any(String),
      });
      expect(getVercelOidcToken).not.toHaveBeenCalled();
    });

    it('should use AI_GATEWAY_API_KEY in provider when calling getAvailableModels', async () => {
      const envApiKey = 'env-api-key-for-metadata';
      process.env.AI_GATEWAY_API_KEY = envApiKey;

      // Create a mock implementation that returns empty models
      const mockGetAvailableModels = vi.fn().mockResolvedValue({ models: [] });
      vi.mocked(GatewayFetchMetadata).mockImplementation(
        () =>
          ({
            getAvailableModels: mockGetAvailableModels,
          }) as unknown as InstanceType<typeof GatewayFetchMetadata>,
      );

      const provider = createGatewayProvider({
        baseURL: 'https://api.example.com',
      });

      // Trigger a request that will use the headers
      await provider.getAvailableModels();

      // Get the headers function that was passed to GatewayFetchMetadata
      const config = vi.mocked(GatewayFetchMetadata).mock.calls[0][0];
      const headers = await resolve(config.headers());

      // Verify that the environment API key was used in the Authorization header
      expect(headers.Authorization).toBe(`Bearer ${envApiKey}`);

      // Verify getVercelOidcToken was never called
      expect(getVercelOidcToken).not.toHaveBeenCalled();
    });

    it('should handle empty AI_GATEWAY_API_KEY and fall back to OIDC', async () => {
      process.env.AI_GATEWAY_API_KEY = '';
      const oidcToken = 'fallback-oidc-token';
      vi.mocked(getVercelOidcToken).mockResolvedValue(oidcToken);

      const token = await getGatewayAuthToken({});
      expect(token).toBe(''); // loadOptionalSetting returns empty string as-is
      expect(getVercelOidcToken).not.toHaveBeenCalled();
    });

    it('should handle whitespace-only AI_GATEWAY_API_KEY and fall back to OIDC', async () => {
      process.env.AI_GATEWAY_API_KEY = '   ';
      const oidcToken = 'fallback-oidc-token';
      vi.mocked(getVercelOidcToken).mockResolvedValue(oidcToken);

      const token = await getGatewayAuthToken({});
      expect(token).toBe('   '); // loadOptionalSetting returns whitespace string as-is
      expect(getVercelOidcToken).not.toHaveBeenCalled();
    });
  });

  describe('getGatewayAuthToken', () => {
    it('should prioritize apiKey when provided', async () => {
      const token = await getGatewayAuthToken({ apiKey: 'test-api-key-123' });
      expect(token).toBe('test-api-key-123');
      expect(getVercelOidcToken).not.toHaveBeenCalled();
    });

    it('should throw GatewayAuthenticationError when OIDC token is missing', async () => {
      vi.mocked(getVercelOidcToken).mockRejectedValueOnce(
        new GatewayAuthenticationError({
          message: 'Failed to get Vercel OIDC token for AI Gateway access.',
          statusCode: 401,
        }),
      );

      await expect(getGatewayAuthToken({})).rejects.toMatchObject({
        name: 'GatewayAuthenticationError',
        type: 'authentication_error',
        statusCode: 401,
        message: expect.stringContaining('Failed to get Vercel OIDC token'),
      });
    });

    it('should rethrow other OIDC errors without modification', async () => {
      const originalError = new Error('Some other OIDC-related error');
      vi.mocked(getVercelOidcToken).mockRejectedValueOnce(originalError);

      await expect(getGatewayAuthToken({})).rejects.toThrow(originalError);
    });

    it('should pass through GatewayAuthenticationError from getVercelOidcToken', async () => {
      const authError = new GatewayAuthenticationError({
        message: 'Failed to get Vercel OIDC token for AI Gateway access.',
        statusCode: 401,
      });
      vi.mocked(getVercelOidcToken).mockRejectedValueOnce(authError);

      try {
        await getGatewayAuthToken({});
        fail('Expected error was not thrown');
      } catch (error) {
        expect(error).toBe(authError); // Same instance, not wrapped
        expect(error).toBeInstanceOf(GatewayAuthenticationError);
      }
    });
  });

  describe('Error handling in metadata fetching', () => {
    it('should convert metadata fetch errors to Gateway errors', async () => {
      const mockGetAvailableModels = vi.fn().mockRejectedValue(
        new GatewayInternalServerError({
          message: 'Database connection failed',
          statusCode: 500,
        }),
      );

      vi.mocked(GatewayFetchMetadata).mockImplementation(
        () =>
          ({
            getAvailableModels: mockGetAvailableModels,
          }) as any,
      );

      const provider = createGatewayProvider({
        baseURL: 'https://api.example.com',
        apiKey: 'test-key',
      });

      await expect(provider.getAvailableModels()).rejects.toMatchObject({
        name: 'GatewayInternalServerError',
        message: 'Database connection failed',
        statusCode: 500,
      });
    });

    it('should not double-wrap Gateway errors from metadata fetch', async () => {
      const originalError = new GatewayAuthenticationError({
        message: 'Invalid token',
        statusCode: 401,
      });

      const mockGetAvailableModels = vi.fn().mockRejectedValue(originalError);

      vi.mocked(GatewayFetchMetadata).mockImplementation(
        () =>
          ({
            getAvailableModels: mockGetAvailableModels,
          }) as any,
      );

      const provider = createGatewayProvider({
        baseURL: 'https://api.example.com',
        apiKey: 'test-key',
      });

      try {
        await provider.getAvailableModels();
        fail('Expected error was not thrown');
      } catch (error) {
        expect(error).toBe(originalError); // Same instance
        expect(error).toBeInstanceOf(GatewayAuthenticationError);
        expect((error as GatewayAuthenticationError).message).toBe(
          'Invalid token',
        );
      }
    });

    it('should handle model specification errors', async () => {
      // Mock successful metadata fetch with a model
      const mockGetAvailableModels = vi.fn().mockResolvedValue({
        models: [
          {
            id: 'test-model',
            specification: {
              provider: 'test',
              specificationVersion: 'v2',
              modelId: 'test-model',
            },
          },
        ],
      });

      vi.mocked(GatewayFetchMetadata).mockImplementation(
        () =>
          ({
            getAvailableModels: mockGetAvailableModels,
          }) as any,
      );

      const provider = createGatewayProvider({
        baseURL: 'https://api.example.com',
        apiKey: 'test-key',
      });

      // Create a language model that should work
      const model = provider('test-model');
      expect(model).toBeDefined();

      // Verify the model was created with the correct parameters
      expect(GatewayLanguageModel).toHaveBeenCalledWith(
        'test-model',
        expect.objectContaining({
          provider: 'gateway',
          baseURL: 'https://api.example.com',
          headers: expect.any(Function),
          fetch: undefined,
          o11yHeaders: expect.any(Function),
        }),
      );
    });

    it('should create language model for any modelId', async () => {
      // Mock successful metadata fetch with different models
      const mockGetAvailableModels = vi.fn().mockResolvedValue({
        models: [
          {
            id: 'model-1',
            specification: {
              provider: 'test',
              specificationVersion: 'v2',
              modelId: 'model-1',
            },
          },
          {
            id: 'model-2',
            specification: {
              provider: 'test',
              specificationVersion: 'v2',
              modelId: 'model-2',
            },
          },
        ],
      });

      vi.mocked(GatewayFetchMetadata).mockImplementation(
        () =>
          ({
            getAvailableModels: mockGetAvailableModels,
          }) as any,
      );

      const provider = createGatewayProvider({
        baseURL: 'https://api.example.com',
        apiKey: 'test-key',
      });

      // Create a language model for any model ID
      const model = provider('any-model-id');

      // The model should be created successfully
      expect(GatewayLanguageModel).toHaveBeenCalledWith(
        'any-model-id',
        expect.objectContaining({
          provider: 'gateway',
          baseURL: 'https://api.example.com',
          headers: expect.any(Function),
          fetch: undefined,
          o11yHeaders: expect.any(Function),
        }),
      );

      expect(model).toBeDefined();
    });

    it('should handle non-existent model requests', async () => {
      const provider = createGatewayProvider({
        baseURL: 'https://api.example.com',
        apiKey: 'test-key',
      });

      // Create a language model for a non-existent model
      const model = provider('non-existent-model');

      // The model should be created successfully (validation happens at API call time)
      expect(GatewayLanguageModel).toHaveBeenCalledWith(
        'non-existent-model',
        expect.objectContaining({
          provider: 'gateway',
          baseURL: 'https://api.example.com',
          headers: expect.any(Function),
          fetch: undefined,
          o11yHeaders: expect.any(Function),
        }),
      );

      expect(model).toBeDefined();
    });
  });
});
