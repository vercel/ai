import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  gateway,
  createGatewayProvider,
  getGatewayAuthToken,
} from './gateway-provider';
import { GatewayFetchMetadata } from './gateway-fetch-metadata';
import { NoSuchModelError } from '@ai-sdk/provider';
import { GatewayEmbeddingModel } from './gateway-embedding-model';
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

// Mock the gateway fetch metadata to prevent actual network calls
// We'll create a more flexible mock that can simulate auth failures
const mockGetAvailableModels = vi.fn();
vi.mock('./gateway-fetch-metadata', () => ({
  GatewayFetchMetadata: vi.fn().mockImplementation((config: any) => ({
    getAvailableModels: async () => {
      // Call the headers function to trigger authentication logic
      if (config.headers && typeof config.headers === 'function') {
        await config.headers();
      }
      return mockGetAvailableModels();
    },
  })),
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
    // Set up default mock behavior for getAvailableModels
    mockGetAvailableModels.mockReturnValue({ models: [] });
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
        'ai-gateway-auth-method': 'api-key',
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
        'ai-gateway-auth-method': 'oidc',
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

    it('should create GatewayEmbeddingModel for textEmbeddingModel', () => {
      const provider = createGatewayProvider({
        baseURL: 'https://api.example.com',
      });

      const model = provider.textEmbeddingModel(
        'openai/text-embedding-3-small',
      );
      expect(model).toBeInstanceOf(GatewayEmbeddingModel);
    });

    it('should fetch available models', async () => {
      mockGetAvailableModels.mockReturnValue({ models: [] });

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
        mockGetAvailableModels.mockReturnValue({
          models: [{ id: 'test-model', specification: {} }],
        });

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
        mockGetAvailableModels.mockReturnValue({
          models: [{ id: 'test-model', specification: {} }],
        });

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
      process.env.VERCEL_DEPLOYMENT_ID = undefined;
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
      // Set up mock to return empty models
      mockGetAvailableModels.mockReturnValue({ models: [] });

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

      // Set up mock to return empty models
      mockGetAvailableModels.mockReturnValue({ models: [] });

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

      // Set up mock to return empty models
      mockGetAvailableModels.mockReturnValue({ models: [] });

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
      expect(headers['ai-gateway-auth-method']).toBe('api-key');

      // Verify getVercelOidcToken was never called
      expect(getVercelOidcToken).not.toHaveBeenCalled();
    });
  });

  // Test data for different authentication scenarios
  const authTestCases = [
    {
      name: 'no auth at all',
      envOidcToken: undefined,
      envApiKey: undefined,
      optionsApiKey: undefined,
      oidcTokenMock: null, // Will throw error
      expectSuccess: false,
      expectedError: 'authentication',
      description: 'No OIDC token or API key provided',
    },
    {
      name: 'valid oidc, invalid api key',
      envOidcToken: 'valid-oidc-token-12345',
      envApiKey: undefined,
      optionsApiKey: 'invalid-api-key',
      oidcTokenMock: 'valid-oidc-token-12345',
      expectSuccess: true,
      expectedAuthMethod: 'api-key', // Options API key takes precedence
      description: 'Valid OIDC in env, but options API key takes precedence',
    },
    {
      name: 'invalid oidc, valid api key',
      envOidcToken: 'invalid-oidc-token',
      envApiKey: undefined,
      optionsApiKey: 'gw_valid_api_key_12345',
      oidcTokenMock: null, // Will throw error
      expectSuccess: true,
      expectedAuthMethod: 'api-key',
      description: 'Invalid OIDC, but valid API key should work',
    },
    {
      name: 'no oidc, invalid api key',
      envOidcToken: undefined,
      envApiKey: 'invalid-api-key',
      optionsApiKey: undefined,
      oidcTokenMock: null, // Will throw error
      expectSuccess: true,
      expectedAuthMethod: 'api-key',
      description: 'No OIDC, but env API key should be used',
    },
    {
      name: 'no oidc, valid api key',
      envOidcToken: undefined,
      envApiKey: 'gw_valid_api_key_12345',
      optionsApiKey: undefined,
      oidcTokenMock: null, // Won't be called
      expectSuccess: true,
      expectedAuthMethod: 'api-key',
      description: 'Valid API key in environment should work',
    },
    {
      name: 'valid oidc, no api key',
      envOidcToken: 'valid-oidc-token-12345',
      envApiKey: undefined,
      optionsApiKey: undefined,
      oidcTokenMock: 'valid-oidc-token-12345',
      expectSuccess: true,
      expectedAuthMethod: 'oidc',
      description: 'Valid OIDC token should work when no API key provided',
    },
    {
      name: 'valid oidc, valid api key',
      envOidcToken: 'valid-oidc-token-12345',
      envApiKey: 'gw_valid_api_key_12345',
      optionsApiKey: undefined,
      oidcTokenMock: 'valid-oidc-token-12345',
      expectSuccess: true,
      expectedAuthMethod: 'api-key',
      description:
        'Both valid credentials - API key should take precedence over OIDC',
    },
    {
      name: 'valid oidc, valid options api key',
      envOidcToken: 'valid-oidc-token-12345',
      envApiKey: undefined,
      optionsApiKey: 'gw_valid_options_api_key_12345',
      oidcTokenMock: 'valid-oidc-token-12345',
      expectSuccess: true,
      expectedAuthMethod: 'api-key',
      description:
        'Both valid credentials - options API key should take precedence over OIDC',
    },
    {
      name: 'invalid oidc, no api key',
      envOidcToken: 'invalid-oidc-token',
      envApiKey: undefined,
      optionsApiKey: undefined,
      oidcTokenMock: null, // Will throw error
      expectSuccess: false,
      expectedError: 'authentication',
      description: 'Invalid OIDC and no API key should fail',
    },
    {
      name: 'invalid oidc, invalid api key',
      envOidcToken: 'invalid-oidc-token',
      envApiKey: 'invalid-api-key',
      optionsApiKey: undefined,
      oidcTokenMock: null, // Will throw error for OIDC
      expectSuccess: true,
      expectedAuthMethod: 'api-key', // Env API key is still used even if "invalid"
      description: 'Environment API key takes precedence over OIDC failure',
    },
  ];

  describe('Authentication Comprehensive Tests', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      // Store original environment
      originalEnv = process.env;
    });

    afterEach(() => {
      // Restore original environment
      process.env = originalEnv;
    });

    describe('getGatewayAuthToken function', () => {
      authTestCases.forEach(testCase => {
        it(`should handle ${testCase.name}`, async () => {
          // Set up environment variables for this test case
          process.env = { ...originalEnv };

          // Only set environment variables if they have actual values
          if (testCase.envOidcToken !== undefined) {
            process.env.VERCEL_OIDC_TOKEN = testCase.envOidcToken;
          } else {
            delete process.env.VERCEL_OIDC_TOKEN;
          }

          if (testCase.envApiKey !== undefined) {
            process.env.AI_GATEWAY_API_KEY = testCase.envApiKey;
          } else {
            delete process.env.AI_GATEWAY_API_KEY;
          }

          // Mock OIDC token behavior
          if (testCase.oidcTokenMock) {
            vi.mocked(getVercelOidcToken).mockResolvedValue(
              testCase.oidcTokenMock,
            );
          } else {
            vi.mocked(getVercelOidcToken).mockRejectedValue(
              new GatewayAuthenticationError({
                message: 'OIDC token not available',
                statusCode: 401,
              }),
            );
          }

          const options: any = {};
          if (testCase.optionsApiKey) {
            options.apiKey = testCase.optionsApiKey;
          }

          if (testCase.expectSuccess) {
            // Test successful cases
            const result = await getGatewayAuthToken(options);

            expect(result).not.toBeNull();
            expect(result?.authMethod).toBe(testCase.expectedAuthMethod);

            if (testCase.expectedAuthMethod === 'api-key') {
              const expectedToken =
                testCase.optionsApiKey || testCase.envApiKey;
              expect(result?.token).toBe(expectedToken);

              // If we used options API key, OIDC should not be called
              if (testCase.optionsApiKey) {
                expect(getVercelOidcToken).not.toHaveBeenCalled();
              }
            } else if (testCase.expectedAuthMethod === 'oidc') {
              expect(result?.token).toBe(testCase.oidcTokenMock);
              expect(getVercelOidcToken).toHaveBeenCalled();
            }
          } else {
            // Test failure cases
            const result = await getGatewayAuthToken(options);
            expect(result).toBeNull();
          }
        });
      });
    });

    describe('createGatewayProvider authentication', () => {
      authTestCases.forEach(testCase => {
        it(`should handle provider creation with ${testCase.name}`, async () => {
          // Set up environment variables for this test case
          process.env = { ...originalEnv };

          // Only set environment variables if they have actual values
          if (testCase.envOidcToken !== undefined) {
            process.env.VERCEL_OIDC_TOKEN = testCase.envOidcToken;
          } else {
            delete process.env.VERCEL_OIDC_TOKEN;
          }

          if (testCase.envApiKey !== undefined) {
            process.env.AI_GATEWAY_API_KEY = testCase.envApiKey;
          } else {
            delete process.env.AI_GATEWAY_API_KEY;
          }

          // Mock OIDC token behavior
          if (testCase.oidcTokenMock) {
            vi.mocked(getVercelOidcToken).mockResolvedValue(
              testCase.oidcTokenMock,
            );
          } else {
            vi.mocked(getVercelOidcToken).mockRejectedValue(
              new GatewayAuthenticationError({
                message: 'OIDC token not available',
                statusCode: 401,
              }),
            );
          }

          const options: any = {
            baseURL: 'https://test-gateway.example.com',
          };
          if (testCase.optionsApiKey) {
            options.apiKey = testCase.optionsApiKey;
          }

          const provider = createGatewayProvider({
            ...options,
            // Force no caching to ensure headers are called each time
            metadataCacheRefreshMillis: 0,
          });

          if (testCase.expectSuccess) {
            // Ensure the mock succeeds for successful test cases
            mockGetAvailableModels.mockReturnValue({ models: [] });

            // Test that provider can get available models (which requires auth)
            const models = await provider.getAvailableModels();
            expect(models).toBeDefined();

            // For OIDC tests, we need to verify the auth token function was called
            // which is indirectly tested by checking if getVercelOidcToken was called
            if (testCase.expectedAuthMethod === 'oidc') {
              expect(getVercelOidcToken).toHaveBeenCalled();
            } else if (
              testCase.expectedAuthMethod === 'api-key' &&
              testCase.optionsApiKey
            ) {
              // If we used options API key, OIDC should not be called
              expect(getVercelOidcToken).not.toHaveBeenCalled();
            }
          } else {
            // For failure cases, mock the metadata fetch to throw auth error
            mockGetAvailableModels.mockImplementation(() => {
              throw new GatewayAuthenticationError({
                message: 'Authentication failed',
                statusCode: 401,
              });
            });

            // Test failure cases
            await expect(provider.getAvailableModels()).rejects.toThrow(
              /authentication|token/i,
            );
          }
        });
      });
    });

    describe('Environment variable edge cases', () => {
      it('should handle empty string environment variables as undefined', async () => {
        process.env = {
          ...originalEnv,
          VERCEL_OIDC_TOKEN: '',
          AI_GATEWAY_API_KEY: '',
        };

        vi.mocked(getVercelOidcToken).mockRejectedValue(
          new GatewayAuthenticationError({
            message: 'OIDC token not available',
            statusCode: 401,
          }),
        );

        const result = await getGatewayAuthToken({});
        expect(result).toBeNull();
      });

      it('should handle whitespace-only environment variables', async () => {
        process.env = {
          ...originalEnv,
          VERCEL_OIDC_TOKEN: '   ',
          AI_GATEWAY_API_KEY: '\t\n ',
        };

        // The whitespace API key should still be used (it's treated as a valid value)
        const result = await getGatewayAuthToken({});
        expect(result).not.toBeNull();
        expect(result?.authMethod).toBe('api-key');
        expect(result?.token).toBe('\t\n ');
      });

      it('should prioritize options.apiKey over all environment variables', async () => {
        process.env = {
          ...originalEnv,
          VERCEL_OIDC_TOKEN: 'env-oidc-token',
          AI_GATEWAY_API_KEY: 'env-api-key',
        };

        const optionsApiKey = 'options-api-key';
        const result = await getGatewayAuthToken({ apiKey: optionsApiKey });

        expect(result).not.toBeNull();
        expect(result?.authMethod).toBe('api-key');
        expect(result?.token).toBe(optionsApiKey);
        expect(getVercelOidcToken).not.toHaveBeenCalled();
      });
    });

    describe('Authentication precedence', () => {
      it('should prefer options.apiKey over AI_GATEWAY_API_KEY', async () => {
        process.env = {
          ...originalEnv,
          AI_GATEWAY_API_KEY: 'env-api-key',
        };

        const optionsApiKey = 'options-api-key';
        const result = await getGatewayAuthToken({ apiKey: optionsApiKey });

        expect(result?.authMethod).toBe('api-key');
        expect(result?.token).toBe(optionsApiKey);
        expect(getVercelOidcToken).not.toHaveBeenCalled();
      });

      it('should prefer AI_GATEWAY_API_KEY over OIDC token', async () => {
        process.env = {
          ...originalEnv,
          VERCEL_OIDC_TOKEN: 'oidc-token',
          AI_GATEWAY_API_KEY: 'env-api-key',
        };

        const result = await getGatewayAuthToken({});

        expect(result?.authMethod).toBe('api-key');
        expect(result?.token).toBe('env-api-key');
        expect(getVercelOidcToken).not.toHaveBeenCalled();
      });

      it('should fall back to OIDC when no API keys are available', async () => {
        process.env = {
          ...originalEnv,
          VERCEL_OIDC_TOKEN: 'oidc-token',
        };

        vi.mocked(getVercelOidcToken).mockResolvedValue('oidc-token');

        const result = await getGatewayAuthToken({});

        expect(result?.authMethod).toBe('oidc');
        expect(result?.token).toBe('oidc-token');
        expect(getVercelOidcToken).toHaveBeenCalled();
      });
    });

    describe('Real-world usage scenarios', () => {
      it('should work in Vercel deployment with OIDC', async () => {
        // Simulate Vercel deployment environment
        process.env = {
          ...originalEnv,
          VERCEL_OIDC_TOKEN: 'vercel-deployment-oidc-token',
          VERCEL_DEPLOYMENT_ID: 'dpl_12345',
          VERCEL_ENV: 'production',
          VERCEL_REGION: 'iad1',
        };

        // Explicitly remove AI_GATEWAY_API_KEY to force OIDC usage
        delete process.env.AI_GATEWAY_API_KEY;

        vi.mocked(getVercelOidcToken).mockResolvedValue(
          'vercel-deployment-oidc-token',
        );

        const provider = createGatewayProvider();
        const models = await provider.getAvailableModels();

        expect(models).toBeDefined();
        expect(getVercelOidcToken).toHaveBeenCalled();
      });

      it('should work in local development with API key', async () => {
        // Simulate local development environment
        process.env = {
          ...originalEnv,
          AI_GATEWAY_API_KEY: 'local-dev-api-key',
        };

        const provider = createGatewayProvider();
        const models = await provider.getAvailableModels();

        expect(models).toBeDefined();
        expect(getVercelOidcToken).not.toHaveBeenCalled();
      });

      it('should work with explicit API key override', async () => {
        // User provides explicit API key, should override everything
        process.env = {
          ...originalEnv,
          VERCEL_OIDC_TOKEN: 'should-not-be-used',
          AI_GATEWAY_API_KEY: 'should-not-be-used-either',
        };

        const explicitApiKey = 'explicit-user-api-key';
        const provider = createGatewayProvider({
          apiKey: explicitApiKey,
        });

        const models = await provider.getAvailableModels();

        expect(models).toBeDefined();
        expect(getVercelOidcToken).not.toHaveBeenCalled();
      });
    });
  });

  describe('Error handling in metadata fetching', () => {
    it('should convert metadata fetch errors to Gateway errors', async () => {
      mockGetAvailableModels.mockImplementation(() => {
        throw new GatewayInternalServerError({
          message: 'Database connection failed',
          statusCode: 500,
        });
      });

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

      mockGetAvailableModels.mockImplementation(() => {
        throw originalError;
      });

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
      mockGetAvailableModels.mockReturnValue({
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
      mockGetAvailableModels.mockReturnValue({
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
