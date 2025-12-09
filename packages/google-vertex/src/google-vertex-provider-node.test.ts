import { resolve } from '@ai-sdk/provider-utils';
import { createVertex as createVertexOriginal } from './google-vertex-provider';
import { createVertex as createVertexNode } from './google-vertex-provider-node';
import { generateAuthToken } from './google-vertex-auth-google-auth-library';
import { describe, beforeEach, expect, it, vi } from 'vitest';

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

    await resolve(passedOptions?.headers); // call the headers function

    expect(generateAuthToken).toHaveBeenCalledWith({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      keyFile: 'path/to/key.json',
    });
  });

  describe('Express Mode', () => {
    it('should use API key header when apiKey is provided', async () => {
      createVertexNode({
        project: 'test-project',
        apiKey: 'test-api-key',
      });

      expect(createVertexOriginal).toHaveBeenCalledTimes(1);
      const passedOptions = vi.mocked(createVertexOriginal).mock.calls[0][0];

      expect(await resolve(passedOptions?.headers)).toStrictEqual({
        'x-goog-api-key': 'test-api-key',
      });
    });

    it('should merge custom headers with API key in Express Mode', async () => {
      createVertexNode({
        project: 'test-project',
        apiKey: 'test-api-key',
        headers: async () => ({
          'Custom-Header': 'custom-value',
        }),
      });

      const passedOptions = vi.mocked(createVertexOriginal).mock.calls[0][0];

      expect(await resolve(passedOptions?.headers)).toEqual({
        'x-goog-api-key': 'test-api-key',
        'Custom-Header': 'custom-value',
      });
    });

    it('should prioritize API key over OAuth when both apiKey and googleAuthOptions are provided', async () => {
      createVertexNode({
        project: 'test-project',
        apiKey: 'test-api-key',
        googleAuthOptions: {
          keyFile: 'path/to/key.json',
        },
      });

      const passedOptions = vi.mocked(createVertexOriginal).mock.calls[0][0];
      const headers = await resolve(passedOptions?.headers);

      expect(headers).toHaveProperty('x-goog-api-key', 'test-api-key');
      expect(headers).not.toHaveProperty('Authorization');
      expect(generateAuthToken).not.toHaveBeenCalled();
    });

    it('should not call generateAuthToken when API key is present', async () => {
      createVertexNode({
        project: 'test-project',
        apiKey: 'test-api-key',
      });

      const passedOptions = vi.mocked(createVertexOriginal).mock.calls[0][0];
      await resolve(passedOptions?.headers);

      expect(generateAuthToken).not.toHaveBeenCalled();
    });

    it('should use OAuth mode when apiKey is not provided', async () => {
      createVertexNode({
        project: 'test-project',
      });

      const passedOptions = vi.mocked(createVertexOriginal).mock.calls[0][0];
      const headers = await resolve(passedOptions?.headers);

      expect(headers).toHaveProperty('Authorization', 'Bearer mock-auth-token');
      expect(headers).not.toHaveProperty('x-goog-api-key');
      expect(generateAuthToken).toHaveBeenCalled();
    });
  });
});
