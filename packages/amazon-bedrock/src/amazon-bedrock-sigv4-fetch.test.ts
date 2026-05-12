import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiKeyFetchFunction } from './amazon-bedrock-sigv4-fetch';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

vi.mock('@ai-sdk/provider-utils', async () => {
  const actual = await vi.importActual('@ai-sdk/provider-utils');
  return {
    ...actual,
    getRuntimeEnvironmentUserAgent: vi.fn(() => 'runtime/testenv'),
  };
});

describe('createApiKeyFetchFunction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should add Authorization header with Bearer token and user-agent', async () => {
    const dummyResponse = new Response('OK', { status: 200 });
    const dummyFetch = vi.fn().mockResolvedValue(dummyResponse);
    const apiKey = 'test-api-key-123';

    const fetchFn = createApiKeyFetchFunction(apiKey, dummyFetch);

    const response = await fetchFn('http://example.com', {
      method: 'POST',
      body: '{"test": "data"}',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    expect(dummyFetch).toHaveBeenCalledWith('http://example.com', {
      method: 'POST',
      body: '{"test": "data"}',
      headers: {
        'content-type': 'application/json',
        Authorization: 'Bearer test-api-key-123',
        'user-agent': 'ai-sdk/amazon-bedrock/0.0.0-test runtime/testenv',
      },
    });
    expect(response).toBe(dummyResponse);
  });

  it('should merge Authorization header with existing headers', async () => {
    const dummyFetch = vi.fn().mockResolvedValue(new Response('OK'));
    const apiKey = 'test-api-key-456';

    const fetchFn = createApiKeyFetchFunction(apiKey, dummyFetch);

    await fetchFn('http://example.com', {
      method: 'POST',
      body: '{"test": "data"}',
      headers: {
        'Content-Type': 'application/json',
        'Custom-Header': 'custom-value',
        'X-Request-ID': 'req-123',
      },
    });

    expect(dummyFetch).toHaveBeenCalledWith('http://example.com', {
      method: 'POST',
      body: '{"test": "data"}',
      headers: {
        'content-type': 'application/json',
        'custom-header': 'custom-value',
        'x-request-id': 'req-123',
        Authorization: 'Bearer test-api-key-456',
        'user-agent': 'ai-sdk/amazon-bedrock/0.0.0-test runtime/testenv',
      },
    });
  });

  it('should work with Headers instance', async () => {
    const dummyFetch = vi.fn().mockResolvedValue(new Response('OK'));
    const apiKey = 'test-api-key-789';

    const fetchFn = createApiKeyFetchFunction(apiKey, dummyFetch);

    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    headers.set('X-Custom', 'value');

    await fetchFn('http://example.com', {
      method: 'POST',
      body: '{"test": "data"}',
      headers,
    });

    expect(dummyFetch).toHaveBeenCalledWith('http://example.com', {
      method: 'POST',
      body: '{"test": "data"}',
      headers: {
        'content-type': 'application/json',
        'x-custom': 'value',
        Authorization: 'Bearer test-api-key-789',
        'user-agent': 'ai-sdk/amazon-bedrock/0.0.0-test runtime/testenv',
      },
    });
  });

  it('should work with headers as array', async () => {
    const dummyFetch = vi.fn().mockResolvedValue(new Response('OK'));
    const apiKey = 'test-api-key-array';

    const fetchFn = createApiKeyFetchFunction(apiKey, dummyFetch);

    const headersArray: [string, string][] = [
      ['Content-Type', 'application/json'],
      ['X-Array-Header', 'array-value'],
    ];

    await fetchFn('http://example.com', {
      method: 'POST',
      body: '{"test": "data"}',
      headers: headersArray,
    });

    expect(dummyFetch).toHaveBeenCalledWith('http://example.com', {
      method: 'POST',
      body: '{"test": "data"}',
      headers: {
        'content-type': 'application/json',
        'x-array-header': 'array-value',
        Authorization: 'Bearer test-api-key-array',
        'user-agent': 'ai-sdk/amazon-bedrock/0.0.0-test runtime/testenv',
      },
    });
  });

  it('should work with GET requests', async () => {
    const dummyFetch = vi.fn().mockResolvedValue(new Response('OK'));
    const apiKey = 'test-api-key-get';

    const fetchFn = createApiKeyFetchFunction(apiKey, dummyFetch);

    await fetchFn('http://example.com', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    expect(dummyFetch).toHaveBeenCalledWith('http://example.com', {
      method: 'GET',
      headers: {
        accept: 'application/json',
        Authorization: 'Bearer test-api-key-get',
        'user-agent': 'ai-sdk/amazon-bedrock/0.0.0-test runtime/testenv',
      },
    });
  });

  it('should work when no headers are provided', async () => {
    const dummyFetch = vi.fn().mockResolvedValue(new Response('OK'));
    const apiKey = 'test-api-key-no-headers';

    const fetchFn = createApiKeyFetchFunction(apiKey, dummyFetch);

    await fetchFn('http://example.com', {
      method: 'POST',
      body: '{"test": "data"}',
    });

    expect(dummyFetch).toHaveBeenCalledWith('http://example.com', {
      method: 'POST',
      body: '{"test": "data"}',
      headers: {
        Authorization: 'Bearer test-api-key-no-headers',
        'user-agent': 'ai-sdk/amazon-bedrock/0.0.0-test runtime/testenv',
      },
    });
  });

  it('should work when init is undefined', async () => {
    const dummyFetch = vi.fn().mockResolvedValue(new Response('OK'));
    const apiKey = 'test-api-key-undefined';

    const fetchFn = createApiKeyFetchFunction(apiKey, dummyFetch);

    await fetchFn('http://example.com');

    expect(dummyFetch).toHaveBeenCalledWith('http://example.com', {
      headers: {
        Authorization: 'Bearer test-api-key-undefined',
        'user-agent': 'ai-sdk/amazon-bedrock/0.0.0-test runtime/testenv',
      },
    });
  });

  it('should override existing Authorization header', async () => {
    const dummyFetch = vi.fn().mockResolvedValue(new Response('OK'));
    const apiKey = 'test-api-key-override';

    const fetchFn = createApiKeyFetchFunction(apiKey, dummyFetch);

    await fetchFn('http://example.com', {
      method: 'POST',
      body: '{"test": "data"}',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer old-token',
      },
    });

    expect(dummyFetch).toHaveBeenCalledWith('http://example.com', {
      method: 'POST',
      body: '{"test": "data"}',
      headers: {
        'content-type': 'application/json',
        Authorization: 'Bearer test-api-key-override',
        authorization: 'Bearer old-token',
        'user-agent': 'ai-sdk/amazon-bedrock/0.0.0-test runtime/testenv',
      },
    });
  });

  it('should use default fetch when no custom fetch provided', async () => {
    const originalFetch = globalThis.fetch;
    const mockGlobalFetch = vi.fn().mockResolvedValue(new Response('OK'));
    globalThis.fetch = mockGlobalFetch;

    try {
      const apiKey = 'test-api-key-default';
      const fetchFn = createApiKeyFetchFunction(apiKey);

      await fetchFn('http://example.com', {
        method: 'POST',
        body: '{"test": "data"}',
      });

      expect(mockGlobalFetch).toHaveBeenCalledWith('http://example.com', {
        method: 'POST',
        body: '{"test": "data"}',
        headers: {
          Authorization: 'Bearer test-api-key-default',
          'user-agent': 'ai-sdk/amazon-bedrock/0.0.0-test runtime/testenv',
        },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should resolve default fetch lazily when no custom fetch provided', async () => {
    const originalFetch = globalThis.fetch;
    const initialFetch = vi.fn().mockResolvedValue(new Response('Initial'));
    const patchedFetch = vi.fn().mockResolvedValue(new Response('Patched'));

    globalThis.fetch = initialFetch;
    const fetchFn = createApiKeyFetchFunction('test-api-key-lazy');
    globalThis.fetch = patchedFetch;

    try {
      await fetchFn('http://example.com', {
        method: 'POST',
        body: '{"test": "data"}',
      });

      expect(initialFetch).not.toHaveBeenCalled();
      expect(patchedFetch).toHaveBeenCalledWith('http://example.com', {
        method: 'POST',
        body: '{"test": "data"}',
        headers: {
          Authorization: 'Bearer test-api-key-lazy',
          'user-agent': 'ai-sdk/amazon-bedrock/0.0.0-test runtime/testenv',
        },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should handle empty string API key', async () => {
    const dummyFetch = vi.fn().mockResolvedValue(new Response('OK'));
    const apiKey = '';

    const fetchFn = createApiKeyFetchFunction(apiKey, dummyFetch);

    await fetchFn('http://example.com', {
      method: 'POST',
      body: '{"test": "data"}',
    });

    expect(dummyFetch).toHaveBeenCalledWith('http://example.com', {
      method: 'POST',
      body: '{"test": "data"}',
      headers: {
        Authorization: 'Bearer ',
        'user-agent': 'ai-sdk/amazon-bedrock/0.0.0-test runtime/testenv',
      },
    });
  });

  it('should preserve request body and other properties', async () => {
    const dummyFetch = vi.fn().mockResolvedValue(new Response('OK'));
    const apiKey = 'test-api-key-preserve';

    const fetchFn = createApiKeyFetchFunction(apiKey, dummyFetch);

    const requestBody = JSON.stringify({ data: 'test' });
    await fetchFn('http://example.com', {
      method: 'PUT',
      body: requestBody,
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      cache: 'no-cache',
    });

    expect(dummyFetch).toHaveBeenCalledWith('http://example.com', {
      method: 'PUT',
      body: requestBody,
      headers: {
        'content-type': 'application/json',
        Authorization: 'Bearer test-api-key-preserve',
        'user-agent': 'ai-sdk/amazon-bedrock/0.0.0-test runtime/testenv',
      },
      credentials: 'include',
      cache: 'no-cache',
    });
  });
});
