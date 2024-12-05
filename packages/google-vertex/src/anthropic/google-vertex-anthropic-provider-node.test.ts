import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createGoogleVertexAnthropic } from './google-vertex-anthropic-provider-node';
import * as baseProvider from './google-vertex-anthropic-provider';
import { createGoogleVertexAnthropic as createGoogleVertexAnthropicOriginal } from './google-vertex-anthropic-provider';

// Mock the imported modules
vi.mock('../google-vertex-auth-google-auth-library', () => ({
  generateAuthToken: vi.fn().mockResolvedValue('mock-auth-token'),
}));

vi.mock('./google-vertex-anthropic-provider', () => ({
  createGoogleVertexAnthropic: vi.fn().mockImplementation(options => ({
    ...options,
  })),
}));

describe('google-vertex-anthropic-provider-node', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should set up default auth token header when no headers provided', () => {
    createGoogleVertexAnthropic({ project: 'test-project' });

    const mockCreateProvider = vi.mocked(
      baseProvider.createGoogleVertexAnthropic,
    );
    const passedOptions = mockCreateProvider.mock.calls[0][0];

    expect(mockCreateProvider).toHaveBeenCalledTimes(1);
    expect(typeof passedOptions?.headers).toBe('function');
  });

  it('default headers function should return auth token and anthropic version', async () => {
    createGoogleVertexAnthropic({ project: 'test-project' });

    const mockCreateProvider = vi.mocked(
      baseProvider.createGoogleVertexAnthropic,
    );
    const passedOptions = mockCreateProvider.mock.calls[0][0];
    const headersFunction = passedOptions?.headers as () => Promise<
      Record<string, string>
    >;
    const headers = await headersFunction();

    expect(headers).toEqual({
      'anthropic-version': 'vertex-2023-10-16',
      Authorization: 'Bearer mock-auth-token',
    });
  });

  it('should pass through custom headers when provided', () => {
    const customHeaders = async () => ({
      'Custom-Header': 'custom-value',
    });

    createGoogleVertexAnthropic({
      project: 'test-project',
      headers: customHeaders,
    });

    const mockCreateProvider = vi.mocked(
      baseProvider.createGoogleVertexAnthropic,
    );
    const passedOptions = mockCreateProvider.mock.calls[0][0];

    expect(mockCreateProvider).toHaveBeenCalledTimes(1);
    expect(passedOptions?.headers).toBe(customHeaders);
  });

  it('passes googleAuthOptions through to createGoogleVertexAnthropicOriginal', () => {
    const mockAuthOptions = {
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      keyFile: 'path/to/key.json',
    };

    createGoogleVertexAnthropic({
      googleAuthOptions: mockAuthOptions,
    });

    expect(createGoogleVertexAnthropicOriginal).toHaveBeenCalledWith(
      expect.objectContaining({
        googleAuthOptions: mockAuthOptions,
        headers: expect.any(Function),
      }),
    );
  });
});
