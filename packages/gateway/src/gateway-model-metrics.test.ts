import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it, vi } from 'vitest';
import { GatewayModelMetrics } from './gateway-model-metrics';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import {
  GatewayAuthenticationError,
  GatewayInternalServerError,
  GatewayRateLimitError,
  GatewayResponseError,
} from './errors';

function createModelMetrics({
  headers,
  fetch,
}: {
  headers?: () => Record<string, string>;
  fetch?: FetchFunction;
} = {}) {
  return new GatewayModelMetrics({
    baseURL: 'https://api.example.com',
    headers,
    fetch,
  });
}

const responseMeta = {
  generated_at: '2026-07-05T00:00:00.000Z',
  source_windows: {
    latency: '1h',
    throughput: '1h',
    uptime: ['15m', '1h', '1d'],
  },
  provenance_note:
    'Latency and throughput are observed from live gateway traffic.',
};

const expectedResponseMeta = {
  generatedAt: '2026-07-05T00:00:00.000Z',
  sourceWindows: {
    latency: '1h',
    throughput: '1h',
    uptime: ['15m', '1h', '1d'],
  },
  provenanceNote:
    'Latency and throughput are observed from live gateway traffic.',
};

describe('GatewayModelMetrics', () => {
  const server = createTestServer({
    'https://api.example.com/*': {
      response: {
        type: 'json-value',
        body: {
          object: 'list',
          data: [],
          meta: responseMeta,
        },
      },
    },
  });

  describe('getModelMetrics', () => {
    it('should fetch from the correct endpoint', async () => {
      const metrics = createModelMetrics();

      await metrics.getModelMetrics();

      expect(server.calls[0].requestMethod).toBe('GET');
      const url = new URL(server.calls[0].requestUrl);
      expect(url.pathname).toBe('/v1/models/metrics');
      expect(url.search).toBe('');
    });

    it('should serialize all optional query params', async () => {
      const metrics = createModelMetrics();

      await metrics.getModelMetrics({
        type: 'language',
        tags: ['tools', 'reasoning'],
        maxInputPrice: 0.000005,
        sort: 'ttft',
        limit: 100,
      });

      const url = new URL(server.calls[0].requestUrl);
      expect(url.searchParams.get('type')).toBe('language');
      expect(url.searchParams.getAll('tag')).toEqual(['tools', 'reasoning']);
      expect(url.searchParams.get('max_input_price')).toBe('0.000005');
      expect(url.searchParams.get('sort')).toBe('ttft');
      expect(url.searchParams.get('limit')).toBe('100');
    });

    it('should not include optional params when not provided', async () => {
      const metrics = createModelMetrics();

      await metrics.getModelMetrics({});

      const url = new URL(server.calls[0].requestUrl);
      expect(url.searchParams.has('type')).toBe(false);
      expect(url.searchParams.has('tag')).toBe(false);
      expect(url.searchParams.has('max_input_price')).toBe(false);
      expect(url.searchParams.has('sort')).toBe(false);
      expect(url.searchParams.has('limit')).toBe(false);
    });

    it('should not include tag params when tags array is empty', async () => {
      const metrics = createModelMetrics();

      await metrics.getModelMetrics({ tags: [] });

      const url = new URL(server.calls[0].requestUrl);
      expect(url.searchParams.has('tag')).toBe(false);
    });

    it('should transform snake_case response fields to camelCase', async () => {
      server.urls['https://api.example.com/*'].response = {
        type: 'json-value',
        body: {
          object: 'list',
          data: [
            {
              id: 'anthropic/claude-sonnet-4.5',
              name: 'Claude Sonnet 4.5',
              provider: 'anthropic',
              type: 'language',
              tags: ['tools', 'reasoning'],
              pricing: {
                input: '0.000003',
                output: '0.000015',
                meta: { source: 'declared' },
              },
              latency_last_1h: {
                p50: 350,
                p95: 900,
                meta: {
                  source: 'observed',
                  window: '1h',
                  measured_at: '2026-07-05T00:00:00.000Z',
                  sample_size: 1250,
                  region: 'global',
                },
              },
              throughput_last_1h: {
                p50: 85.5,
                p95: 120.2,
                meta: {
                  source: 'observed',
                  window: '1h',
                  measured_at: '2026-07-05T00:00:00.000Z',
                  sample_size: 1250,
                  region: 'global',
                },
              },
              uptime: {
                last_15m: 100,
                last_1h: 99.9,
                last_1d: 99.7,
                meta: {
                  source: 'observed',
                  window: 'hourly',
                  measured_at: '2026-07-05T00:00:00.000Z',
                  sample_size: null,
                },
              },
            },
          ],
          meta: responseMeta,
        },
      };

      const metrics = createModelMetrics();
      const result = await metrics.getModelMetrics();

      expect(result.object).toBe('list');
      expect(result.meta).toEqual(expectedResponseMeta);
      expect(result.data[0]).toEqual({
        id: 'anthropic/claude-sonnet-4.5',
        name: 'Claude Sonnet 4.5',
        provider: 'anthropic',
        type: 'language',
        tags: ['tools', 'reasoning'],
        pricing: {
          input: '0.000003',
          output: '0.000015',
          meta: { source: 'declared' },
        },
        latency: {
          p50: 350,
          p95: 900,
          meta: {
            source: 'observed',
            window: '1h',
            measuredAt: '2026-07-05T00:00:00.000Z',
            sampleSize: 1250,
            region: 'global',
          },
        },
        throughput: {
          p50: 85.5,
          p95: 120.2,
          meta: {
            source: 'observed',
            window: '1h',
            measuredAt: '2026-07-05T00:00:00.000Z',
            sampleSize: 1250,
            region: 'global',
          },
        },
        uptime: {
          last15m: 100,
          last1h: 99.9,
          last1d: 99.7,
          meta: {
            source: 'observed',
            window: 'hourly',
            measuredAt: '2026-07-05T00:00:00.000Z',
            sampleSize: null,
          },
        },
      });
      expect('latency_last_1h' in result.data[0]).toBe(false);
      expect('throughput_last_1h' in result.data[0]).toBe(false);
    });

    it('should handle catalog-only rows without observed metrics', async () => {
      server.urls['https://api.example.com/*'].response = {
        type: 'json-value',
        body: {
          object: 'list',
          data: [
            {
              id: 'openai/gpt-5.2',
              name: 'GPT-5.2',
              provider: null,
              type: 'language',
              pricing: {
                meta: { source: 'declared' },
              },
              latency_last_1h: null,
              throughput_last_1h: null,
              uptime: null,
            },
          ],
          meta: responseMeta,
        },
      };

      const metrics = createModelMetrics();
      const result = await metrics.getModelMetrics();

      expect(result.data[0]).toEqual({
        id: 'openai/gpt-5.2',
        name: 'GPT-5.2',
        provider: null,
        type: 'language',
        pricing: {
          meta: { source: 'declared' },
        },
        latency: null,
        throughput: null,
        uptime: null,
      });
    });

    it('should normalize omitted metric groups to null (forward compatibility)', async () => {
      server.urls['https://api.example.com/*'].response = {
        type: 'json-value',
        body: {
          object: 'list',
          data: [
            {
              id: 'openai/gpt-5.2',
              name: 'GPT-5.2',
              provider: null,
              type: 'language',
              pricing: {
                meta: { source: 'declared' },
              },
              // No latency_last_1h / throughput_last_1h / uptime keys at all
            },
          ],
          meta: responseMeta,
        },
      };

      const metrics = createModelMetrics();
      const result = await metrics.getModelMetrics();

      expect(result.data[0].latency).toBeNull();
      expect(result.data[0].throughput).toBeNull();
      expect(result.data[0].uptime).toBeNull();
    });

    it('should handle uptime windows without data yet', async () => {
      server.urls['https://api.example.com/*'].response = {
        type: 'json-value',
        body: {
          object: 'list',
          data: [
            {
              id: 'openai/gpt-5.2',
              name: 'GPT-5.2',
              provider: 'openai',
              type: 'language',
              pricing: {
                input: '0.00000125',
                output: '0.00001',
                meta: { source: 'declared' },
              },
              latency_last_1h: null,
              throughput_last_1h: null,
              uptime: {
                last_15m: null,
                last_1h: 98,
                last_1d: 99.9,
                meta: { source: 'observed', window: 'hourly' },
              },
            },
          ],
          meta: responseMeta,
        },
      };

      const metrics = createModelMetrics();
      const result = await metrics.getModelMetrics();

      expect(result.data[0].uptime).toEqual({
        last15m: null,
        last1h: 98,
        last1d: 99.9,
        meta: { source: 'observed', window: 'hourly' },
      });
    });

    it('should handle empty data', async () => {
      server.urls['https://api.example.com/*'].response = {
        type: 'json-value',
        body: {
          object: 'list',
          data: [],
          meta: responseMeta,
        },
      };

      const metrics = createModelMetrics();
      const result = await metrics.getModelMetrics();

      expect(result.data).toEqual([]);
      expect(result.meta.generatedAt).toBe('2026-07-05T00:00:00.000Z');
    });

    it('should work without headers since the endpoint is public', async () => {
      const metrics = createModelMetrics();

      const result = await metrics.getModelMetrics();

      expect(result.data).toEqual([]);
      expect(server.calls[0].requestHeaders).not.toHaveProperty(
        'authorization',
      );
    });

    it('should pass headers correctly', async () => {
      const metrics = createModelMetrics({
        headers: () => ({
          Authorization: 'Bearer custom-token',
          'Custom-Header': 'custom-value',
        }),
      });

      await metrics.getModelMetrics();

      expect(server.calls[0].requestHeaders).toEqual({
        authorization: 'Bearer custom-token',
        'custom-header': 'custom-value',
      });
    });

    it('should handle 401 authentication errors', async () => {
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

      const metrics = createModelMetrics();

      try {
        await metrics.getModelMetrics();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(GatewayAuthenticationError.isInstance(error)).toBe(true);
        const authError = error as GatewayAuthenticationError;
        expect(authError.statusCode).toBe(401);
      }
    });

    it('should handle 429 rate limit errors', async () => {
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

      const metrics = createModelMetrics();

      await expect(metrics.getModelMetrics()).rejects.toThrow(
        GatewayRateLimitError,
      );
    });

    it('should handle 500 internal server errors', async () => {
      server.urls['https://api.example.com/*'].response = {
        type: 'error',
        status: 500,
        body: JSON.stringify({
          error: {
            message: 'Internal server error',
            type: 'internal_server_error',
          },
        }),
      };

      const metrics = createModelMetrics();

      await expect(metrics.getModelMetrics()).rejects.toThrow(
        GatewayInternalServerError,
      );
    });

    it('should handle malformed JSON error responses', async () => {
      server.urls['https://api.example.com/*'].response = {
        type: 'error',
        status: 500,
        body: '{ invalid json',
      };

      const metrics = createModelMetrics();

      try {
        await metrics.getModelMetrics();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(GatewayResponseError.isInstance(error)).toBe(true);
        const responseError = error as GatewayResponseError;
        expect(responseError.statusCode).toBe(500);
      }
    });

    it('should use custom fetch function when provided', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            object: 'list',
            data: [
              {
                id: 'anthropic/claude-sonnet-4.5',
                name: 'Claude Sonnet 4.5',
                provider: 'anthropic',
                type: 'language',
                pricing: { meta: { source: 'declared' } },
                latency_last_1h: null,
                throughput_last_1h: null,
                uptime: null,
              },
            ],
            meta: responseMeta,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );

      const metrics = createModelMetrics({
        fetch: mockFetch,
      });

      const result = await metrics.getModelMetrics();

      expect(mockFetch).toHaveBeenCalled();
      expect(result.data[0].id).toBe('anthropic/claude-sonnet-4.5');
    });
  });
});
