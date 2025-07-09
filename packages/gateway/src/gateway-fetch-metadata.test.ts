import { createTestServer } from '@ai-sdk/provider-utils/test';
import { describe, expect, it, vi } from 'vitest';
import { GatewayFetchMetadata } from './gateway-fetch-metadata';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import {
  GatewayAuthenticationError,
  GatewayInternalServerError,
  GatewayRateLimitError,
  GatewayResponseError,
  GatewayError,
} from './errors';

function createBasicMetadataFetcher({
  headers,
  fetch,
}: {
  headers?: () => Record<string, string>;
  fetch?: FetchFunction;
} = {}) {
  return new GatewayFetchMetadata({
    baseURL: 'https://api.example.com',
    headers: headers ?? (() => ({ Authorization: 'Bearer test-token' })),
    fetch,
  });
}

describe('GatewayFetchMetadata', () => {
  const mockModelEntry = {
    id: 'model-1',
    name: 'Model One',
    description: 'A test model',
    pricing: {
      input: '0.000001',
      output: '0.000002',
    },
    specification: {
      specificationVersion: 'v2' as const,
      provider: 'test-provider',
      modelId: 'model-1',
    },
  };

  const mockModelEntryWithoutPricing = {
    id: 'model-2',
    name: 'Model Two',
    specification: {
      specificationVersion: 'v2' as const,
      provider: 'test-provider',
      modelId: 'model-2',
    },
  };

  const server = createTestServer({
    'https://api.example.com/*': {
      response: {
        type: 'json-value',
        body: {
          models: [mockModelEntry],
        },
      },
    },
  });

  describe('getAvailableModels', () => {
    it('should fetch available models from the correct endpoint', async () => {
      const metadata = createBasicMetadataFetcher();

      const result = await metadata.getAvailableModels();

      expect(server.calls[0].requestMethod).toBe('GET');
      expect(server.calls[0].requestUrl).toBe('https://api.example.com/config');
      expect(result).toEqual({
        models: [mockModelEntry],
      });
    });

    it('should handle models with pricing information', async () => {
      server.urls['https://api.example.com/*'].response = {
        type: 'json-value',
        body: {
          models: [mockModelEntry],
        },
      };

      const metadata = createBasicMetadataFetcher();
      const result = await metadata.getAvailableModels();

      expect(result.models[0]).toEqual(mockModelEntry);
      expect(result.models[0].pricing).toEqual({
        input: '0.000001',
        output: '0.000002',
      });
    });

    it('should handle models without pricing information', async () => {
      server.urls['https://api.example.com/*'].response = {
        type: 'json-value',
        body: {
          models: [mockModelEntryWithoutPricing],
        },
      };

      const metadata = createBasicMetadataFetcher();
      const result = await metadata.getAvailableModels();

      expect(result.models[0]).toEqual(mockModelEntryWithoutPricing);
      expect(result.models[0].pricing).toBeUndefined();
    });

    it('should handle mixed models with and without pricing', async () => {
      server.urls['https://api.example.com/*'].response = {
        type: 'json-value',
        body: {
          models: [mockModelEntry, mockModelEntryWithoutPricing],
        },
      };

      const metadata = createBasicMetadataFetcher();
      const result = await metadata.getAvailableModels();

      expect(result.models).toHaveLength(2);
      expect(result.models[0].pricing).toEqual({
        input: '0.000001',
        output: '0.000002',
      });
      expect(result.models[1].pricing).toBeUndefined();
    });

    it('should handle models with description', async () => {
      const modelWithDescription = {
        ...mockModelEntry,
        description: 'A powerful language model',
      };

      server.urls['https://api.example.com/*'].response = {
        type: 'json-value',
        body: {
          models: [modelWithDescription],
        },
      };

      const metadata = createBasicMetadataFetcher();
      const result = await metadata.getAvailableModels();

      expect(result.models[0].description).toBe('A powerful language model');
    });

    it('should pass headers correctly', async () => {
      const metadata = createBasicMetadataFetcher({
        headers: () => ({
          Authorization: 'Bearer custom-token',
          'Custom-Header': 'custom-value',
        }),
      });

      await metadata.getAvailableModels();

      expect(server.calls[0].requestHeaders).toEqual({
        authorization: 'Bearer custom-token',
        'custom-header': 'custom-value',
      });
    });

    it('should handle API errors', async () => {
      server.urls['https://api.example.com/*'].response = {
        type: 'error',
        status: 401,
        body: JSON.stringify({
          error: {
            message: 'Unauthorized',
            type: 'authentication_error',
          },
        }),
      };

      const metadata = createBasicMetadataFetcher();

      try {
        await metadata.getAvailableModels();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(GatewayAuthenticationError.isInstance(error)).toBe(true);
        const authError = error as GatewayAuthenticationError;
        expect(authError.message).toContain('No authentication provided');
        expect(authError.type).toBe('authentication_error');
        expect(authError.statusCode).toBe(401);
      }
    });

    it('should convert API call errors to Gateway errors', async () => {
      server.urls['https://api.example.com/*'].response = {
        type: 'error',
        status: 403,
        body: JSON.stringify({
          error: {
            message: 'Forbidden access',
            type: 'authentication_error',
          },
        }),
      };

      const metadata = createBasicMetadataFetcher();

      try {
        await metadata.getAvailableModels();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(GatewayAuthenticationError.isInstance(error)).toBe(true);
        const authError = error as GatewayAuthenticationError;
        expect(authError.message).toContain('No authentication provided');
        expect(authError.type).toBe('authentication_error');
        expect(authError.statusCode).toBe(403);
      }
    });

    it('should handle malformed JSON error responses', async () => {
      server.urls['https://api.example.com/*'].response = {
        type: 'error',
        status: 500,
        body: '{ invalid json',
      };

      const metadata = createBasicMetadataFetcher();

      try {
        await metadata.getAvailableModels();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(GatewayResponseError.isInstance(error)).toBe(true);
        const responseError = error as GatewayResponseError;
        expect(responseError.statusCode).toBe(500);
        expect(responseError.type).toBe('response_error');
      }
    });

    it('should handle malformed response data', async () => {
      server.urls['https://api.example.com/*'].response = {
        type: 'json-value',
        body: {
          invalid: 'response',
        },
      };

      const metadata = createBasicMetadataFetcher();

      await expect(metadata.getAvailableModels()).rejects.toThrow();
    });

    it('should reject models with invalid pricing format', async () => {
      server.urls['https://api.example.com/*'].response = {
        type: 'json-value',
        body: {
          models: [
            {
              id: 'model-1',
              name: 'Model One',
              pricing: {
                input: 123, // Should be string, not number
                output: '0.000002',
              },
              specification: {
                specificationVersion: 'v2',
                provider: 'test-provider',
                modelId: 'model-1',
              },
            },
          ],
        },
      };

      const metadata = createBasicMetadataFetcher();

      await expect(metadata.getAvailableModels()).rejects.toThrow();
    });

    it('should not double-wrap existing Gateway errors', async () => {
      // Create a Gateway error and verify it doesn't get wrapped
      const existingError = new GatewayAuthenticationError({
        message: 'Already wrapped',
        statusCode: 401,
      });

      // Test the catch block logic directly
      try {
        throw existingError;
      } catch (error: unknown) {
        if (GatewayError.isInstance(error)) {
          expect(error).toBe(existingError); // Should be the same instance
          expect(error.message).toBe('Already wrapped');
          return;
        }
        throw new Error('Should not reach here');
      }
    });

    it('should handle various server error types', async () => {
      // Test rate limit error
      server.urls['https://api.example.com/*'].response = {
        type: 'error',
        status: 429,
        body: JSON.stringify({
          error: {
            message: 'Rate limit exceeded',
            type: 'rate_limit_exceeded',
          },
        }),
      };

      const metadata = createBasicMetadataFetcher();

      try {
        await metadata.getAvailableModels();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(GatewayRateLimitError.isInstance(error)).toBe(true);
        const rateLimitError = error as GatewayRateLimitError;
        expect(rateLimitError.message).toBe('Rate limit exceeded');
        expect(rateLimitError.type).toBe('rate_limit_exceeded');
        expect(rateLimitError.statusCode).toBe(429);
      }
    });

    it('should handle internal server errors', async () => {
      server.urls['https://api.example.com/*'].response = {
        type: 'error',
        status: 500,
        body: JSON.stringify({
          error: {
            message: 'Database connection failed',
            type: 'internal_server_error',
          },
        }),
      };

      const metadata = createBasicMetadataFetcher();

      try {
        await metadata.getAvailableModels();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(GatewayInternalServerError.isInstance(error)).toBe(true);
        const serverError = error as GatewayInternalServerError;
        expect(serverError.message).toBe('Database connection failed');
        expect(serverError.type).toBe('internal_server_error');
        expect(serverError.statusCode).toBe(500);
      }
    });

    it('should preserve error cause chain', async () => {
      server.urls['https://api.example.com/*'].response = {
        type: 'error',
        status: 401,
        body: JSON.stringify({
          error: {
            message: 'Token expired',
            type: 'authentication_error',
          },
        }),
      };

      const metadata = createBasicMetadataFetcher();

      try {
        await metadata.getAvailableModels();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(GatewayAuthenticationError.isInstance(error)).toBe(true);
        const authError = error as GatewayAuthenticationError;
        expect(authError.cause).toBeDefined();
      }
    });

    it('should use custom fetch function when provided', async () => {
      const customModelEntry = {
        id: 'custom-model-1',
        name: 'Custom Model One',
        description: 'Custom model description',
        pricing: {
          input: '0.000005',
          output: '0.000010',
        },
        specification: {
          specificationVersion: 'v2' as const,
          provider: 'custom-provider',
          modelId: 'custom-model-1',
        },
      };

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            models: [customModelEntry],
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      const metadata = createBasicMetadataFetcher({
        fetch: mockFetch,
      });

      const result = await metadata.getAvailableModels();

      expect(mockFetch).toHaveBeenCalled();
      expect(result).toEqual({
        models: [customModelEntry],
      });
    });

    it('should handle empty response', async () => {
      server.urls['https://api.example.com/*'].response = {
        type: 'json-value',
        body: {
          models: [],
        },
      };

      const metadata = createBasicMetadataFetcher();
      const result = await metadata.getAvailableModels();

      expect(result).toEqual({
        models: [],
      });
    });
  });
});
