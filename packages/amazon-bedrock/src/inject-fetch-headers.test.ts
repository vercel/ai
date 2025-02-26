import { injectFetchHeaders } from './inject-fetch-headers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('injectFetchHeaders', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('should inject custom headers into fetch request', async () => {
    const mockFetch = vi.fn().mockResolvedValue('response');
    globalThis.fetch = mockFetch;

    const customHeaders = {
      'X-Custom-Header': 'custom-value',
      Authorization: 'Bearer token',
    };

    const enhancedFetch = injectFetchHeaders(customHeaders);
    await enhancedFetch('https://api.example.com');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com',
      expect.objectContaining({
        headers: customHeaders,
      }),
    );
  });

  it('should merge custom headers with existing headers', async () => {
    const mockFetch = vi.fn().mockResolvedValue('response');
    globalThis.fetch = mockFetch;

    const customHeaders = {
      'X-Custom-Header': 'custom-value',
    };

    const existingHeaders = {
      'Content-Type': 'application/json',
    };

    const enhancedFetch = injectFetchHeaders(customHeaders);
    await enhancedFetch('https://api.example.com', {
      headers: existingHeaders,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com',
      expect.objectContaining({
        headers: {
          'content-type': 'application/json',
          'X-Custom-Header': 'custom-value',
        },
      }),
    );
  });

  it('should handle undefined headers in init', async () => {
    const mockFetch = vi.fn().mockResolvedValue('response');
    globalThis.fetch = mockFetch;

    const customHeaders = {
      'X-Custom-Header': 'custom-value',
    };

    const enhancedFetch = injectFetchHeaders(customHeaders);
    await enhancedFetch('https://api.example.com', {
      headers: undefined,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com',
      expect.objectContaining({
        headers: customHeaders,
      }),
    );
  });

  it('should handle Headers instance in init', async () => {
    const mockFetch = vi.fn().mockResolvedValue('response');
    globalThis.fetch = mockFetch;

    const customHeaders = {
      'X-Custom-Header': 'custom-value',
    };

    const existingHeaders = new Headers({
      'Content-Type': 'application/json',
    });

    const enhancedFetch = injectFetchHeaders(customHeaders);
    await enhancedFetch('https://api.example.com', {
      headers: existingHeaders,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com',
      expect.objectContaining({
        headers: {
          'content-type': 'application/json',
          'X-Custom-Header': 'custom-value',
        },
      }),
    );
  });
});
