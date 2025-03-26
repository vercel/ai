import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createVertex } from './google-vertex-provider-node';
import * as baseProvider from './google-vertex-provider';
import { createVertex as createVertexOriginal } from './google-vertex-provider';

// Mock the imported modules
vi.mock('./google-vertex-auth-google-auth-library', () => ({
  generateAuthToken: vi.fn().mockResolvedValue('mock-auth-token'),
}));

vi.mock('./google-vertex-provider', () => ({
  createVertex: vi.fn().mockImplementation(options => ({
    ...options,
  })),
}));

describe('google-vertex-provider-node', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should set up default auth token header when no headers provided', () => {
    createVertex({ project: 'test-project' });

    const mockCreateVertex = vi.mocked(baseProvider.createVertex);
    const passedOptions = mockCreateVertex.mock.calls[0][0];

    expect(mockCreateVertex).toHaveBeenCalledTimes(1);
    expect(typeof passedOptions?.headers).toBe('function');
  });

  it('default headers function should return auth token', async () => {
    createVertex({ project: 'test-project' });

    const mockCreateVertex = vi.mocked(baseProvider.createVertex);
    const passedOptions = mockCreateVertex.mock.calls[0][0];
    const headersFunction = passedOptions?.headers as () => Promise<
      Record<string, string>
    >;
    const headers = await headersFunction();

    expect(headers).toEqual({
      Authorization: 'Bearer mock-auth-token',
    });
  });

  it('should pass through custom headers when provided', () => {
    const customHeaders = async () => ({
      'Custom-Header': 'custom-value',
    });

    createVertex({
      project: 'test-project',
      headers: customHeaders,
    });

    const mockCreateVertex = vi.mocked(baseProvider.createVertex);
    const passedOptions = mockCreateVertex.mock.calls[0][0];

    expect(mockCreateVertex).toHaveBeenCalledTimes(1);
    expect(passedOptions?.headers).toBe(customHeaders);
  });

  it('passes googleAuthOptions through to createVertexOriginal', () => {
    const mockAuthOptions = {
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      keyFile: 'path/to/key.json',
    };

    createVertex({
      googleAuthOptions: mockAuthOptions,
    });

    expect(createVertexOriginal).toHaveBeenCalledWith(
      expect.objectContaining({
        googleAuthOptions: mockAuthOptions,
        headers: expect.any(Function),
      }),
    );
  });
});
