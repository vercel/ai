import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createGoogleVertexXai,
  googleVertexXai,
} from './google-vertex-xai-provider-edge';
import { generateAuthToken } from '../../edge/google-vertex-auth-edge';

vi.mock('../../edge/google-vertex-auth-edge', () => ({
  generateAuthToken: vi.fn(),
}));

vi.mock('../google-vertex-xai-provider', () => ({
  createGoogleVertexXai: vi.fn(options => {
    const provider: any = vi.fn();
    provider.fetch = options.fetch;
    provider.headers = options.headers;
    return provider;
  }),
}));

vi.mock('@ai-sdk/provider-utils', () => ({
  resolve: vi.fn().mockImplementation(async value => {
    if (typeof value === 'function') return value();
    return value;
  }),
}));

describe('google-vertex-xai-provider-edge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create provider with auth wrapper', async () => {
    const provider = createGoogleVertexXai({
      project: 'test-project',
    });

    expect(provider).toBeDefined();
    const { createGoogleVertexXai: baseCreateGoogleVertexXai } = vi.mocked(
      await import('../google-vertex-xai-provider'),
    );
    expect(baseCreateGoogleVertexXai).toHaveBeenCalledWith(
      expect.objectContaining({
        project: 'test-project',
        fetch: expect.any(Function),
        headers: undefined,
      }),
    );
  });

  it('should generate auth token and add to request headers', async () => {
    vi.mocked(generateAuthToken).mockResolvedValue('mock-auth-token');
    const mockFetch = vi.fn().mockResolvedValue(new Response('{}'));
    global.fetch = mockFetch;

    const provider = createGoogleVertexXai({
      project: 'test-project',
    });

    const customFetch = (provider as any).fetch;
    expect(customFetch).toBeDefined();

    await customFetch('https://example.com/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(generateAuthToken).toHaveBeenCalledWith(undefined);

    expect(mockFetch).toHaveBeenCalledWith('https://example.com/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer mock-auth-token',
      },
    });
  });

  it('should pass googleCredentials to generateAuthToken', async () => {
    vi.mocked(generateAuthToken).mockResolvedValue('mock-auth-token');
    const mockFetch = vi.fn().mockResolvedValue(new Response('{}'));
    global.fetch = mockFetch;

    const googleCredentials = {
      clientEmail: 'test@example.com',
      privateKey: 'test-key',
    };
    const provider = createGoogleVertexXai({
      project: 'test-project',
      googleCredentials,
    });

    const customFetch = (provider as any).fetch;
    await customFetch('https://example.com/test', {});

    expect(generateAuthToken).toHaveBeenCalledWith(googleCredentials);
  });

  it('should merge custom headers with auth header', async () => {
    vi.mocked(generateAuthToken).mockResolvedValue('mock-auth-token');
    const mockFetch = vi.fn().mockResolvedValue(new Response('{}'));
    global.fetch = mockFetch;

    const customHeaders = { 'X-Custom': 'header-value' };
    const provider = createGoogleVertexXai({
      project: 'test-project',
      headers: customHeaders,
    });

    const customFetch = (provider as any).fetch;
    await customFetch('https://example.com/test', {
      headers: { 'Content-Type': 'application/json' },
    });

    expect(mockFetch).toHaveBeenCalledWith('https://example.com/test', {
      headers: {
        'Content-Type': 'application/json',
        'X-Custom': 'header-value',
        Authorization: 'Bearer mock-auth-token',
      },
    });
  });

  it('should use custom fetch when provided', async () => {
    vi.mocked(generateAuthToken).mockResolvedValue('mock-auth-token');
    const customFetch = vi.fn().mockResolvedValue(new Response('{}'));

    const provider = createGoogleVertexXai({
      project: 'test-project',
      fetch: customFetch,
    });

    const authFetch = (provider as any).fetch;
    await authFetch('https://example.com/test', {});

    expect(customFetch).toHaveBeenCalledWith(
      'https://example.com/test',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer mock-auth-token',
        }),
      }),
    );
  });

  it('should export default googleVertexXai instance', () => {
    expect(googleVertexXai).toBeDefined();
    expect(typeof googleVertexXai).toBe('function');
  });
});
