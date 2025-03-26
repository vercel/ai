import { resolve } from '@ai-sdk/provider-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createVertex as createVertexOriginal } from './google-vertex-provider';
import { createVertex as createVertexNode } from './google-vertex-provider-node';
import { generateAuthToken } from './google-vertex-auth-google-auth-library';

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

  it('default headers function should return auth token', async () => {
    createVertexNode({ project: 'test-project' });

    expect(createVertexOriginal).toHaveBeenCalledTimes(1);
    const passedOptions = vi.mocked(createVertexOriginal).mock.calls[0][0];

    expect(typeof passedOptions?.headers).toBe('function');
    expect(await resolve(passedOptions?.headers)).toStrictEqual({
      Authorization: 'Bearer mock-auth-token',
    });
  });

  it('should use custom headers in addition to auth token when provided', async () => {
    createVertexNode({
      project: 'test-project',
      headers: async () => ({
        'Custom-Header': 'custom-value',
      }),
    });

    expect(createVertexOriginal).toHaveBeenCalledTimes(1);
    const passedOptions = vi.mocked(createVertexOriginal).mock.calls[0][0];

    expect(typeof passedOptions?.headers).toBe('function');
    expect(await resolve(passedOptions?.headers)).toEqual({
      Authorization: 'Bearer mock-auth-token',
      'Custom-Header': 'custom-value',
    });
  });

  it('passes googleAuthOptions to generateAuthToken', async () => {
    createVertexNode({
      googleAuthOptions: {
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        keyFile: 'path/to/key.json',
      },
    });

    expect(createVertexOriginal).toHaveBeenCalledTimes(1);
    const passedOptions = vi.mocked(createVertexOriginal).mock.calls[0][0];
    expect(typeof passedOptions?.headers).toBe('function');

    await resolve(passedOptions?.headers); // call the headers function

    const authLibraryArg = vi.mocked(generateAuthToken).mock.calls[0][0];

    expect(authLibraryArg).toStrictEqual({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      keyFile: 'path/to/key.json',
    });
  });
});
