import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  gateway,
  createGatewayProvider,
  getGatewayAuthToken,
} from './gateway-provider';
import { GatewayFetchMetadata } from './gateway-fetch-metadata';
import { NoSuchModelError } from '@ai-sdk/provider';
import { getVercelOidcToken } from './get-vercel-oidc-token';
import { resolve } from '@ai-sdk/provider-utils';
import { GatewayLanguageModel } from './gateway-language-model';
import { fail } from 'node:assert';

vi.mock('./gateway-language-model', () => ({
  GatewayLanguageModel: vi.fn(),
}));

vi.mock('./gateway-fetch-metadata', () => ({
  GatewayFetchMetadata: vi.fn(),
}));

vi.mock('./get-vercel-oidc-token', () => ({
  getVercelOidcToken: vi.fn(),
}));

describe('GatewayProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getVercelOidcToken).mockResolvedValue('mock-oidc-token');
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
        expect.any(Function),
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
      await provider('test-model');

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
        new (provider as any)('test-model');
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
          }) as any,
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
            }) as any,
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
            }) as any,
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
        DEPLOYMENT_ID: 'test-deployment',
        VERCEL_ENV: 'test',
        VERCEL_REGION: 'iad1',
      };

      try {
        const provider = createGatewayProvider({
          baseURL: 'https://api.example.com',
          apiKey: 'test-api-key',
        });
        provider('test-model');

        expect(GatewayLanguageModel).toHaveBeenCalledWith(
          'test-model',
          expect.objectContaining({
            provider: 'gateway',
            baseURL: 'https://api.example.com',
            o11yHeaders: {
              'ai-o11y-deployment-id': 'test-deployment',
              'ai-o11y-environment': 'test',
              'ai-o11y-region': 'iad1',
            },
          }),
          expect.any(Function),
        );
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

      try {
        const provider = createGatewayProvider({
          baseURL: 'https://api.example.com',
          apiKey: 'test-api-key',
        });
        provider('test-model');

        expect(GatewayLanguageModel).toHaveBeenCalledWith(
          'test-model',
          expect.objectContaining({
            provider: 'gateway',
            baseURL: 'https://api.example.com',
            o11yHeaders: {},
          }),
          expect.any(Function),
        );
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
          }) as any,
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
          }) as any,
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
          }) as any,
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

  describe('getGatewayAuthToken', () => {
    it('should prioritize apiKey when provided', async () => {
      const token = await getGatewayAuthToken({ apiKey: 'test-api-key-123' });
      expect(token).toBe('test-api-key-123');
      expect(getVercelOidcToken).not.toHaveBeenCalled();
    });

    it('should provide a helpful error message when OIDC token is missing', async () => {
      vi.mocked(getVercelOidcToken).mockRejectedValueOnce(
        new Error(
          "The 'x-vercel-oidc-token' header is missing from the request. Do you have the OIDC option enabled in the Vercel project settings?",
        ),
      );

      await expect(getGatewayAuthToken({})).rejects.toThrow(
        /Failed to get Vercel OIDC token for AI Gateway access/,
      );
    });

    it('should rethrow other OIDC errors without modification', async () => {
      const originalError = new Error('Some other OIDC-related error');
      vi.mocked(getVercelOidcToken).mockRejectedValueOnce(originalError);

      await expect(getGatewayAuthToken({})).rejects.toThrow(originalError);
    });

    it('should include the original error as the cause in the enhanced error', async () => {
      const originalError = new Error(
        "The 'x-vercel-oidc-token' header is missing from the request. Do you have the OIDC option enabled in the Vercel project settings?",
      );
      vi.mocked(getVercelOidcToken).mockRejectedValueOnce(originalError);

      try {
        await getGatewayAuthToken({});
        fail('Expected error was not thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        if (error instanceof Error) {
          expect(error.cause).toBe(originalError);
        }
      }
    });
  });
});
