import { createTestServer } from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { GatewayFetchMetadata } from './gateway-fetch-metadata';
import type { FetchFunction } from '@ai-sdk/provider-utils';

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
    specification: {
      specificationVersion: 'v2',
      provider: 'test-provider',
      modelId: 'model-1',
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
        body: 'Unauthorized',
      };

      const metadata = createBasicMetadataFetcher();

      await expect(metadata.getAvailableModels()).rejects.toMatchObject({
        message: 'Unauthorized',
        name: 'AI_APICallError',
      });
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

    it('should use custom fetch function when provided', async () => {
      const customModelEntry = {
        id: 'custom-model-1',
        name: 'Custom Model One',
        specification: {
          specificationVersion: 'v2',
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
