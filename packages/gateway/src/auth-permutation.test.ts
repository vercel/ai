import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createGatewayProvider,
  getGatewayAuthToken,
  type GatewayProviderSettings,
} from './gateway-provider';
import { getVercelOidcToken } from './vercel-environment';
import { GatewayAuthenticationError } from './errors';

// Mock the vercel environment module
vi.mock('./vercel-environment', () => ({
  getVercelOidcToken: vi.fn(),
  getVercelRequestId: vi.fn(),
}));

// Mock the gateway language model to prevent actual model instantiation
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

// Test data for different authentication scenarios
const testCases = [
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

describe('Gateway Authentication Permutation Tests', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Store original environment
    originalEnv = process.env;
    vi.clearAllMocks();

    // Set up default mock behavior for getAvailableModels
    mockGetAvailableModels.mockReturnValue({ models: [] });
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('getGatewayAuthToken function', () => {
    testCases.forEach(testCase => {
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

        const options: GatewayProviderSettings = {};
        if (testCase.optionsApiKey) {
          options.apiKey = testCase.optionsApiKey;
        }

        if (testCase.expectSuccess) {
          // Test successful cases
          const result = await getGatewayAuthToken(options);

          expect(result).not.toBeNull();
          expect(result?.authMethod).toBe(testCase.expectedAuthMethod);

          if (testCase.expectedAuthMethod === 'api-key') {
            const expectedToken = testCase.optionsApiKey || testCase.envApiKey;
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
    testCases.forEach(testCase => {
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

        const options: GatewayProviderSettings = {
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

  describe('Provider integration with different auth methods', () => {
    it('should successfully create language models with API key auth', async () => {
      process.env = {
        ...originalEnv,
        AI_GATEWAY_API_KEY: 'test-api-key',
      };

      const provider = createGatewayProvider({
        baseURL: 'https://test-gateway.example.com',
      });

      // This should not throw
      const model = provider('openai/gpt-4');
      expect(model).toBeDefined();
    });

    it('should successfully create language models with OIDC auth', async () => {
      process.env = {
        ...originalEnv,
        VERCEL_OIDC_TOKEN: 'test-oidc-token',
      };

      vi.mocked(getVercelOidcToken).mockResolvedValue('test-oidc-token');

      const provider = createGatewayProvider({
        baseURL: 'https://test-gateway.example.com',
      });

      // This should not throw
      const model = provider('openai/gpt-4');
      expect(model).toBeDefined();
    });

    it('should handle auth failures gracefully when creating models', async () => {
      process.env = { ...originalEnv };

      vi.mocked(getVercelOidcToken).mockRejectedValue(
        new GatewayAuthenticationError({
          message: 'OIDC token not available',
          statusCode: 401,
        }),
      );

      // Mock the metadata fetch to simulate auth failure
      mockGetAvailableModels.mockImplementation(() => {
        throw new GatewayAuthenticationError({
          message: 'Authentication failed',
          statusCode: 401,
        });
      });

      const provider = createGatewayProvider({
        baseURL: 'https://test-gateway.example.com',
      });

      // Model creation itself doesn't fail, but operations will
      const model = provider('openai/gpt-4');
      expect(model).toBeDefined();

      // But getting available models should fail
      await expect(provider.getAvailableModels()).rejects.toThrow(
        /authentication|token/i,
      );
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
